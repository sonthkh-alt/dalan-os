import { z } from 'zod';
import { amountSchema, bpsSchema, dateOnlySchema, hhmmSchema, idSchema, patchSchema, phoneSchema } from './common.js';

export const eventKindSchema = z.enum(['WEDDING', 'ENGAGEMENT', 'CONFERENCE', 'GALA', 'OPENING', 'ANNIVERSARY', 'BIRTHDAY', 'REUNION', 'PARTY', 'OTHER']);
export type EventKind = z.infer<typeof eventKindSchema>;
export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  WEDDING: 'Tiệc cưới',
  ENGAGEMENT: 'Lễ ăn hỏi',
  CONFERENCE: 'Hội nghị',
  GALA: 'Gala dinner',
  OPENING: 'Khai trương',
  ANNIVERSARY: 'Lễ kỷ niệm',
  BIRTHDAY: 'Sinh nhật',
  REUNION: 'Họp lớp, họp mặt',
  PARTY: 'Liên hoan',
  OTHER: 'Khác',
};

export const eventStatusSchema = z.enum(['LEAD', 'QUOTED', 'CONTRACTED', 'CONFIRMED', 'BEO_ISSUED', 'IN_PROGRESS', 'SETTLED', 'CLOSED', 'CANCELLED']);
export type EventStatus = z.infer<typeof eventStatusSchema>;
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  LEAD: 'Yêu cầu mới',
  QUOTED: 'Đã báo giá',
  CONTRACTED: 'Đã ký hợp đồng',
  CONFIRMED: 'Đã chốt',
  BEO_ISSUED: 'Đã phát hành BEO',
  IN_PROGRESS: 'Đang diễn ra',
  SETTLED: 'Đã quyết toán',
  CLOSED: 'Đã đóng',
  CANCELLED: 'Đã hủy',
};

export const beveragePolicySchema = z.enum(['PACKAGE', 'ACTUAL', 'BYO', 'MIXED']);

export const hallSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  /** { round10: 110, round6: 150, theater: 900, standing: 1100 } */
  capacityByLayout: z.record(z.string(), z.number().int().min(0)).default({}),
  turnoverMinutes: z.number().int().min(0).max(1440).default(120),
  rentalFee: amountSchema.nullable().optional(),
  fixedEquipment: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type HallInput = z.infer<typeof hallSchema>;

export const eventHallSchema = z.object({ hallId: idSchema, layout: z.string().max(30).default('round10'), setupNotes: z.string().max(300).optional() });

export const eventCreateSchema = z.object({
  kind: eventKindSchema,
  contactName: z.string().min(1).max(120),
  contactPhone: phoneSchema,
  contactEmail: z.string().email().optional(),
  companyName: z.string().max(200).optional(),
  taxCode: z.string().max(20).optional(),
  customerId: idSchema.optional(),
  eventDate: dateOnlySchema,
  startTime: hhmmSchema,
  endTime: hhmmSchema,
  halls: z.array(eventHallSchema).default([]),
  /** Giữ chỗ tạm 48 giờ (tự giải phóng nếu chưa ký hợp đồng) */
  holdHalls: z.boolean().default(true),
  expectedTables: z.number().int().min(0).max(1000).default(0),
  guestsPerTable: z.number().int().min(1).max(20).default(10),
  expectedGuests: z.number().int().min(0).max(10_000).optional(),
  beveragePolicy: beveragePolicySchema.default('ACTUAL'),
  beverageNotes: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
  ownerStaffId: idSchema.optional(),
  source: z.string().max(30).optional(),
});
export type EventCreateInput = z.infer<typeof eventCreateSchema>;

export const eventUpdateSchema = patchSchema(eventCreateSchema).extend({
  // null = xóa trống trường tùy chọn
  contactEmail: z.string().email().nullable().optional(),
  companyName: z.string().max(200).nullable().optional(),
  taxCode: z.string().max(20).nullable().optional(),
  expectedGuests: z.number().int().min(0).max(10_000).nullable().optional(),
  beverageNotes: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
  ownerStaffId: idSchema.nullable().optional(),
  discountAmount: amountSchema.optional(),
  serviceChargeBps: bpsSchema.optional(),
  vatBps: bpsSchema.optional(),
});
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

export const publicEventInquirySchema = z.object({
  branchCode: z.string().min(1).max(20),
  kind: eventKindSchema,
  contactName: z.string().min(1).max(120),
  contactPhone: phoneSchema,
  contactEmail: z.string().email().optional(),
  eventDate: dateOnlySchema,
  startTime: hhmmSchema.optional(),
  expectedTables: z.number().int().min(0).max(1000).optional(),
  expectedGuests: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().max(2000).optional(),
});
export type PublicEventInquiryInput = z.infer<typeof publicEventInquirySchema>;

