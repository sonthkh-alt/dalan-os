import { Injectable } from '@nestjs/common';
import type { EInvoiceDraft } from '@dalan/contracts';
import { EInvoiceProviderError, type EInvoiceConfig, type EInvoiceProvider, type IssueResult, type TaxCodeInfo } from '../provider.js';

interface VnptConfig {
  /** https://<tenant>.vnpt-invoice.com.vn (PublishService.asmx, PortalService.asmx, BusinessService.asmx) */
  baseUrl: string;
  account: string;
  acPass: string;
  username: string;
  password: string;
  pattern: string;
  serial: string;
}

/**
 * VNPT Invoice (SOAP): PublishService.asmx/ImportAndPublishInv với XML <Invoices>. Hóa đơn máy tính tiền
 * dùng mẫu/ký hiệu MTT do VNPT cấp. Bản này dựng lời gọi SOAP tối thiểu; cần tài khoản test VNPT để chốt
 * tên trường chi tiết (TODO). Tải PDF qua PortalService.asmx/downloadInvPDFFkeyNoPay.
 */
@Injectable()
export class VnptInvoiceProvider implements EInvoiceProvider {
  readonly code = 'VNPT' as const;
  readonly displayName = 'VNPT Invoice';

  private cfg(config: EInvoiceConfig): VnptConfig {
    const c = config as Partial<VnptConfig>;
    if (!c.baseUrl || !c.account || !c.acPass || !c.username || !c.password || !c.pattern || !c.serial) {
      throw new EInvoiceProviderError('VNPT: thiếu baseUrl/account/acPass/username/password/pattern/serial', false);
    }
    return c as VnptConfig;
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private xmlInvoice(draft: EInvoiceDraft): string {
    const products = draft.lines
      .map(
        (l) => `<Product><ProdName>${this.esc(l.name)}</ProdName><ProdUnit>${this.esc(l.unit)}</ProdUnit><ProdQuantity>${l.quantity}</ProdQuantity><ProdPrice>${l.unitPriceBeforeVat}</ProdPrice><Amount>${l.amountBeforeVat}</Amount><VATRate>${l.vatRateBps / 100}</VATRate><VATAmount>${l.vatAmount}</VATAmount><Total>${l.amount}</Total></Product>`,
      )
      .join('');
    return `<Invoices><Inv><key>${this.esc(draft.bill.id)}</key><Invoice><CusCode>${this.esc(draft.buyer.taxCode ?? draft.buyer.phone ?? 'KHACHLE')}</CusCode><CusName>${this.esc(draft.buyer.name)}</CusName><CusAddress>${this.esc(draft.buyer.address ?? '')}</CusAddress><CusPhone>${this.esc(draft.buyer.phone ?? '')}</CusPhone><CusTaxCode>${this.esc(draft.buyer.taxCode ?? '')}</CusTaxCode><PaymentMethod>${this.esc(draft.paymentMethods.join('/') || 'TM/CK')}</PaymentMethod><KindOfService>Dich vu an uong</KindOfService><Products>${products}</Products><Total>${draft.totals.beforeVat}</Total><VATRate>${draft.taxBreakdown[0]?.rateBps ? draft.taxBreakdown[0].rateBps / 100 : 0}</VATRate><VATAmount>${draft.totals.vat}</VATAmount><Amount>${draft.totals.total}</Amount><AmountInWords></AmountInWords><Extra></Extra></Invoice></Inv></Invoices>`;
  }

  private soap(action: string, bodyXml: string): string {
    return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${action} xmlns="http://tempuri.org/">${bodyXml}</${action}></soap:Body></soap:Envelope>`;
  }

  private async call(c: VnptConfig, service: string, action: string, bodyXml: string): Promise<string> {
    const res = await fetch(`${c.baseUrl}/${service}`, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: `http://tempuri.org/${action}` }, body: this.soap(action, bodyXml) });
    const text = await res.text();
    if (!res.ok) throw new EInvoiceProviderError(`VNPT HTTP ${res.status}`, res.status >= 500, text);
    const m = new RegExp(`<${action}Result>([\\s\\S]*?)</${action}Result>`).exec(text);
    return m?.[1]?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') ?? text;
  }

  private parse(result: string, draft: EInvoiceDraft, c: VnptConfig): IssueResult {
    // Kết quả thành công dạng "OK:<pattern>;<serial>-<key>_<invoiceNo>"; lỗi dạng "ERR:<mã>"
    if (!result.startsWith('OK:')) throw new EInvoiceProviderError(`VNPT từ chối: ${result.slice(0, 120)}`, false, result);
    const m = /OK:([^;]+);([^-]+)-([^_]+)_(\d+)/.exec(result);
    return {
      providerRef: m?.[3] ?? draft.bill.id,
      invoiceNo: m?.[4] ?? '',
      serial: m?.[2] ?? c.serial,
      templateCode: m?.[1] ?? c.pattern,
      taxAuthorityCode: null, // TODO: VNPT trả mã CQT qua API tra cứu riêng (getInvViewFkey/ getMCCQT)
      lookupUrl: `${c.baseUrl}/tracuu`,
      lookupCode: m?.[3] ?? null,
      pdfUrl: null,
      xmlUrl: null,
      issuedAt: new Date(),
      raw: result,
    };
  }

  async issue(draft: EInvoiceDraft, config: EInvoiceConfig): Promise<IssueResult> {
    const c = this.cfg(config);
    const body = `<Account>${this.esc(c.account)}</Account><ACpass>${this.esc(c.acPass)}</ACpass><xmlInvData>${this.esc(this.xmlInvoice(draft))}</xmlInvData><username>${this.esc(c.username)}</username><password>${this.esc(c.password)}</password><pattern>${this.esc(draft.templateCode ?? c.pattern)}</pattern><serial>${this.esc(draft.serial ?? c.serial)}</serial><convert>0</convert>`;
    const result = await this.call(c, 'PublishService.asmx', 'ImportAndPublishInv', body);
    return this.parse(result, draft, c);
  }

  async cancel(providerRef: string, _reason: string, config: EInvoiceConfig): Promise<{ ok: boolean; raw: unknown }> {
    const c = this.cfg(config);
    const body = `<Account>${this.esc(c.account)}</Account><ACpass>${this.esc(c.acPass)}</ACpass><fkey>${this.esc(providerRef)}</fkey><userName>${this.esc(c.username)}</userName><passWord>${this.esc(c.password)}</passWord>`;
    const result = await this.call(c, 'BusinessService.asmx', 'cancelInv', body);
    return { ok: result.startsWith('OK'), raw: result };
  }

  async replace(providerRef: string, draft: EInvoiceDraft, _reason: string, config: EInvoiceConfig): Promise<IssueResult> {
    const c = this.cfg(config);
    const body = `<Account>${this.esc(c.account)}</Account><ACpass>${this.esc(c.acPass)}</ACpass><xmlInvData>${this.esc(this.xmlInvoice(draft))}</xmlInvData><username>${this.esc(c.username)}</username><pass>${this.esc(c.password)}</pass><fkey>${this.esc(providerRef)}</fkey><convert>0</convert>`;
    const result = await this.call(c, 'BusinessService.asmx', 'replaceInv', body);
    return this.parse(result, draft, c);
  }

  async adjust(providerRef: string, draft: EInvoiceDraft, _reason: string, config: EInvoiceConfig): Promise<IssueResult> {
    const c = this.cfg(config);
    const body = `<Account>${this.esc(c.account)}</Account><ACpass>${this.esc(c.acPass)}</ACpass><xmlInvData>${this.esc(this.xmlInvoice(draft))}</xmlInvData><username>${this.esc(c.username)}</username><pass>${this.esc(c.password)}</pass><fkey>${this.esc(providerRef)}</fkey><convert>0</convert>`;
    const result = await this.call(c, 'BusinessService.asmx', 'adjustInv', body);
    return this.parse(result, draft, c);
  }

  async getPdf(providerRef: string, config: EInvoiceConfig): Promise<Buffer> {
    const c = this.cfg(config);
    const body = `<fkey>${this.esc(providerRef)}</fkey><userName>${this.esc(c.username)}</userName><userPass>${this.esc(c.password)}</userPass>`;
    const result = await this.call(c, 'PortalService.asmx', 'downloadInvPDFFkeyNoPay', body);
    if (result.startsWith('ERR')) throw new EInvoiceProviderError(`VNPT PDF lỗi: ${result}`, false, result);
    return Buffer.from(result, 'base64');
  }

  async lookupTaxCode(): Promise<TaxCodeInfo | null> {
    return null; // TODO: không có API tra cứu MST từ VNPT Invoice
  }
}
