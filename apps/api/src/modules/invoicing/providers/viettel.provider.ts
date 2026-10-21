import { Injectable } from '@nestjs/common';
import type { EInvoiceDraft } from '@dalan/contracts';
import { EInvoiceProviderError, requestJson, type EInvoiceConfig, type EInvoiceProvider, type IssueResult, type TaxCodeInfo } from '../provider.js';

interface ViettelConfig {
  /** https://api-vinvoice.viettel.vn (prod) hoặc https://api-vinvoice.viettel.vn:443/services/einvoiceapplication/api (sandbox tùy hợp đồng) */
  baseUrl: string;
  username: string;
  password: string;
  supplierTaxCode: string;
  templateCode: string;
  invoiceSeries: string;
}

/**
 * Viettel SInvoice (vInvoice) – API InvoiceWS: đăng nhập lấy access_token, tạo hóa đơn
 * `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/{supplierTaxCode}` với
 * generalInvoiceInfo, buyerInfo, payments, itemInfo, taxBreakdowns. Hóa đơn máy tính tiền dùng
 * ký hiệu/mẫu dành cho MTT đã đăng ký với cơ quan thuế.
 * TODO: xác nhận với Viettel endpoint dành riêng cho HĐ MTT (createInvoiceFromCashRegister) và tham số
 * `invoiceType`/`cashRegister` khi có tài khoản sandbox; tải PDF qua `getInvoiceRepresentationFile`.
 */
@Injectable()
export class ViettelSInvoiceProvider implements EInvoiceProvider {
  readonly code = 'VIETTEL' as const;
  readonly displayName = 'Viettel SInvoice';
  private tokenCache: { token: string; expiresAt: number } | null = null;

  private cfg(config: EInvoiceConfig): ViettelConfig {
    const c = config as Partial<ViettelConfig>;
    if (!c.username || !c.password || !c.supplierTaxCode || !c.templateCode || !c.invoiceSeries) throw new EInvoiceProviderError('Viettel: thiếu username/password/supplierTaxCode/templateCode/invoiceSeries', false);
    return { baseUrl: c.baseUrl ?? 'https://api-vinvoice.viettel.vn', username: c.username, password: c.password, supplierTaxCode: c.supplierTaxCode, templateCode: c.templateCode, invoiceSeries: c.invoiceSeries };
  }

