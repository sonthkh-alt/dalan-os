import { z } from 'zod';
import { amountSchema, idSchema, quantitySchema } from './common.js';

export const openSessionSchema = z.object({
  tableIds: z.array(idSchema).min(1),
  guestCount: z.number().int().min(0).max(500).default(0),
  source: z.enum(['WALK_IN', 'RESERVATION', 'QR', 'EVENT', 'TAKEAWAY', 'DELIVERY']).default('WALK_IN'),
  customerId: idSchema.optional(),
  reservationId: idSchema.optional(),
  notes: z.string().max(300).optional(),
});
export type OpenSessionInput = z.infer<typeof openSessionSchema>;

export const updateSessionSchema = z.object({
  guestCount: z.number().int().min(0).max(500).optional(),
  notes: z.string().max(300).nullable().optional(),
  serverId: idSchema.nullable().optional(),
  customerId: idSchema.nullable().optional(),
});

export const modifierSelectionSchema = z.object({ groupId: idSchema, optionId: idSchema });

export const orderLineInputSchema = z.object({
  itemId: idSchema,
  variantId: idSchema.optional(),
  quantity: quantitySchema,
  /** Giá nhân viên nhập với món MARKET/OPEN */
  enteredPrice: amountSchema.optional(),
  /** Tên tự do với món OPEN */
  customName: z.string().max(120).optional(),
  modifiers: z.array(modifierSelectionSchema).default([]),
  note: z.string().max(200).optional(),
  course: z.number().int().min(1).max(9).default(1),
  seatNo: z.number().int().min(1).max(100).optional(),
});
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;

export const createOrderSchema = z.object({
  lines: z.array(orderLineInputSchema).min(1).max(100),
  /** true: gửi bếp ngay; false: giữ nháp để sửa tiếp */
  send: z.boolean().default(true),
  notes: z.string().max(300).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateLineSchema = z.object({
  quantity: quantitySchema.optional(),
  note: z.string().max(200).nullable().optional(),
  course: z.number().int().min(1).max(9).optional(),
  weightKg: z.number().positive().max(1000).optional(),
  enteredPrice: amountSchema.optional(),
  seatNo: z.number().int().min(1).max(100).nullable().optional(),
});

export const voidLineSchema = z.object({
  reason: z.enum(['GUEST_CHANGED_MIND', 'OUT_OF_STOCK', 'WRONG_ORDER', 'QUALITY_COMPLAINT', 'OTHER']),
  note: z.string().max(200).optional(),
  /** Món đã nấu, hao phí (không hoàn kho) */
  waste: z.boolean().default(false),
  /** PIN quản lý khi vượt hạn mức */
  managerPin: z.string().regex(/^\d{4,6}$/).optional(),
});
export type VoidLineInput = z.infer<typeof voidLineSchema>;

export const moveTablesSchema = z.object({ tableIds: z.array(idSchema).min(1) });
export const mergeSessionSchema = z.object({ otherSessionId: idSchema });
export const splitSessionSchema = z.object({ lineIds: z.array(idSchema).min(1), tableIds: z.array(idSchema).min(1), guestCount: z.number().int().min(0).default(0) });
export const fireCourseSchema = z.object({ course: z.number().int().min(1).max(9) });

export const serviceRequestSchema = z.object({
  kind: z.enum(['CALL_STAFF', 'WATER', 'UTENSILS', 'BILL', 'OTHER']),
  note: z.string().max(200).optional(),
});

export const guestOrderSchema = z.object({
  lines: z.array(orderLineInputSchema.omit({ enteredPrice: true, customName: true, seatNo: true })).min(1).max(50),
  notes: z.string().max(300).optional(),
});
export type GuestOrderInput = z.infer<typeof guestOrderSchema>;

/** Trạng thái bàn hiển thị trên sơ đồ, suy ra từ phiên đang mở. */
export type TableDisplayStatus = 'EMPTY' | 'RESERVED' | 'PENDING' | 'SEATED' | 'COOKING' | 'READY' | 'BILL' | 'PAID' | 'CLEANING';

export const VOID_REASON_LABELS: Record<z.infer<typeof voidLineSchema>['reason'], string> = {
  GUEST_CHANGED_MIND: 'Khách đổi ý',
  OUT_OF_STOCK: 'Bếp hết món',
  WRONG_ORDER: 'Gọi nhầm',
  QUALITY_COMPLAINT: 'Khách phàn nàn chất lượng',
  OTHER: 'Lý do khác',
};
