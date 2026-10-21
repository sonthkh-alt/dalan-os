import { z } from 'zod';
import { amountSchema, bpsSchema, idSchema, patchSchema, scheduleSchema } from './common.js';

export const pricingModeSchema = z.enum(['FIXED', 'VARIANT', 'WEIGHT', 'MARKET', 'OPEN']);

export const menuSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  nameEn: z.string().max(100).nullable().optional(),
  kind: z.enum(['ALACARTE', 'BREAKFAST', 'LUNCH', 'SET', 'BANQUET', 'DRINKS', 'VEGETARIAN', 'OTHER']).default('ALACARTE'),
  schedule: scheduleSchema.default({}),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().optional(),
  branchIds: z.array(idSchema).optional(),
});
export type MenuInput = z.infer<typeof menuSchema>;

export const categorySchema = z.object({
  menuId: idSchema,
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  nameEn: z.string().max(100).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  defaultStationCode: z.string().max(20).nullable().optional(),
  schedule: scheduleSchema.default({}),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const variantSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(60),
  nameEn: z.string().max(60).nullable().optional(),
  price: amountSchema,
  sortOrder: z.number().int().default(0),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().optional(),
});

export const modifierOptionSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(60),
  nameEn: z.string().max(60).nullable().optional(),
  priceDelta: z.number().int().default(0),
  sortOrder: z.number().int().default(0),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().optional(),
});

export const modifierGroupSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(60),
  nameEn: z.string().max(60).nullable().optional(),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(0).default(1),
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  options: z.array(modifierOptionSchema).default([]),
});
export type ModifierGroupInput = z.infer<typeof modifierGroupSchema>;

export const menuItemSchema = z.object({
  categoryId: idSchema,
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  nameEn: z.string().max(120).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  descriptionEn: z.string().max(500).nullable().optional(),
  unit: z.string().min(1).max(20).default('phần'),
  pricingMode: pricingModeSchema.default('FIXED'),
  basePrice: amountSchema.nullable().optional(),
  vatRateBps: bpsSchema.nullable().optional(),
  defaultStationCode: z.string().max(20).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isVegetarian: z.boolean().default(false),
  isSignature: z.boolean().default(false),
  isSpicy: z.boolean().default(false),
  countEmpties: z.boolean().default(false),
  prepMinutes: z.number().int().min(0).nullable().optional(),
  tags: z.array(z.string().max(30)).default([]),
  allergens: z.array(z.string().max(30)).default([]),
  sortOrder: z.number().int().default(0),
  status: z.enum(['ACTIVE', 'HIDDEN', 'DISCONTINUED']).default('ACTIVE'),
  variants: z.array(variantSchema).optional(),
  modifierGroupIds: z.array(idSchema).optional(),
});
export type MenuItemInput = z.infer<typeof menuItemSchema>;
export const menuItemUpdateSchema = patchSchema(menuItemSchema).extend({ priceChangeReason: z.string().max(200).optional() });
export const menuPatchSchema = patchSchema(menuSchema);
export const categoryPatchSchema = patchSchema(categorySchema);

export const branchItemOverrideSchema = z.object({
  price: amountSchema.nullable().optional(),
  stationCode: z.string().max(20).nullable().optional(),
  isAvailable: z.boolean().optional(),
  stockLimit: z.number().int().min(0).nullable().optional(),
});

export const soldOutSchema = z.object({
  /** 'today' = hết tới giờ chốt ngày; 'indefinite' = hết vô thời hạn; 'clear' = mở bán lại */
  mode: z.enum(['today', 'indefinite', 'clear']),
});

/** Hình dạng thực đơn trả cho app khách và POS (đã áp dụng ghi đè theo cơ sở). */
export interface BranchMenuView {
  branch: { id: string; code: string; name: string; qrOrderMode: string; priceIncludesVat: boolean; vatRateBps: number; serviceChargeBps: number };
  generatedAt: string;
  menus: {
    id: string;
    code: string;
    name: string;
    nameEn: string | null;
    kind: string;
    schedule: { days?: number[]; from?: string; to?: string };
    isOpenNow: boolean;
    categories: {
      id: string;
      code: string;
      name: string;
      nameEn: string | null;
      imageUrl: string | null;
      schedule: { days?: number[]; from?: string; to?: string };
      isOpenNow: boolean;
      items: BranchMenuItemView[];
    }[];
  }[];
}

export interface BranchMenuItemView {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  unit: string;
  pricingMode: string;
  price: number | null;
  vatRateBps: number;
  imageUrl: string | null;
  isVegetarian: boolean;
  isSignature: boolean;
  isSpicy: boolean;
  countEmpties: boolean;
  tags: string[];
  allergens: string[];
  stationCode: string | null;
  isAvailable: boolean;
  soldOut: boolean;
  stockLeft: number | null;
  variants: { id: string; code: string; name: string; nameEn: string | null; price: number; isDefault: boolean }[];
  modifierGroups: {
    id: string;
    code: string;
    name: string;
    nameEn: string | null;
    minSelect: number;
    maxSelect: number;
    isRequired: boolean;
    options: { id: string; code: string; name: string; nameEn: string | null; priceDelta: number; isDefault: boolean }[];
  }[];
}
