import type { PaymentProviderCode } from '@dalan/contracts';

/** Cấu hình một cổng cho một cơ sở (đọc từ IntegrationConfig.config hoặc biến môi trường). Bí mật nằm ở đây. */
export type ProviderConfig = Record<string, unknown> & { sandbox?: boolean };

export interface CreateIntentInput {
  /** Id PaymentIntent nội bộ; dùng làm mã giao dịch phía cổng khi phù hợp. */
  intentId: string;
  amount: number;
  currency: 'VND';
  method: string;
  description: string;
  returnUrl: string;
  ipnUrl: string;
  clientIp: string;
  channel: 'web' | 'mini_app' | 'pos';
  billId?: string | null;
  reservationId?: string | null;
  eventPaymentId?: string | null;
}

export interface CreateIntentResult {
  providerIntentId: string;
  redirectUrl?: string | null;
  qrCode?: string | null;
  deeplink?: string | null;
  expiresAt?: Date | null;
  raw?: unknown;
}

export interface WebhookContext {
  method: string;
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
}

export type WebhookStatus = 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'CANCELLED';

export interface WebhookResult {
  ok: boolean;
  /** Lý do khi ok=false */
  reason?: string;
  providerIntentId: string | null;
  status: WebhookStatus;
  externalRef?: string | null;
  amount?: number | null;
  raw: unknown;
}

export type AckCode = 'OK' | 'INVALID_SIGNATURE' | 'NOT_FOUND' | 'ALREADY_PROCESSED' | 'AMOUNT_MISMATCH' | 'ERROR';

export interface AckResponse {
  status: number;
  contentType: string;
  body: string;
}

export interface QueryResult {
  status: WebhookStatus;
  externalRef?: string | null;
  amount?: number | null;
  raw: unknown;
}

export interface RefundResult {
  ok: boolean;
  externalRef?: string | null;
  message?: string;
  raw: unknown;
}

export interface IntentMeta {
  createdAt: Date;
  amount: number;
  externalRef?: string | null;
}

/**
 * Bộ chuyển đổi cổng thanh toán. Mọi cổng có cùng vòng đời: tạo intent → khách trả trên cổng →
 * webhook (IPN) về API → đối chiếu → ghi nhận. `extractIntentId` chạy trước khi có bí mật để tìm
 * intent (và cơ sở) rồi mới `verifyWebhook` với cấu hình đúng cơ sở.
 */
export interface PaymentProvider {
  readonly code: PaymentProviderCode;
  readonly displayName: string;
  supportsMethod(method: string): boolean;
  createIntent(input: CreateIntentInput, config: ProviderConfig): Promise<CreateIntentResult>;
  extractIntentId(ctx: WebhookContext): string | null;
  verifyWebhook(ctx: WebhookContext, config: ProviderConfig): Promise<WebhookResult> | WebhookResult;
  ack(code: AckCode, result?: WebhookResult | null): AckResponse;
  query(providerIntentId: string, config: ProviderConfig, meta: IntentMeta): Promise<QueryResult>;
  refund(providerIntentId: string, amount: number, reason: string, config: ProviderConfig, meta: IntentMeta): Promise<RefundResult>;
}

/** Thời gian Việt Nam dạng yyyyMMddHHmmss (VNPay, OnePay) */
export function vnTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}

/** yymmdd theo giờ Việt Nam (ZaloPay app_trans_id) */
export function vnYymmdd(date = new Date()): string {
  return vnTimestamp(date).slice(2, 8);
}

export function stringifyRecord(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      out[k] = Array.isArray(v) ? String(v[0] ?? '') : String(v);
    }
  }
  return out;
}

export async function postJson<T = unknown>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} từ ${url}: ${text.slice(0, 300)}`);
  return parsed as T;
}

export async function postForm<T = unknown>(url: string, form: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} từ ${url}: ${text.slice(0, 300)}`);
  return parsed as T;
}
