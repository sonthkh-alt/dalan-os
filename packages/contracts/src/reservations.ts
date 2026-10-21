import { z } from 'zod';
import { dateOnlySchema, idSchema, phoneSchema } from './common.js';

export const reservationSourceSchema = z.enum(['WEB', 'ZALO', 'MINI_APP', 'PHONE', 'WALK_IN', 'STAFF']);

export const availabilityQuerySchema = z.object({
  date: dateOnlySchema,
  partySize: z.coerce.number().int().min(1).max(500),
  areaId: idSchema.optional(),
  durationMinutes: z.coerce.number().int().min(30).max(600).optional(),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export interface AvailabilitySlot {
  time: string;
  startsAt: string;
  available: boolean;
  remainingSeats: number;
  reason?: string;
}

export interface AvailabilityResult {
  date: string;
  partySize: number;
  durationMinutes: number;
  area: { id: string; name: string; kind: string } | null;
  capacitySeats: number;
  slots: AvailabilitySlot[];
  depositRequired: number | null;
}

/** Khách tự đặt bàn trên web, Zalo, Mini App. */
export const publicReservationSchema = z.object({
  branchId: idSchema,
  customerName: z.string().min(1).max(100),
  customerPhone: phoneSchema,
  partySize: z.number().int().min(1).max(500),
  /** ISO 8601 có múi giờ, ví dụ 2026-11-01T18:30:00+07:00 */
  reservedAt: z.string().datetime({ offset: true }),
  areaId: idSchema.optional(),
  occasion: z.string().max(60).optional(),
  specialRequests: z.string().max(500).optional(),
  source: reservationSourceSchema.default('WEB'),
  marketingConsent: z.boolean().optional(),
});
export type PublicReservationInput = z.infer<typeof publicReservationSchema>;

/** Lễ tân tạo đặt bàn (qua điện thoại hoặc tại quầy). */
export const createReservationSchema = publicReservationSchema.extend({
  /** Lấy từ đường dẫn /branches/:branchId/reservations; không bắt buộc trong body */
  branchId: idSchema.optional(),
  source: reservationSourceSchema.default('PHONE'),
  /** Khi hết chỗ: true = đưa vào danh sách chờ thay vì báo lỗi NO_AVAILABILITY */
  waitlist: z.boolean().optional(),
  durationMinutes: z.number().int().min(30).max(600).optional(),
  tableIds: z.array(idSchema).optional(),
  customerId: idSchema.optional(),
  notes: z.string().max(500).optional(),
  preorderLines: z.array(z.object({ itemId: idSchema, quantity: z.number().positive(), note: z.string().max(200).optional() })).optional(),
  depositRequired: z.number().int().min(0).optional(),
  /** Bỏ qua kiểm tra sức chứa (lễ tân quyết định) */
  force: z.boolean().default(false),
  autoConfirm: z.boolean().optional(),
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const updateReservationSchema = z
  .object({
    customerName: z.string().min(1).max(100),
    customerPhone: phoneSchema,
    partySize: z.number().int().min(1).max(500),
    reservedAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(30).max(600),
    areaId: idSchema.nullable(),
    tableIds: z.array(idSchema),
    occasion: z.string().max(60).nullable(),
    specialRequests: z.string().max(500).nullable(),
    notes: z.string().max(500).nullable(),
    depositRequired: z.number().int().min(0).nullable(),
    preorderLines: z.array(z.object({ itemId: idSchema, quantity: z.number().positive(), note: z.string().max(200).optional() })).nullable(),
  })
  .partial();
export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;

export const assignTablesSchema = z.object({ tableIds: z.array(idSchema).min(1) });
/** Lễ tân ghi nhận đã thu tiền cọc (tiền mặt, chuyển khoản, thẻ tại quầy). */
export const recordDepositSchema = z.object({
  amount: z.number().int().min(1),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD_TERMINAL']),
  externalRef: z.string().max(100).optional(),
  note: z.string().max(200).optional(),
});
export type RecordDepositInput = z.infer<typeof recordDepositSchema>;
export const cancelReservationSchema = z.object({ reason: z.string().max(300).optional() });
export const lookupReservationSchema = z.object({ phone: phoneSchema });
export const checkInSchema = z.object({
  tableIds: z.array(idSchema).optional(),
  guestCount: z.number().int().min(1).max(500).optional(),
});
export const reservationListQuerySchema = z.object({
  date: dateOnlySchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  status: z.string().optional(),
  areaId: idSchema.optional(),
  search: z.string().max(100).optional(),
});

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  SEATED: 'Đã vào bàn',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
  NO_SHOW: 'Không đến',
  WAITLIST: 'Danh sách chờ',
};
