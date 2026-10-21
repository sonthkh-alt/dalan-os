import { createHmac, randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  postForm,
  vnYymmdd,
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

interface ZaloPayConfig {
  appId: number;
  key1: string;
  key2: string;
  endpoint: string;
  appUser?: string;
}

interface ZaloCreateResponse {
  return_code: number;
  return_message: string;
  sub_return_code?: number;
  sub_return_message?: string;
  order_url?: string;
  zp_trans_token?: string;
  order_token?: string;
  qr_code?: string;
}

/**
 * ZaloPay Gateway v2: tạo đơn (/v2/create) với mac HMAC-SHA256(key1), callback POST {data, mac} xác thực bằng key2.
 * Tài liệu: https://docs.zalopay.vn/v2/general/overview.html
 * Cấu hình: { appId, key1, key2, endpoint, appUser? }
 */
@Injectable()
export class ZaloPayProvider implements PaymentProvider {
  readonly code = 'zalopay' as const;
  readonly displayName = 'ZaloPay';

  supportsMethod(method: string): boolean {
    return method === 'ZALOPAY';
  }

  private cfg(config: ProviderConfig): ZaloPayConfig {
    const c = config as Partial<ZaloPayConfig>;
    if (!c.appId || !c.key1 || !c.key2) throw new Error('ZaloPay: thiếu appId/key1/key2');
    return { appId: Number(c.appId), key1: c.key1, key2: c.key2, endpoint: c.endpoint ?? 'https://sb-openapi.zalopay.vn', appUser: c.appUser ?? 'dalan' };
  }

  private mac(key: string, data: string): string {
    return createHmac('sha256', key).update(data).digest('hex');
  }

  async createIntent(input: CreateIntentInput, config: ProviderConfig): Promise<CreateIntentResult> {
    const c = this.cfg(config);
    const appTime = Date.now();
    const appTransId = `${vnYymmdd()}_${input.intentId.replace(/-/g, '')}`;
    const embedData = JSON.stringify({ redirecturl: input.returnUrl, billId: input.billId ?? null });
    const item = JSON.stringify([{ itemid: input.billId ?? input.intentId, itemname: input.description.slice(0, 100), itemprice: input.amount, itemquantity: 1 }]);
    const mac = this.mac(c.key1, `${c.appId}|${appTransId}|${c.appUser}|${input.amount}|${appTime}|${embedData}|${item}`);
    const res = await postForm<ZaloCreateResponse>(`${c.endpoint}/v2/create`, {
      app_id: String(c.appId),
      app_user: c.appUser ?? 'dalan',
      app_time: String(appTime),
      amount: String(input.amount),
      app_trans_id: appTransId,
      embed_data: embedData,
      item,
      description: input.description.slice(0, 256),
      bank_code: '',
      callback_url: input.ipnUrl,
      mac,
    });
    if (res.return_code !== 1) throw new Error(`ZaloPay từ chối tạo đơn (${res.return_code}/${res.sub_return_code}): ${res.sub_return_message ?? res.return_message}`);
    return { providerIntentId: appTransId, redirectUrl: res.order_url ?? null, qrCode: res.qr_code ?? null, deeplink: res.order_url ?? null, expiresAt: new Date(appTime + 15 * 60_000), raw: res };
  }

  private parseData(ctx: WebhookContext): { data: string; mac: string; parsed: Record<string, unknown> } | null {
    const b = (ctx.body ?? {}) as { data?: string; mac?: string };
    if (!b.data || !b.mac) return null;
    try {
      return { data: b.data, mac: b.mac, parsed: JSON.parse(b.data) as Record<string, unknown> };
    } catch {
      return null;
    }
  }

  extractIntentId(ctx: WebhookContext): string | null {
    const d = this.parseData(ctx);
    return (d?.parsed.app_trans_id as string | undefined) ?? null;
  }

  verifyWebhook(ctx: WebhookContext, config: ProviderConfig): WebhookResult {
    const c = this.cfg(config);
    const d = this.parseData(ctx);
    if (!d) return { ok: false, reason: 'Thiếu data/mac', providerIntentId: null, status: 'FAILED', raw: ctx.body };
    const ok = this.mac(c.key2, d.data) === d.mac;
    // ZaloPay chỉ gọi callback khi thanh toán thành công
    return { ok, reason: ok ? undefined : 'mac ZaloPay không khớp', providerIntentId: String(d.parsed.app_trans_id ?? ''), status: 'SUCCEEDED', externalRef: d.parsed.zp_trans_id ? String(d.parsed.zp_trans_id) : null, amount: d.parsed.amount ? Number(d.parsed.amount) : null, raw: d.parsed };
  }

  ack(code: AckCode): AckResponse {
    // return_code 1: thành công; -1: mac sai (ZaloPay không gửi lại); 0: lỗi khác (ZaloPay gửi lại tối đa 3 lần)
    const body = code === 'OK' || code === 'ALREADY_PROCESSED' ? { return_code: 1, return_message: 'success' } : code === 'INVALID_SIGNATURE' ? { return_code: -1, return_message: 'mac not equal' } : { return_code: 0, return_message: code.toLowerCase() };
    return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
  }

  async query(providerIntentId: string, config: ProviderConfig): Promise<QueryResult> {
    const c = this.cfg(config);
    const res = await postForm<{ return_code: number; return_message: string; zp_trans_id?: number; amount?: number; is_processing?: boolean }>(`${c.endpoint}/v2/query`, {
      app_id: String(c.appId),
      app_trans_id: providerIntentId,
      mac: this.mac(c.key1, `${c.appId}|${providerIntentId}|${c.key1}`),
    });
    const status = res.return_code === 1 ? 'SUCCEEDED' : res.return_code === 3 || res.is_processing ? 'PENDING' : 'FAILED';
    return { status, externalRef: res.zp_trans_id ? String(res.zp_trans_id) : null, amount: res.amount ?? null, raw: res };
  }

  async refund(_providerIntentId: string, amount: number, reason: string, config: ProviderConfig, meta: IntentMeta): Promise<RefundResult> {
    const c = this.cfg(config);
    if (!meta.externalRef) return { ok: false, message: 'Thiếu zp_trans_id để hoàn tiền', raw: null };
    const timestamp = Date.now();
    const mRefundId = `${vnYymmdd()}_${c.appId}_${timestamp}${randomInt(100, 999)}`;
    const description = reason.slice(0, 100);
    const res = await postForm<{ return_code: number; return_message: string; refund_id?: number }>(`${c.endpoint}/v2/refund`, {
      m_refund_id: mRefundId,
      app_id: String(c.appId),
      zp_trans_id: meta.externalRef,
      amount: String(amount),
      timestamp: String(timestamp),
      description,
      mac: this.mac(c.key1, `${c.appId}|${meta.externalRef}|${amount}|${description}|${timestamp}`),
    });
    return { ok: res.return_code === 1 || res.return_code === 3, externalRef: res.refund_id ? String(res.refund_id) : mRefundId, message: res.return_message, raw: res };
  }
}
