import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { removeDiacritics } from '@dalan/domain';
import {
  stringifyRecord,
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

interface OnePayConfig {
  merchant: string;
  accessCode: string;
  /** Secure secret dạng hex do OnePay cấp */
  secureSecret: string;
  payUrl: string;
  queryUrl: string;
  /** Tài khoản truy vấn/hoàn tiền (vpc_User/vpc_Password) do OnePay cấp cho API queryDR/refund */
  apiUser?: string;
  apiPassword?: string;
}

/**
 * OnePay (cổng thẻ quốc tế và nội địa, có Apple Pay trên trang thanh toán hosted theo ADR 0007).
 * Tham số vpc_*, chữ ký HMAC-SHA256 (khóa hex) trên chuỗi tham số sắp xếp, IPN (vpc_CallbackURL) trả về
 * văn bản `responsecode=1&desc=confirm-success`. Tài liệu: https://mtf.onepay.vn/developer/
 * Cấu hình: { merchant, accessCode, secureSecret, payUrl, queryUrl, apiUser?, apiPassword? }
 * TODO: xác nhận với OnePay tham số bật Apple Pay trên hosted page cho merchant (vpc_CardList) khi ký hợp đồng.
 */
@Injectable()
export class OnePayProvider implements PaymentProvider {
  readonly code = 'onepay' as const;
  readonly displayName = 'OnePay';

  supportsMethod(method: string): boolean {
    return method === 'APPLE_PAY' || method === 'GOOGLE_PAY' || method === 'CARD_TERMINAL';
  }

  private cfg(config: ProviderConfig): OnePayConfig {
    const c = config as Partial<OnePayConfig>;
    if (!c.merchant || !c.accessCode || !c.secureSecret) throw new Error('OnePay: thiếu merchant/accessCode/secureSecret');
    return {
      merchant: c.merchant,
      accessCode: c.accessCode,
      secureSecret: c.secureSecret,
      payUrl: c.payUrl ?? 'https://mtf.onepay.vn/paygate/vpcpay.op',
      queryUrl: c.queryUrl ?? 'https://mtf.onepay.vn/paygate/vpcdps.op',
      apiUser: c.apiUser,
      apiPassword: c.apiPassword,
    };
  }

  /** Chuỗi ký: các tham số bắt đầu bằng vpc_ hoặc user_, sắp xếp theo khóa, nối k=v& với giá trị thô. */
  private hash(secretHex: string, params: Record<string, string>): string {
    const data = Object.keys(params)
      .filter((k) => (k.startsWith('vpc_') || k.startsWith('user_')) && k !== 'vpc_SecureHash' && k !== 'vpc_SecureHashType' && params[k] !== '')
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return createHmac('sha256', Buffer.from(secretHex, 'hex')).update(data, 'utf8').digest('hex').toUpperCase();
  }

  async createIntent(input: CreateIntentInput, config: ProviderConfig): Promise<CreateIntentResult> {
    const c = this.cfg(config);
    const merchTxnRef = input.intentId.replace(/-/g, '');
    const params: Record<string, string> = {
      vpc_Version: '2',
      vpc_Command: 'pay',
      vpc_AccessCode: c.accessCode,
      vpc_Merchant: c.merchant,
      vpc_MerchTxnRef: merchTxnRef,
      vpc_OrderInfo: removeDiacritics(input.description).replace(/[^A-Za-z0-9 .,-]/g, ' ').slice(0, 34),
      vpc_Amount: String(input.amount * 100),
      vpc_Locale: 'vn',
      vpc_ReturnURL: input.returnUrl,
      vpc_TicketNo: input.clientIp || '127.0.0.1',
      vpc_Currency: 'VND',
      vpc_CallbackURL: input.ipnUrl,
    };
    if (input.method === 'APPLE_PAY') params.vpc_CardList = 'APPLEPAY'; // TODO: xác nhận tên tham số với OnePay
    const secureHash = this.hash(c.secureSecret, params);
    const query = Object.keys(params)
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k] ?? '')}`)
      .join('&');
    return { providerIntentId: merchTxnRef, redirectUrl: `${c.payUrl}?${query}&vpc_SecureHash=${secureHash}`, expiresAt: new Date(Date.now() + 15 * 60_000), raw: { vpc_MerchTxnRef: merchTxnRef } };
  }

  extractIntentId(ctx: WebhookContext): string | null {
    const p = ctx.method === 'GET' ? stringifyRecord(ctx.query) : stringifyRecord(ctx.body);
    return p.vpc_MerchTxnRef ?? null;
  }

  verifyWebhook(ctx: WebhookContext, config: ProviderConfig): WebhookResult {
    const c = this.cfg(config);
    const p = ctx.method === 'GET' ? stringifyRecord(ctx.query) : stringifyRecord(ctx.body);
    const received = (p.vpc_SecureHash ?? '').toUpperCase();
    const ok = received.length > 0 && received === this.hash(c.secureSecret, p);
    const rc = p.vpc_TxnResponseCode;
    const status = rc === '0' ? 'SUCCEEDED' : rc === '99' ? 'CANCELLED' : 'FAILED';
    return { ok, reason: ok ? undefined : 'vpc_SecureHash không hợp lệ', providerIntentId: p.vpc_MerchTxnRef ?? null, status, externalRef: p.vpc_TransactionNo ?? null, amount: p.vpc_Amount ? Number(p.vpc_Amount) / 100 : null, raw: p };
  }

  ack(code: AckCode): AckResponse {
    const ok = code === 'OK' || code === 'ALREADY_PROCESSED';
    return { status: 200, contentType: 'text/plain', body: ok ? 'responsecode=1&desc=confirm-success' : 'responsecode=0&desc=confirm-fail' };
  }

  async query(providerIntentId: string, config: ProviderConfig): Promise<QueryResult> {
    const c = this.cfg(config);
    if (!c.apiUser || !c.apiPassword) throw new Error('OnePay: cần apiUser/apiPassword để truy vấn giao dịch');
    const params: Record<string, string> = { vpc_Version: '2', vpc_Command: 'queryDR', vpc_AccessCode: c.accessCode, vpc_Merchant: c.merchant, vpc_MerchTxnRef: providerIntentId, vpc_User: c.apiUser, vpc_Password: c.apiPassword };
    params.vpc_SecureHash = this.hash(c.secureSecret, params);
    const res = await fetch(c.queryUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    const text = await res.text();
    const out = Object.fromEntries(new URLSearchParams(text));
    const ok = out.vpc_DRExists === 'Y' && out.vpc_TxnResponseCode === '0';
    return { status: ok ? 'SUCCEEDED' : out.vpc_DRExists === 'N' ? 'PENDING' : 'FAILED', externalRef: out.vpc_TransactionNo ?? null, amount: out.vpc_Amount ? Number(out.vpc_Amount) / 100 : null, raw: out };
  }

  async refund(providerIntentId: string, amount: number, _reason: string, config: ProviderConfig, meta: IntentMeta): Promise<RefundResult> {
    const c = this.cfg(config);
    if (!c.apiUser || !c.apiPassword) return { ok: false, message: 'OnePay: cần apiUser/apiPassword để hoàn tiền (TODO khi ký hợp đồng)', raw: null };
    const params: Record<string, string> = { vpc_Version: '2', vpc_Command: 'refund', vpc_AccessCode: c.accessCode, vpc_Merchant: c.merchant, vpc_MerchTxnRef: `RF${providerIntentId}`.slice(0, 40), vpc_TransactionNo: meta.externalRef ?? '', vpc_Amount: String(amount * 100), vpc_User: c.apiUser, vpc_Password: c.apiPassword };
    params.vpc_SecureHash = this.hash(c.secureSecret, params);
    const res = await fetch(c.queryUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    const out = Object.fromEntries(new URLSearchParams(await res.text()));
    return { ok: out.vpc_TxnResponseCode === '0', externalRef: out.vpc_TransactionNo ?? null, message: out.vpc_Message, raw: out };
  }
}
