import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EInvoiceDraft } from '@dalan/contracts';
import type { EInvoiceConfig, EInvoiceProvider, IssueResult, TaxCodeInfo } from '../provider.js';

/** Nhà cung cấp giả lập: cấp số tăng dần, mã CQT và link tra cứu giả; PDF tối giản. Dùng cho dev, demo, kiểm thử. */
@Injectable()
export class MockEInvoiceProvider implements EInvoiceProvider {
  readonly code = 'MOCK' as const;
  readonly displayName = 'HĐĐT giả lập';
  private counter = 0;
  private readonly store = new Map<string, { draft: EInvoiceDraft; result: IssueResult; cancelled: boolean }>();

  private next(draft: EInvoiceDraft, kind: 'ISSUE' | 'REPLACE' | 'ADJUST'): IssueResult {
    this.counter += 1;
    const invoiceNo = String(this.counter).padStart(8, '0');
    const serial = draft.serial ?? '1C26TDL';
    const lookupCode = randomBytes(6).toString('hex').toUpperCase();
    const providerRef = `mock-${kind.toLowerCase()}-${randomBytes(8).toString('hex')}`;
    const result: IssueResult = {
      providerRef,
      invoiceNo,
      serial,
      templateCode: draft.templateCode ?? '1',
      taxAuthorityCode: `M1-26-${randomBytes(4).toString('hex').toUpperCase()}-${invoiceNo}`,
      lookupUrl: `https://tracuu-mock.dalan.local/hoa-don/${lookupCode}`,
      lookupCode,
      pdfUrl: null,
      xmlUrl: null,
      issuedAt: new Date(),
      raw: { simulated: true, kind },
    };
    this.store.set(providerRef, { draft, result, cancelled: false });
    return result;
  }

  async issue(draft: EInvoiceDraft): Promise<IssueResult> {
    return this.next(draft, 'ISSUE');
  }

  async cancel(providerRef: string): Promise<{ ok: boolean; raw: unknown }> {
    const row = this.store.get(providerRef);
    if (row) row.cancelled = true;
    return { ok: true, raw: { simulated: true, providerRef } };
  }

  async replace(providerRef: string, draft: EInvoiceDraft): Promise<IssueResult> {
    await this.cancel(providerRef);
    return this.next(draft, 'REPLACE');
  }

  async adjust(_providerRef: string, draft: EInvoiceDraft): Promise<IssueResult> {
    return this.next(draft, 'ADJUST');
  }

  async getPdf(providerRef: string): Promise<Buffer> {
    const row = this.store.get(providerRef);
    const text = row ? `HOA DON ${row.result.serial} ${row.result.invoiceNo} - ${row.draft.seller.name} - Tong ${row.draft.totals.total} VND` : 'HOA DON MOCK';
    return minimalPdf(text);
  }

  async lookupTaxCode(taxCode: string): Promise<TaxCodeInfo | null> {
    if (!/^\d{10}(-\d{3})?$/.test(taxCode)) return null;
    return { taxCode, name: `Công ty mẫu ${taxCode}`, address: 'TP. Thanh Hóa, Việt Nam', status: 'active' };
  }
}

/** PDF một trang tối giản (Helvetica, không dấu) đủ để trình duyệt mở. */
export function minimalPdf(text: string): Buffer {
  const safe = text.replace(/[^\x20-\x7E]/g, '?').replace(/[()\\]/g, ' ');
  const content = `BT /F1 12 Tf 40 780 Td (${safe}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'binary');
}
