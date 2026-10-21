import { z } from 'zod';
import { amountSchema, dateOnlySchema, idSchema, paginationQuerySchema, patchSchema, phoneSchema } from './common.js';

export const customerSearchQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(100).optional(),
  tag: z.string().max(40).optional(),
  tierId: idSchema.optional(),
  birthdayMonth: z.coerce.number().int().min(1).max(12).optional(),
});

export const customerCreateSchema = z.object({
  phone: phoneSchema,
  fullName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  birthday: dateOnlySchema.optional(),
  gender: z.enum(['M', 'F', 'O']).optional(),
  companyName: z.string().max(200).optional(),
  taxCode: z.string().max(20).optional(),
  companyAddress: z.string().max(300).optional(),
  tags: z.array(z.string().max(40)).default([]),
  notes: z.string().max(1000).optional(),
  allergies: z.string().max(500).optional(),
  preferences: z.string().max(500).optional(),
  marketingConsent: z.boolean().default(false),
});
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

// patchSchema thay vì .partial(): không áp mặc định, nếu không mỗi PATCH sẽ đặt lại tags = [] và
// marketingConsent = false (âm thầm thu hồi đồng ý nhận tin của khách).
export const customerUpdateSchema = patchSchema(
  customerCreateSchema.extend({
    email: z.string().email().nullable(),
    birthday: dateOnlySchema.nullable(),
    companyName: z.string().max(200).nullable(),
    taxCode: z.string().max(20).nullable(),
    companyAddress: z.string().max(300).nullable(),
    notes: z.string().max(1000).nullable(),
    allergies: z.string().max(500).nullable(),
    preferences: z.string().max(500).nullable(),
    tierId: idSchema.nullable(),
  }),
);
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const mergeCustomersSchema = z.object({
  /** Hồ sơ bị gộp (sẽ ẩn danh) */
  sourceId: idSchema,
  /** Hồ sơ giữ lại */
  targetId: idSchema,
});

export const attachCustomerSchema = z
  .object({ customerId: idSchema.optional(), phone: phoneSchema.optional(), fullName: z.string().max(100).optional() })
  .refine((v) => v.customerId || v.phone, { message: 'Cần customerId hoặc số điện thoại' });

export const pointsAdjustSchema = z.object({
  points: z.number().int().refine((v) => v !== 0, 'Số điểm phải khác 0'),
  reason: z.string().min(1).max(200),
});

export const loyaltyTierSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(60),
  minSpend12m: amountSchema,
  earnMultiplierBps: z.number().int().min(0).max(100_000).default(10_000),
  benefits: z.record(z.string(), z.unknown()).default({}),
  sortOrder: z.number().int().default(0),
});

export const voucherCreateSchema = z.object({
  /** Bỏ trống để hệ thống sinh mã */
  code: z.string().min(4).max(40).optional(),
  kind: z.enum(['PERCENT', 'AMOUNT']),
  /** PERCENT: basis points (1000 = 10%); AMOUNT: đồng */
  value: z.number().int().min(1),
  minBill: amountSchema.optional(),
  maxDiscount: amountSchema.optional(),
  branchIds: z.array(idSchema).default([]),
  validFrom: z.string().datetime({ offset: true }).optional(),
  validTo: z.string().datetime({ offset: true }).optional(),
  usageLimit: z.number().int().min(1).default(1),
  customerId: idSchema.optional(),
  campaignId: idSchema.optional(),
  /** Số voucher sinh hàng loạt (chỉ khi không nhập code) */
  quantity: z.number().int().min(1).max(500).default(1),
});
export type VoucherCreateInput = z.infer<typeof voucherCreateSchema>;

export const feedbackSchema = z.object({
  billId: idSchema.optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  likedItemIds: z.array(idSchema).default([]),
  tags: z.array(z.string().max(40)).default([]),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const feedbackResponseSchema = z.object({ response: z.string().min(1).max(1000) });

export const campaignSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  kind: z.enum(['BIRTHDAY', 'WINBACK', 'WELCOME', 'REVIEW', 'CUSTOM']),
  rules: z.record(z.string(), z.unknown()).default({}),
  templateCode: z.string().max(40).optional(),
  voucherTemplate: voucherCreateSchema.omit({ code: true, customerId: true, campaignId: true, quantity: true }).optional(),
  isActive: z.boolean().default(true),
});

export const TIER_LABELS: Record<string, string> = {
  MEMBER: 'Thành viên',
  SILVER: 'Bạc',
  GOLD: 'Vàng',
  DIAMOND: 'Kim cương',
};
