import { createHmac, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { removeDiacritics } from '@dalan/domain';
import {
  postJson,
  stringifyRecord,
  vnTimestamp,
  type AckCode,
  type AckResponse,
  type CreateIntentInput,
  type CreateIntentResult,
  type IntentMeta,
  type PaymentProvider,
  type ProviderConfig,
  type QueryResult,
  type RefundResult,
  type WebhookContext,
  type WebhookResult,
} from '../provider.js';

interface VnPayConfig {
  tmnCode: string;
  hashSecret: string;
  payUrl: string;
  apiUrl: string;
  bankCode?: string;
  expireMinutes?: number;
}

/**
 * VNPay cổng thanh toán (vpcpay 2.1.0): redirect sang VNPay, IPN GET về API, chữ ký HMAC-SHA512.
 * Tài liệu: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
 * Cấu hình: { tmnCode, hashSecret, payUrl, apiUrl, bankCode?, expireMinutes? }
 */
@Injectable()
export class VnPayProvider implements PaymentProvider {
  readonly code = 'vnpay' as const;
  readonly displayName = 'VNPay';

  supportsMethod(method: string): boolean {
    return method === 'VNPAY';
  }

  private cfg(config: ProviderConfig): VnPayConfig {
    const c = config as Partial<VnPayConfig>;
    if (!c.tmnCode || !c.hashSecret) throw new Error('VNPay: thiếu tmnCode/hashSecret');
    return {
      tmnCode: c.tmnCode,
      hashSecret: c.hashSecret,
      payUrl: c.payUrl ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      apiUrl: c.apiUrl ?? 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      bankCode: c.bankCode,
      expireMinutes: c.expireMinutes ?? 15,
    };
  }

  /** Sắp xếp tham số, mã hóa URL (khoảng trắng thành +) như mã mẫu chính thức của VNPay. */
  private signedQuery(params: Record<string, string>): string {
    return Object.keys(params)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k] ?? '').replace(/%20/g, '+')}`)
      .join('&');
  }

  private hmac(secret: string, data: string): string {
    return createHmac('sha512', secret).update(Buffer.from(data, 'utf8')).digest('hex');
  }

  async createIntent(input: CreateIntentInput, config: ProviderConfig): Promise<CreateIntentResult> {
    const c = this.cfg(config);
    const txnRef = input.intentId.replace(/-/g, '');
    const now = new Date();
    const expires = new Date(now.getTime() + (c.expireMinutes ?? 15) * 60_000);
    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: c.tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: removeDiacritics(input.description).replace(/[^A-Za-z0-9 .,-]/g, ' ').slice(0, 200),
      vnp_OrderType: 'other',
      vnp_Amount: String(input.amount * 100),
      vnp_ReturnUrl: input.returnUrl,
      vnp_IpAddr: input.clientIp || '127.0.0.1',
      vnp_CreateDate: vnTimestamp(now),
      vnp_ExpireDate: vnTimestamp(expires),
    };
    if (c.bankCode) params.vnp_BankCode = c.bankCode;
    const query = this.signedQuery(params);
    const secureHash = this.hmac(c.hashSecret, query);
    return {
      providerIntentId: txnRef,
      redirectUrl: `${c.payUrl}?${query}&vnp_SecureHash=${secureHash}`,
      expiresAt: expires,
      raw: { vnp_TxnRef: txnRef, vnp_CreateDate: params.vnp_CreateDate },
    };
  }

  extractIntentId(ctx: WebhookContext): string | null {
    const params = ctx.method === 'GET' ? stringifyRecord(ctx.query) : stringifyRecord(ctx.body);
    return params.vnp_TxnRef ?? null;
  }

  verifyWebhook(ctx: WebhookContext, config: ProviderConfig): WebhookResult {
    const c = this.cfg(config);
    const params = ctx.method === 'GET' ? stringifyRecord(ctx.query) : stringifyRecord(ctx.body);
    const received = (params.vnp_SecureHash ?? '').toLowerCase();
    const toSign: Record<string, string> = { ...params };
    delete toSign.vnp_SecureHash;
    delete toSign.vnp_SecureHashType;
    const expected = this.hmac(c.hashSecret, this.signedQuery(toSign));
    const ok = received.length > 0 && received === expected;
    const responseCode = params.vnp_ResponseCode;
    const txnStatus = params.vnp_TransactionStatus;
    const status = responseCode === '00' && (txnStatus === undefined || txnStatus === '00') ? 'SUCCEEDED' : responseCode === '24' ? 'CANCELLED' : 'FAILED';
    return {
      ok,
      reason: ok ? undefined : 'vnp_SecureHash không hợp lệ',
      providerIntentId: params.vnp_TxnRef ?? null,
      status,
      externalRef: params.vnp_TransactionNo ?? null,
      amount: params.vnp_Amount ? Number(params.vnp_Amount) / 100 : null,
      raw: params,
    };
  }

  ack(code: AckCode): AckResponse {
    const map: Record<AckCode, [string, string]> = {
      OK: ['00', 'Confirm Success'],
      ALREADY_PROCESSED: ['02', 'Order already confirmed'],
      NOT_FOUND: ['01', 'Order not found'],
      AMOUNT_MISMATCH: ['04', 'Invalid amount'],
      INVALID_SIGNATURE: ['97', 'Invalid signature'],
      ERROR: ['99', 'Unknown error'],
    };
    const [RspCode, Message] = map[code];
    return { status: 200, contentType: 'application/json', body: JSON.stringify({ RspCode, Message }) };
  }

  async query(providerIntentId: string, config: ProviderConfig, meta: IntentMeta): Promise<QueryResult> {
    const c = this.cfg(config);
    const requestId = randomUUID().replace(/-/g, '');
    const createDate = vnTimestamp();
    const txnDate = vnTimestamp(meta.createdAt);
    const orderInfo = `Truy van ${providerIntentId}`;
    const ip = '127.0.0.1';
    const data = `${requestId}|2.1.0|querydr|${c.tmnCode}|${providerIntentId}|${txnDate}|${createDate}|${ip}|${orderInfo}`;
    const res = await postJson<Record<string, string>>(c.apiUrl, {
      vnp_RequestId: requestId,
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: c.tmnCode,
      vnp_TxnRef: providerIntentId,
      vnp_OrderInfo: orderInfo,
      vnp_TransactionDate: txnDate,
      vnp_CreateDate: createDate,
      vnp_IpAddr: ip,
      vnp_SecureHash: this.hmac(c.hashSecret, data),
    });
    const ok = res.vnp_ResponseCode === '00' && res.vnp_TransactionStatus === '00';
    return { status: ok ? 'SUCCEEDED' : res.vnp_TransactionStatus === '01' ? 'PENDING' : 'FAILED', externalRef: res.vnp_TransactionNo ?? null, amount: res.vnp_Amount ? Number(res.vnp_Amount) / 100 : null, raw: res };
  }

  async refund(providerIntentId: string, amount: number, reason: string, config: ProviderConfig, meta: IntentMeta): Promise<RefundResult> {
    const c = this.cfg(config);
    const requestId = randomUUID().replace(/-/g, '');
    const createDate = vnTimestamp();
    const txnDate = vnTimestamp(meta.createdAt);
    const transactionType = amount >= meta.amount ? '02' : '03';
    const createBy = 'dalan-os';
    const ip = '127.0.0.1';
    const orderInfo = removeDiacritics(reason).slice(0, 200);
    const amountX100 = String(amount * 100);
    const transactionNo = meta.externalRef ?? '0';
    const data = `${requestId}|2.1.0|refund|${c.tmnCode}|${transactionType}|${providerIntentId}|${amountX100}|${transactionNo}|${txnDate}|${createBy}|${createDate}|${ip}|${orderInfo}`;
    const res = await postJson<Record<string, string>>(c.apiUrl, {
      vnp_RequestId: requestId,
      vnp_Version: '2.1.0',
      vnp_Command: 'refund',
      vnp_TmnCode: c.tmnCode,
      vnp_TransactionType: transactionType,
      vnp_TxnRef: providerIntentId,
      vnp_Amount: amountX100,
      vnp_TransactionNo: transactionNo,
      vnp_TransactionDate: txnDate,
      vnp_CreateBy: createBy,
      vnp_CreateDate: createDate,
      vnp_IpAddr: ip,
      vnp_OrderInfo: orderInfo,
      vnp_SecureHash: this.hmac(c.hashSecret, data),
    });
    return { ok: res.vnp_ResponseCode === '00', externalRef: res.vnp_TransactionNo ?? null, message: res.vnp_Message, raw: res };
  }
}
