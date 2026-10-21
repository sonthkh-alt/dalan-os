import { Injectable, Logger } from '@nestjs/common';
import type { EInvoiceDraft } from '@dalan/contracts';
import { EInvoiceProviderError, requestJson, type EInvoiceConfig, type EInvoiceProvider, type IssueResult, type TaxCodeInfo } from '../provider.js';

interface MisaConfig {
  /** testapi.meinvoice.vn/api/integration (test) hoặc api.meinvoice.vn/api/integration */
  baseUrl: string;
  appId: string;
  taxCode: string;
  username: string;
  password: string;
  /** Ký hiệu hóa đơn máy tính tiền, ví dụ 1C26MDL */
  invSeries: string;
  templateCode?: string;
}

/**
 * MISA meInvoice – tích hợp sâu qua API (doc.meinvoice.vn). Luồng: đăng nhập lấy token theo MST →
 * gửi hóa đơn máy tính tiền (có mã CQT, không cần ký số từng hóa đơn) → nhận số, mã CQT, mã tra cứu.
 *
 * TODO (cần tài khoản test meInvoice để chốt): tên endpoint chính xác của hóa đơn MTT
 * (`/invoice/mtt/publish` theo tài liệu "Hóa đơn khởi tạo từ máy tính tiền"), tên trường chi tiết,
 * và API tải PDF (`/invoice/pdf`). Cấu trúc dữ liệu dưới đây theo tài liệu công khai của MISA.
 */
@Injectable()
export class MisaMeInvoiceProvider implements EInvoiceProvider {
  readonly code = 'MISA' as const;
  readonly displayName = 'MISA meInvoice';
  private readonly logger = new Logger('MISA');
  private tokenCache: { token: string; expiresAt: number } | null = null;

  private cfg(config: EInvoiceConfig): MisaConfig {
    const c = config as Partial<MisaConfig>;
    if (!c.appId || !c.taxCode || !c.username || !c.password || !c.invSeries) throw new EInvoiceProviderError('MISA: thiếu appId/taxCode/username/password/invSeries', false);
    return { baseUrl: c.baseUrl ?? 'https://testapi.meinvoice.vn/api/integration', appId: c.appId, taxCode: c.taxCode, username: c.username, password: c.password, invSeries: c.invSeries, templateCode: c.templateCode };
  }

