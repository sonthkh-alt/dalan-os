import type { EInvoiceDraft, EInvoiceProviderCode } from '@dalan/contracts';

export type EInvoiceConfig = Record<string, unknown>;

export interface IssueResult {
  /** Tham chiếu phía nhà cung cấp (id/transaction id) dùng cho hủy, thay thế, tải PDF */
  providerRef: string;
  invoiceNo: string;
  serial: string | null;
  templateCode: string | null;
  taxAuthorityCode: string | null;
  lookupUrl: string | null;
  lookupCode: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  issuedAt: Date;
  raw: unknown;
}

export interface TaxCodeInfo {
  taxCode: string;
  name: string;
  address: string | null;
  status?: string | null;
}

/**
 * Bộ chuyển đổi hóa đơn điện tử khởi tạo từ máy tính tiền (NĐ 70/2025 sửa NĐ 123/2020).
 * Mỗi nhà cung cấp cấp mã cơ quan thuế, link và mã tra cứu; API ghi lại để in lên bill và gửi khách.
 */
export interface EInvoiceProvider {
  readonly code: EInvoiceProviderCode;
  readonly displayName: string;
  issue(draft: EInvoiceDraft, config: EInvoiceConfig): Promise<IssueResult>;
  cancel(providerRef: string, reason: string, config: EInvoiceConfig): Promise<{ ok: boolean; raw: unknown }>;
  replace(providerRef: string, draft: EInvoiceDraft, reason: string, config: EInvoiceConfig): Promise<IssueResult>;
  adjust(providerRef: string, draft: EInvoiceDraft, reason: string, config: EInvoiceConfig): Promise<IssueResult>;
  getPdf(providerRef: string, config: EInvoiceConfig): Promise<Buffer>;
  lookupTaxCode(taxCode: string, config: EInvoiceConfig): Promise<TaxCodeInfo | null>;
}

export class EInvoiceProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'EInvoiceProviderError';
  }
}

export async function requestJson<T = unknown>(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number } = {}): Promise<{ status: number; data: T; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, {
      method: init.method ?? 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(init.headers ?? {}) },
      body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data: data as T, text };
  } finally {
    clearTimeout(timer);
  }
}