export const eventMenuLineSchema = z.object({
  itemId: idSchema.optional(),
  name: z.string().max(120).optional(),
  quantityPerTable: z.number().positive().max(100).default(1),
  unit: z.string().max(20).optional(),
  note: z.string().max(200).optional(),
});

export const eventMenuSchema = z.object({
  name: z.string().min(1).max(120),
  pricePerTable: amountSchema,
  tables: z.number().int().min(0).max(1000),
  notes: z.string().max(500).optional(),
  isFinal: z.boolean().default(false),
  lines: z.array(eventMenuLineSchema).default([]),
});
export const eventMenusReplaceSchema = z.object({ menus: z.array(eventMenuSchema).min(1).max(10) });
export type EventMenuInput = z.infer<typeof eventMenuSchema>;

export const eventServiceSchema = z.object({
  catalogId: idSchema.optional(),
  name: z.string().max(120).optional(),
  unitPrice: amountSchema.optional(),
  quantity: z.number().positive().max(10_000).default(1),
  note: z.string().max(300).optional(),
  isIncluded: z.boolean().default(false),
});
export const eventServicesReplaceSchema = z.object({ services: z.array(eventServiceSchema).max(100) });
export type EventServiceInput = z.infer<typeof eventServiceSchema>;

export const eventServiceCatalogSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  unit: z.string().min(1).max(20),
  price: amountSchema,
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const eventQuoteCreateSchema = z.object({
  discountAmount: amountSchema.optional(),
  serviceChargeBps: bpsSchema.optional(),
  vatBps: bpsSchema.optional(),
  validUntil: dateOnlySchema.optional(),
  terms: z.string().max(3000).optional(),
});

export const depositStepSchema = z
  .object({ label: z.string().min(1).max(100), percentBps: bpsSchema.optional(), amount: amountSchema.optional(), dueDate: dateOnlySchema })
  .refine((s) => s.percentBps !== undefined || s.amount !== undefined, 'Cần phần trăm hoặc số tiền');

export const eventContractSchema = z.object({
  depositSteps: z.array(depositStepSchema).min(1).max(6),
  finalDueDate: dateOnlySchema.optional(),
  signedDocumentUrl: z.string().url().optional(),
  note: z.string().max(500).optional(),
});
export type EventContractInput = z.infer<typeof eventContractSchema>;

export const eventConfirmSchema = z.object({
  confirmedTables: z.number().int().min(1).max(1000),
  reserveTables: z.number().int().min(0).max(100).default(0),
  guestsPerTable: z.number().int().min(1).max(20).optional(),
  menuTables: z.array(z.object({ menuId: idSchema, tables: z.number().int().min(0) })).optional(),
});

export const beoIssueSchema = z.object({
  timeline: z.array(z.object({ time: hhmmSchema, activity: z.string().min(1).max(200), owner: z.string().max(100).optional() })).default([]),
  staffing: z.array(z.object({ role: z.string().min(1).max(60), count: z.number().int().min(0), note: z.string().max(200).optional() })).default([]),
  specialNotes: z.string().max(2000).optional(),
  setupNotes: z.string().max(2000).optional(),
});
export type BeoIssueInput = z.infer<typeof beoIssueSchema>;

export const eventAdjustmentSchema = z.object({
  kind: z.enum(['EXTRA_TABLE', 'BEVERAGE', 'SERVICE', 'DAMAGE', 'DISCOUNT', 'OTHER']),
  description: z.string().min(1).max(200),
  quantity: z.number().positive().max(100_000).default(1),
  unitPrice: amountSchema.default(0),
  /** Bỏ trống thì = quantity × unitPrice; DISCOUNT luôn trừ */
  amount: z.number().int().optional(),
});

export const eventPaymentSchema = z.object({
  kind: z.enum(['DEPOSIT', 'BALANCE', 'REFUND']).default('DEPOSIT'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD_TERMINAL', 'VNPAY', 'MOMO', 'ZALOPAY', 'APPLE_PAY', 'GOOGLE_PAY', 'CREDIT']),
  amount: amountSchema.min(1),
  /** Đợt cọc được thanh toán (seq); bỏ trống thì gán vào đợt đến hạn sớm nhất */
  depositSeq: z.number().int().min(1).optional(),
  externalRef: z.string().max(100).optional(),
  note: z.string().max(300).optional(),
});

export const eventCancelSchema = z.object({ reason: z.string().min(1).max(500), refundAmount: amountSchema.optional() });

export const eventListQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  status: eventStatusSchema.optional(),
  kind: eventKindSchema.optional(),
  search: z.string().max(100).optional(),
});

export const hallCalendarQuerySchema = z.object({ from: dateOnlySchema, to: dateOnlySchema });

// Schema PATCH không áp giá trị mặc định (xem patchSchema)
export const hallPatchSchema = patchSchema(hallSchema);
export const eventServiceCatalogPatchSchema = patchSchema(eventServiceCatalogSchema);