  private async token(c: MisaConfig): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) return this.tokenCache.token;
    const res = await requestJson<{ success: boolean; data?: string; errorCode?: string; descriptionErrorCode?: string }>(`${c.baseUrl}/auth/token`, {
      body: { appid: c.appId, taxcode: c.taxCode, username: c.username, password: c.password },
    });
    if (res.status !== 200 || !res.data?.success || !res.data.data) throw new EInvoiceProviderError(`MISA đăng nhập thất bại: ${res.data?.descriptionErrorCode ?? res.text.slice(0, 200)}`, res.status >= 500, res.data);
    this.tokenCache = { token: res.data.data, expiresAt: Date.now() + 50 * 60_000 };
    return res.data.data;
  }

  private headers(c: MisaConfig, token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, CompanyTaxCode: c.taxCode };
  }

  private toMisaInvoice(draft: EInvoiceDraft, c: MisaConfig) {
    return {
      RefID: draft.bill.id,
      InvSeries: draft.serial ?? c.invSeries,
      InvDate: (draft.bill.closedAt ?? new Date().toISOString()).slice(0, 10),
      CurrencyCode: 'VND',
      ExchangeRate: 1,
      PaymentMethodName: draft.paymentMethods.join('/') || 'TM/CK',
      BuyerLegalName: draft.buyer.isWalkIn ? '' : draft.buyer.name,
      BuyerFullName: draft.buyer.name,
      BuyerTaxCode: draft.buyer.taxCode ?? '',
      BuyerAddress: draft.buyer.address ?? '',
      BuyerEmail: draft.buyer.email ?? '',
      BuyerPhoneNumber: draft.buyer.phone ?? '',
      TotalSaleAmountOC: draft.totals.beforeVat,
      TotalDiscountAmountOC: draft.totals.discount,
      TotalVATAmountOC: draft.totals.vat,
      TotalAmountOC: draft.totals.total,
      TotalAmountInWords: '',
      OriginalInvoiceDetail: draft.lines.map((l, i) => ({
        ItemType: 1,
        LineNumber: i + 1,
        SortOrder: i + 1,
        ItemName: l.name,
        UnitName: l.unit,
        Quantity: l.quantity,
        UnitPrice: l.unitPriceBeforeVat,
        AmountOC: l.amountBeforeVat,
        DiscountAmountOC: l.discount,
        VATRateName: `${l.vatRateBps / 100}%`,
        VATAmountOC: l.vatAmount,
      })),
      TaxRateInfo: draft.taxBreakdown.map((t) => ({ VATRateName: `${t.rateBps / 100}%`, AmountWithoutVATOC: t.taxable, VATAmountOC: t.vat })),
    };
  }

  private parseIssue(data: unknown, draft: EInvoiceDraft, c: MisaConfig): IssueResult {
    const d = data as { success?: boolean; data?: unknown; errorCode?: string; descriptionErrorCode?: string };
    if (!d?.success) throw new EInvoiceProviderError(`MISA từ chối: ${d?.errorCode ?? ''} ${d?.descriptionErrorCode ?? ''}`.trim(), false, data);
    const rows = Array.isArray(d.data) ? d.data : typeof d.data === 'string' ? (JSON.parse(d.data) as unknown[]) : [d.data];
    const first = (rows[0] ?? {}) as Record<string, unknown>;
    return {
      providerRef: String(first.TransactionID ?? first.InvoiceID ?? first.RefID ?? draft.bill.id),
      invoiceNo: String(first.InvNo ?? ''),
      serial: String(first.InvSeries ?? draft.serial ?? c.invSeries),
      templateCode: String(first.InvTemplateNo ?? c.templateCode ?? ''),
      taxAuthorityCode: first.InvCode ? String(first.InvCode) : null,
      lookupUrl: first.LookupUrl ? String(first.LookupUrl) : 'https://www.meinvoice.vn/tra-cuu',
      lookupCode: first.TransactionID ? String(first.TransactionID) : null,
      pdfUrl: null,
      xmlUrl: null,
      issuedAt: new Date(),
      raw: data,
    };
  }

  async issue(draft: EInvoiceDraft, config: EInvoiceConfig): Promise<IssueResult> {
    const c = this.cfg(config);
    const token = await this.token(c);
    // TODO: xác nhận endpoint hóa đơn máy tính tiền với MISA (tài liệu: /invoice/mtt/publish; hóa đơn thường: /invoice/publish)
    const res = await requestJson(`${c.baseUrl}/invoice/mtt/publish`, { headers: this.headers(c, token), body: [this.toMisaInvoice(draft, c)] });
    if (res.status === 401) this.tokenCache = null;
    if (res.status >= 500) throw new EInvoiceProviderError(`MISA lỗi máy chủ ${res.status}`, true, res.text);
    return this.parseIssue(res.data, draft, c);
  }

  async cancel(providerRef: string, reason: string, config: EInvoiceConfig): Promise<{ ok: boolean; raw: unknown }> {
    const c = this.cfg(config);
    const token = await this.token(c);
    const res = await requestJson<{ success?: boolean }>(`${c.baseUrl}/invoice/cancel`, { headers: this.headers(c, token), body: { TransactionID: providerRef, Reason: reason } });
    return { ok: !!res.data?.success, raw: res.data };
  }

  async replace(providerRef: string, draft: EInvoiceDraft, reason: string, config: EInvoiceConfig): Promise<IssueResult> {
    const c = this.cfg(config);
    const token = await this.token(c);
    const res = await requestJson(`${c.baseUrl}/invoice/replace`, { headers: this.headers(c, token), body: [{ ...this.toMisaInvoice(draft, c), OriginalTransactionID: providerRef, Reason: reason }] });
    return this.parseIssue(res.data, draft, c);
  }

  async adjust(providerRef: string, draft: EInvoiceDraft, reason: string, config: EInvoiceConfig): Promise<IssueResult> {
    const c = this.cfg(config);
    const token = await this.token(c);
    const res = await requestJson(`${c.baseUrl}/invoice/adjust`, { headers: this.headers(c, token), body: [{ ...this.toMisaInvoice(draft, c), OriginalTransactionID: providerRef, Reason: reason }] });
    return this.parseIssue(res.data, draft, c);
  }

  async getPdf(providerRef: string, config: EInvoiceConfig): Promise<Buffer> {
    const c = this.cfg(config);
    const token = await this.token(c);
    const res = await requestJson<{ success?: boolean; data?: string }>(`${c.baseUrl}/invoice/pdf?transactionId=${encodeURIComponent(providerRef)}`, { method: 'GET', headers: this.headers(c, token) });
    if (!res.data?.success || !res.data.data) throw new EInvoiceProviderError('MISA: không tải được PDF', false, res.data);
    return Buffer.from(res.data.data, 'base64');
  }

  async lookupTaxCode(taxCode: string, config: EInvoiceConfig): Promise<TaxCodeInfo | null> {
    // TODO: MISA có API tra cứu MST (meinvoice.vn/tra-cuu-ma-so-thue); dùng khi có tài liệu chính thức.
    this.logger.debug(`lookupTaxCode ${taxCode} chưa triển khai cho MISA (${String(config.baseUrl ?? '')})`);
    return null;
  }
}
