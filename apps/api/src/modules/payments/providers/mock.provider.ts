import { createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AckResponse, AckCode, CreateIntentInput, CreateIntentResult, IntentMeta, PaymentProvider, ProviderConfig, QueryResult, RefundResult, WebhookContext, WebhookResult, WebhookStatus } from '../provider.js';

/**
 * Cổng giả lập cho dev/test và demo khi chưa có hợp đồng merchant.
 * Tạo intent tức thì; webhook giả có chữ ký HMAC để kiểm tra luồng xác thực như cổng thật.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly code = 'mock' as const;
  readonly displayName = 'Cổng giả lập';
  private readonly statuses = new Map<string, { status: WebhookStatus; externalRef: string | null }>();

  supportsMethod(): boolean {
    return true;
  }

  private secret(config: ProviderConfig): string {
    return String(config.secret ?? 'dalan-mock-secret');
  }

  sign(providerIntentId: string, status: string, amount: number, config: ProviderConfig): string {
    return createHmac('sha256', this.secret(config)).update(`${providerIntentId}|${status}|${amount}`).digest('hex');
  }

  async createIntent(input: CreateIntentInput, config: ProviderConfig): Promise<CreateIntentResult> {
    const providerIntentId = `mock_${input.intentId.replace(/-/g, '')}`;
    this.statuses.set(providerIntentId, { status: 'PENDING', externalRef: null });
    const base = String(config.checkoutUrl ?? input.returnUrl);
    const sep = base.includes('?') ? '&' : '?';
    return {
      providerIntentId,
      redirectUrl: `${base}${sep}mockIntent=${providerIntentId}&amount=${input.amount}`,
      qrCode: `MOCKPAY|${providerIntentId}|${input.amount}`,
      deeplink: `dalanmock://pay?intent=${providerIntentId}&amount=${input.amount}`,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      raw: { simulated: true },
    };
  }

  /** Tạo payload webhook giả (dùng bởi PaymentsService để tự gọi lại sau vài giây). */
  buildWebhook(providerIntentId: string, amount: number, status: WebhookStatus, config: ProviderConfig): WebhookContext {
    const externalRef = `MOCK${randomBytes(4).toString('hex').toUpperCase()}`;
    return {
      method: 'POST',
      headers: {},
      query: {},
      body: { providerIntentId, status, amount, externalRef, signature: this.sign(providerIntentId, status, amount, config) },
    };
  }

  extractIntentId(ctx: WebhookContext): string | null {
    const body = (ctx.body ?? {}) as { providerIntentId?: string };
    return body.providerIntentId ?? (ctx.query.providerIntentId as string | undefined) ?? null;
  }

  verifyWebhook(ctx: WebhookContext, config: ProviderConfig): WebhookResult {
    const body = (ctx.body ?? {}) as { providerIntentId?: string; status?: WebhookStatus; amount?: number; externalRef?: string; signature?: string };
    const providerIntentId = body.providerIntentId ?? null;
    const amount = Number(body.amount ?? 0);
    const status: WebhookStatus = body.status ?? 'FAILED';
    const expected = providerIntentId ? this.sign(providerIntentId, status, amount, config) : '';
    const ok = !!providerIntentId && body.signature === expected;
    if (ok && providerIntentId) this.statuses.set(providerIntentId, { status, externalRef: body.externalRef ?? null });
    return { ok, reason: ok ? undefined : 'Chữ ký giả lập không khớp', providerIntentId, status, amount, externalRef: body.externalRef ?? null, raw: body };
  }

  ack(code: AckCode): AckResponse {
    return { status: code === 'OK' || code === 'ALREADY_PROCESSED' ? 200 : 400, contentType: 'application/json', body: JSON.stringify({ ok: code === 'OK' || code === 'ALREADY_PROCESSED', code }) };
  }

  async query(providerIntentId: string, _config: ProviderConfig, meta: IntentMeta): Promise<QueryResult> {
    const s = this.statuses.get(providerIntentId);
    return { status: s?.status ?? 'PENDING', externalRef: s?.externalRef ?? null, amount: meta.amount, raw: { simulated: true } };
  }

  async refund(providerIntentId: string, amount: number): Promise<RefundResult> {
    return { ok: true, externalRef: `MOCKRF${randomBytes(4).toString('hex').toUpperCase()}`, raw: { providerIntentId, amount, simulated: true } };
  }
}