  private async token(c: ViettelConfig): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) return this.tokenCache.token;
    const res = await requestJson<{ access_token?: string; expires_in?: number }>(`${c.baseUrl}/auth/login`, { body: { username: c.username, password: c.password } });
    if (!res.data?.access_token) throw new EInvoiceProviderError(`Viettel đăng nhập thất bại (${res.status})`, res.status >= 500, res.data);
    this.tokenCache = { token: res.data.access_token, expiresAt: Date.now() + ((res.data.expires_in ?? 3000) - 60) * 1000 };
    return res.data.access_token;
  }

  private body(draft: EInvoiceDraft, c: ViettelConfig, extra: Record<string, unknown> = {}) {
    return {
      generalInvoiceInfo: {
        invoiceType: '1',
        templateCode: draft.templateCode ?? c.templateCode,
        invoiceSeries: draft.serial ?? c.invoiceSeries,
        currencyCode: 'VND',
        adjustmentType: '1',
        paymentStatus: true,
        cusGetInvoiceRight: true,
        transactionUuid: draft.bill.id,
        ...extra,
      },
      buyerInfo: {
        buyerName: draft.buyer.name,
        buyerLegalName: draft.buyer.isWalkIn ? '' : draft.buyer.name,
        buyerTaxCode: draft.buyer.taxCode ?? '',
        buyerAddressLine: draft.buyer.address ?? '',
        buyerEmail: draft.buyer.email ?? '',
        buyerPhoneNumber: draft.buyer.phone ?? '',
        buyerNotGetInvoice: draft.buyer.isWalkIn ? 1 : 0,
      },
      payments: [{ paymentMethodName: draft.paymentMethods.join('/') || 'TM/CK' }],
      itemInfo: draft.lines.map((l, i) => ({
        lineNumber: i + 1,
        itemName: l.name,
        unitName: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPriceBeforeVat,
        itemTotalAmountWithoutTax: l.amountBeforeVat,
        taxPercentage: l.vatRateBps / 100,
        taxAmount: l.vatAmount,
        discount: l.discount,
        itemTotalAmountWithTax: l.amount,
      })),
      taxBreakdowns: draft.taxBreakdown.map((t) => ({ taxPercentage: t.rateBps / 100, taxableAmount: t.taxable, taxAmount: t.vat })),
      summarizeInfo: {
        sumOfTotalLineAmountWithoutTax: draft.totals.beforeVat,
        totalAmountWithoutTax: draft.totals.beforeVat,
        totalTaxAmount: draft.totals.vat,
        totalAmountWithTax: draft.totals.total,
        discountAmount: draft.totals.discount,
        totalAmountWithTaxInWords: '',
      },
    };
  }

  private parse(data: unknown, draft: EInvoiceDraft, c: ViettelConfig): IssueResult {
    const d = data as { errorCode?: string | null; description?: string; result?: Record<string, unknown> };
    if (!d?.result || (d.errorCode && d.errorCode !== '0')) throw new EInvoiceProviderError(`Viettel từ chối: ${d?.errorCode ?? ''} ${d?.description ?? ''}`.trim(), false, data);
    const r = d.result;
    return {
      providerRef: String(r.transactionID ?? r.invoiceNo ?? draft.bill.id),
      invoiceNo: String(r.invoiceNo ?? ''),
      serial: draft.serial ?? c.invoiceSeries,
      templateCode: draft.templateCode ?? c.templateCode,
      taxAuthorityCode: r.codeOfTax ? String(r.codeOfTax) : null,
      lookupUrl: 'https://vinvoice.viettel.vn/utilities/invoice-search',
      lookupCode: r.reservationCode ? String(r.reservationCode) : null,
      pdfUrl: null,
      xmlUrl: null,
      issuedAt: new Date(),
      raw: data,
    };
  }

  async issue(draft: EInvoiceDraft, config: EInvoiceConfig): Promise<IssueResult> {
    const c = this.cfg(config);
    const token = await this.token(c);
    const res = await requestJson(`${c.baseUrl}/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${c.supplierTaxCode}`, { headers: { Cookie: `access_token=${token}`, Authorization: `Bearer ${token}` }, body: this.body(draft, c) });
    if (res.status === 401) this.tokenCache = null;
    if (res.status >= 500) throw new EInvoiceProviderError(`Viettel lỗi máy chủ ${res.status}`, true, res.text);
    return this.parse(res.data, draft, c);
  }

  async cancel(providerRef: string, reason: string, config: EInvoiceConfig): Promise<{ ok: boolean; raw: unknown }> {
    const c = this.cfg(config);
    const token = await this.token(c);
    const form = new URLSearchParams({ supplierTaxCode: c.supplierTaxCode, invoiceNo: providerRef, strIssueDate: String(Date.now()), additionalReferenceDesc: reason, additionalReferenceDate: String(Date.now()) });
    const res = await fetch(`${c.baseUrl}/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/cancelTransactionInvoice`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', Cookie: `access_token=${token}` }, body: form.toString() });
    const data = (await res.json().catch(() => null)) as { errorCode?: string | null } | null;
    return { ok: res.ok && (!data?.errorCode || data.errorCode === '0'), raw: data };
  }

  async replace(providerRef: string, draft: EInvoiceDraft, reason: string, config: EInvoiceConfig): Promise<IssueResult> {
    const c = this.cfg(config);
    const token = await this.token(c);
    const res = await requestJson(`${c.baseUrl}/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${c.supplierTaxCode}`, { headers: { Cookie: `access_token=${token}` }, body: this.body(draft, c, { adjustmentType: '3', originalInvoiceId: providerRef, additionalReferenceDesc: reason, additionalReferenceDate: Date.now() }) });
    return this.parse(res.data, draft, c);
  }

  async adjust(providerRef: string, draft: EInvoiceDraft, reason: string, config: EInvoiceConfig): Promise<IssueResult> {
    const c = this.cfg(config);
    const token = await this.token(c);
    const res = await requestJson(`${c.baseUrl}/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${c.supplierTaxCode}`, { headers: { Cookie: `access_token=${token}` }, body: this.body(draft, c, { adjustmentType: '5', originalInvoiceId: providerRef, additionalReferenceDesc: reason, additionalReferenceDate: Date.now() }) });
    return this.parse(res.data, draft, c);
  }

  async getPdf(providerRef: string, config: EInvoiceConfig): Promise<Buffer> {
    const c = this.cfg(config);
    const token = await this.token(c);
    const res = await requestJson<{ fileToBytes?: string }>(`${c.baseUrl}/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile`, { headers: { Cookie: `access_token=${token}` }, body: { supplierTaxCode: c.supplierTaxCode, invoiceNo: providerRef, pattern: c.templateCode, fileType: 'PDF' } });
    if (!res.data?.fileToBytes) throw new EInvoiceProviderError('Viettel: không tải được PDF', false, res.data);
    return Buffer.from(res.data.fileToBytes, 'base64');
  }

  async lookupTaxCode(): Promise<TaxCodeInfo | null> {
    return null; // Viettel không cung cấp API tra cứu MST; dùng nguồn khác (TODO)
  }
}
