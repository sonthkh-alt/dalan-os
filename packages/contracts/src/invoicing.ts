import { z } from 'zod';
import { dateOnlySchema, idSchema } from './common.js';
import { taxInvoiceInfoSchema } from './billing.js';

export const eInvoiceProviderCodeSchema = z.enum(['MOCK', 'MISA', 'VIETTEL', 'VNPT']);
export type EInvoiceProviderCode = z.infer<typeof eInvoiceProviderCodeSchema>;

export const eInvoiceStatusSchema = z.enum(['DRAFT', 'QUEUED', 'ISSUED', 'FAILED', 'CANCELLED', 'REPLACED', 'ADJUSTED']);
export type EInvoiceStatus = z.infer<typeof eInvoiceStatusSchema>;

export const issueEInvoiceSchema = z.object({
  /** Thông tin người mua; nếu bỏ trống dùng bill.taxInvoiceInfo, rồi hồ sơ khách, rồi "khách lẻ". */
  buyer: taxInvoiceInfoSchema.optional(),
  /** Phát hành ngay trong request thay vì qua hàng đợi (dùng khi thu ngân chờ in). */
  issueNow: z.boolean().default(false),
});
export type IssueEInvoiceInput = z.infer<typeof issueEInvoiceSchema>;

export const cancelEInvoiceSchema = z.object({ reason: z.string().min(3).max(300) });
export const replaceEInvoiceSchema = cancelEInvoiceSchema.extend({ buyer: taxInvoiceInfoSchema.optional() });
export const adjustEInvoiceSchema = cancelEInvoiceSchema.extend({
  buyer: taxInvoiceInfoSchema.optional(),
  /** Chênh lệch tiền (dương: tăng, âm: giảm) nếu điều chỉnh giá trị; bỏ trống = điều chỉnh thông tin. */
  deltaAmount: z.number().int().optional(),
  deltaVat: z.number().int().optional(),
});

export const eInvoiceListQuerySchema = z.object({
  branchId: idSchema.optional(),
  status: eInvoiceStatusSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Bản nháp hóa đơn gửi tới nhà cung cấp; được chụp lại tại thời điểm tạo. */
export interface EInvoiceDraft {
  seller: { name: string; taxCode: string | null; address: string | null; phone: string | null; branchCode: string };
  buyer: { name: string; taxCode: string | null; address: string | null; email: string | null; phone: string | null; isWalkIn: boolean };
  bill: { id: string; code: string; closedAt: string | null; sessionCode: string; tableNames: string };
  lines: {
    name: string;
    unit: string;
    quantity: number;
    /** Đơn giá chưa gồm VAT (đã quy đổi nếu giá niêm yết gồm VAT) */
    unitPriceBeforeVat: number;
    amountBeforeVat: number;
    vatRateBps: number;
    vatAmount: number;
    discount: number;
    amount: number;
  }[];
  taxBreakdown: { rateBps: number; taxable: number; vat: number }[];
  totals: { beforeVat: number; vat: number; discount: number; serviceCharge: number; total: number };
  paymentMethods: string[];
  currency: 'VND';
  templateCode: string | null;
  serial: string | null;
  /** Hóa đơn gốc khi thay thế/điều chỉnh */
  reference?: { kind: 'REPLACE' | 'ADJUST'; invoiceNo: string | null; serial: string | null; issuedAt: string | null; reason: string } | null;
}

export const EINVOICE_STATUS_LABELS: Record<EInvoiceStatus, string> = {
  DRAFT: 'Nháp',
  QUEUED: 'Đang phát hành',
  ISSUED: 'Đã phát hành',
  FAILED: 'Lỗi phát hành',
  CANCELLED: 'Đã hủy',
  REPLACED: 'Đã bị thay thế',
  ADJUSTED: 'Đã bị điều chỉnh',
};
