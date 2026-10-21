import { z } from 'zod';
import { amountSchema } from './common.js';

/** Mã cổng thanh toán được hỗ trợ (ADR 0006, 0007). */
export const paymentProviderCodeSchema = z.enum(['mock', 'vnpay', 'momo', 'zalopay', 'onepay']);
export type PaymentProviderCode = z.infer<typeof paymentProviderCodeSchema>;

/** Phương thức đi qua cổng/ví (cần PaymentIntent); tiền mặt, VietQR, thẻ tại quầy xử lý trực tiếp ở billing. */
export const gatewayMethodSchema = z.enum(['VNPAY', 'MOMO', 'ZALOPAY', 'APPLE_PAY', 'GOOGLE_PAY']);
export type GatewayMethod = z.infer<typeof gatewayMethodSchema>;

export const DEFAULT_PROVIDER_FOR_METHOD: Record<GatewayMethod, PaymentProviderCode> = {
  VNPAY: 'vnpay',
  MOMO: 'momo',
  ZALOPAY: 'zalopay',
  APPLE_PAY: 'onepay',
  GOOGLE_PAY: 'onepay',
};

export const createPaymentIntentSchema = z.object({
  method: gatewayMethodSchema,
  provider: paymentProviderCodeSchema.optional(),
  /** URL trình duyệt quay về sau khi thanh toán; mặc định trang kết quả của app khách. */
  returnUrl: z.string().url().optional(),
  /** Số tiền muốn trả; mặc định số còn phải thu. */
  amount: amountSchema.optional(),
  channel: z.enum(['web', 'mini_app', 'pos']).default('web'),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const paymentIntentStatusSchema = z.enum(['CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED']);
export type PaymentIntentStatus = z.infer<typeof paymentIntentStatusSchema>;

export interface PaymentIntentView {
  id: string;
  billId: string | null;
  paymentId: string | null;
  provider: string;
  method: string;
  amount: number;
  currency: string;
  status: PaymentIntentStatus;
  providerIntentId: string | null;
  redirectUrl: string | null;
  qrCode: string | null;
  deeplink: string | null;
  expiresAt: string | null;
  externalRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProviderCode, string> = {
  mock: 'Cổng giả lập (dev)',
  vnpay: 'VNPay',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  onepay: 'OnePay (thẻ quốc tế, Apple Pay)',
};
