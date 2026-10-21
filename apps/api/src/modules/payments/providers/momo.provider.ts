import { createHmac, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  postJson,
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
  type WebhookStatus,
} from '../provider.js';

interface MoMoConfig {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  endpoint: string;
  partnerName?: string;
  storeId?: string;
  requestType?: string;
}

interface MoMoCreateResponse {
  resultCode: number;
  message: string;
  payUrl?: string;
  deeplink?: string;
  qrCodeUrl?: string;
  shortLink?: string;
}

/**
 * MoMo Payment Platform v2 (/v2/gateway/api/create). Chữ ký HMAC-SHA256 trên chuỗi tham số theo thứ tự chữ cái,
 * IPN POST JSON, trả 204 để xác nhận đã nhận. Tài liệu: https://developers.momo.vn/v3/docs/payment/api/wallet/onetime
 * Cấu hình: { partnerCode, accessKey, secretKey, endpoint, partnerName?, storeId?, requestType? }
 * requestType: 'captureWallet' (ví MoMo), 'payWithMethod' (cho khách chọn ví/thẻ/ATM; MoMo có thể hiển thị Apple Pay nếu merchant được bật).
 */
@Injectable()
export class MoMoProvider implements PaymentProvider {
  readonly code = 'momo' as const;
  readonly displayName = 'MoMo';

  supportsMethod(method: string): boolean {
    return method === 'MOMO' || method === 'APPLE_PAY';
  }

  private cfg(config: ProviderConfig): MoMoConfig {
    const c = config as Partial<MoMoConfig>;
    if (!c.partnerCode || !c.accessKey || !c.secretKey) throw new Error('MoMo: thiếu partnerCode/accessKey/secretKey');
    return { partnerCode: c.partnerCode, accessKey: c.accessKey, secretKey: c.secretKey, endpoint: c.endpoint ?? 'https://test-payment.momo.vn', partnerName: c.partnerName ?? 'Nha hang Da Lan', storeId: c.storeId ?? 'DALAN', requestType: c.requestType };
  }

  private sign(secret: string, fields: Record<string, string | number>): string {
    const raw = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${fields[k]}`)
      .join('&');
    return createHmac('sha256', secret).update(raw).digest('hex');
  }

  async createIntent(input: CreateIntentInput, config: ProviderConfig): Promise<CreateIntentResult> {
    const c = this.cfg(config);
    const orderId = input.intentId.replace(/-/g, '');
    const requestId = orderId;
    const requestType = c.requestType ?? (input.method === 'APPLE_PAY' ? 'payWithMethod' : 'captureWallet');
    const extraData = Buffer.from(JSON.stringify({ billId: input.billId ?? null, channel: input.channel })).toString('base64');
    const orderInfo = input.description.slice(0, 200);
    const signature = this.sign(c.secretKey, {
      accessKey: c.accessKey,
      amount: input.amount,
      extraData,
      ipnUrl: input.ipnUrl,
      orderId,
      orderInfo,
      partnerCode: c.partnerCode,
      redirectUrl: input.returnUrl,
      requestId,
      requestType,
    });
    const res = await postJson<MoMoCreateResponse>(`${c.endpoint}/v2/gateway/api/create`, {
      partnerCode: c.partnerCode,
      partnerName: c.partnerName,
      storeId: c.storeId,
      requestId,
      amount: input.amount,
      orderId,
      orderInfo,
      redirectUrl: input.returnUrl,
      ipnUrl: input.ipnUrl,
      lang: 'vi',
      requestType,
      autoCapture: true,
      extraData,
      signature,
    });
    if (res.resultCode !== 0) throw new Error(`MoMo từ chối tạo giao dịch (${res.resultCode}): ${res.message}`);
    return { providerIntentId: orderId, redirectUrl: res.payUrl ?? null, deeplink: res.deeplink ?? null, qrCode: res.qrCodeUrl ?? null, expiresAt: new Date(Date.now() + 100 * 60_000), raw: res };
  }

  extractIntentId(ctx: WebhookContext): string | null {
    const b = stringifyRecord(ctx.body);
    return b.orderId ?? null;
  }

  verifyWebhook(ctx: WebhookContext, config: ProviderConfig): WebhookResult {
    const c = this.cfg(config);
    const b = stringifyRecord(ctx.body);
    const expected = this.sign(c.secretKey, {
      accessKey: c.accessKey,
      amount: b.amount ?? '',
      extraData: b.extraData ?? '',
      message: b.message ?? '',
      orderId: b.orderId ?? '',
      orderInfo: b.orderInfo ?? '',
      orderType: b.orderType ?? '',
      partnerCode: b.partnerCode ?? '',
      payType: b.payType ?? '',
      requestId: b.requestId ?? '',
      responseTime: b.responseTime ?? '',
      resultCode: b.resultCode ?? '',
      transId: b.transId ?? '',
    });
    const ok = !!b.signature && b.signature === expected;
    const code = Number(b.resultCode);
    const status: WebhookStatus = code === 0 ? 'SUCCEEDED' : code === 9000 ? 'PENDING' : code === 1006 || code === 1005 ? 'CANCELLED' : 'FAILED';
    return { ok, reason: ok ? undefined : 'Chữ ký MoMo không hợp lệ', providerIntentId: b.orderId ?? null, status, externalRef: b.transId ?? null, amount: b.amount ? Number(b.amount) : null, raw: b };
  }

  ack(code: AckCode): AckResponse {
    // MoMo coi HTTP 204 là đã nhận; trả 204 cả khi đã xử lý trước đó để tránh gửi lại.
    return { status: code === 'OK' || code === 'ALREADY_PROCESSED' ? 204 : 400, contentType: 'application/json', body: '' };
  }

  async query(providerIntentId: string, config: ProviderConfig): Promise<QueryResult> {
    const c = this.cfg(config);
    const requestId = randomUUID().replace(/-/g, '');
    const signature = this.sign(c.secretKey, { accessKey: c.accessKey, orderId: providerIntentId, partnerCode: c.partnerCode, requestId });
    const res = await postJson<{ resultCode: number; transId?: number; amount?: number; message: string }>(`${c.endpoint}/v2/gateway/api/query`, { partnerCode: c.partnerCode, requestId, orderId: providerIntentId, lang: 'vi', signature });
    const status: WebhookStatus = res.resultCode === 0 ? 'SUCCEEDED' : res.resultCode === 1000 || res.resultCode === 9000 ? 'PENDING' : 'FAILED';
    return { status, externalRef: res.transId ? String(res.transId) : null, amount: res.amount ?? null, raw: res };
  }

  async refund(_providerIntentId: string, amount: number, reason: string, config: ProviderConfig, meta: IntentMeta): Promise<RefundResult> {
    const c = this.cfg(config);
    if (!meta.externalRef) return { ok: false, message: 'Thiếu transId MoMo để hoàn tiền', raw: null };
    const orderId = `RF${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const requestId = orderId;
    const transId = Number(meta.externalRef);
    const description = reason.slice(0, 100);
    const signature = this.sign(c.secretKey, { accessKey: c.accessKey, amount, description, orderId, partnerCode: c.partnerCode, requestId, transId });
    const res = await postJson<{ resultCode: number; transId?: number; message: string }>(`${c.endpoint}/v2/gateway/api/refund`, { partnerCode: c.partnerCode, orderId, requestId, amount, transId, lang: 'vi', description, signature });
    return { ok: res.resultCode === 0, externalRef: res.transId ? String(res.transId) : null, message: res.message, raw: res };
  }
}
