import { z } from 'zod';
import { amountSchema, bpsSchema, idSchema } from './common.js';

export const createBillSchema = z.object({
  /** Mặc định: tất cả dòng chưa thanh toán */
  mode: z.enum(['ALL', 'BY_ITEM', 'BY_PARTICIPANT', 'EQUAL']).default('ALL'),
  lineIds: z.array(idSchema).optional(),
  participantId: idSchema.optional(),
  /** Số phần khi chia đều (tạo N bill) */
  parts: z.number().int().min(2).max(50).optional(),
  customerId: idSchema.optional(),
});
export type CreateBillInput = z.infer<typeof createBillSchema>;

export const billDiscountSchema = z.object({
  kind: z.enum(['PERCENT', 'AMOUNT', 'VOUCHER', 'POINTS', 'PROMOTION', 'GOODWILL']),
  valueBps: bpsSchema.optional(),
  amount: amountSchema.optional(),
  reason: z.string().max(200).optional(),
  voucherCode: z.string().max(40).optional(),
  points: z.number().int().min(1).optional(),
  managerPin: z.string().regex(/^\d{4,6}$/).optional(),
});
export type BillDiscountInput = z.infer<typeof billDiscountSchema>;

export const paymentMethodSchema = z.enum([
  'CASH',
  'BANK_TRANSFER',
  'CARD_TERMINAL',
  'VNPAY',
  'MOMO',
  'ZALOPAY',
  'APPLE_PAY',
  'GOOGLE_PAY',
  'VOUCHER',
  'POINTS',
  'DEPOSIT',
  'CREDIT',
]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản VietQR',
  CARD_TERMINAL: 'Thẻ / Apple Pay tại máy POS',
  VNPAY: 'VNPay',
  MOMO: 'MoMo',
  ZALOPAY: 'ZaloPay',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
  VOUCHER: 'Voucher',
  POINTS: 'Điểm thành viên',
  DEPOSIT: 'Tiền đặt cọc',
  CREDIT: 'Công nợ',
};

export const addPaymentSchema = z.object({
  method: paymentMethodSchema,
  /** Số tiền ghi nhận; mặc định = còn phải thu */
  amount: amountSchema.optional(),
  /** Tiền khách đưa (tiền mặt) để tính tiền thừa */
  tenderedAmount: amountSchema.optional(),
  subMethod: z.enum(['APPLE_PAY', 'GOOGLE_PAY', 'SAMSUNG_PAY', 'CONTACTLESS', 'CHIP', 'SWIPE']).optional(),
  externalRef: z.string().max(100).optional(),
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
  approvalCode: z.string().max(40).optional(),
  note: z.string().max(200).optional(),
});
export type AddPaymentInput = z.infer<typeof addPaymentSchema>;

export const confirmPaymentSchema = z.object({
  externalRef: z.string().max(100).optional(),
  note: z.string().max(200).optional(),
});

export const emptiesCountSchema = z.object({
  counts: z.array(z.object({ itemId: idSchema, countedQty: z.number().int().min(0) })).min(1),
});

export const taxInvoiceInfoSchema = z.object({
  buyerName: z.string().min(1).max(200),
  buyerTaxCode: z.string().max(20).optional(),
  buyerAddress: z.string().max(300).optional(),
  buyerEmail: z.string().email().optional(),
  buyerPhone: z.string().max(20).optional(),
});
export type TaxInvoiceInfo = z.infer<typeof taxInvoiceInfoSchema>;

export const refundSchema = z.object({
  amount: amountSchema.min(1),
  reason: z.string().min(1).max(200),
  managerPin: z.string().regex(/^\d{4,6}$/).optional(),
});
