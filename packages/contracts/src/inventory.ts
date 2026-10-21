import { z } from 'zod';
import { amountSchema, dateOnlySchema, idSchema, patchSchema } from './common.js';

export const warehouseKindSchema = z.enum(['MAIN', 'KITCHEN', 'BAR', 'COLD', 'CENTRAL', 'FACTORY']);

export const warehouseSchema = z.object({
  branchId: idSchema.nullable().optional(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(100),
  kind: warehouseKindSchema.default('MAIN'),
  isActive: z.boolean().optional(),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;

const qty = z.number().min(0).max(1_000_000_000);

export const stockItemSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  baseUnit: z.string().min(1).max(20),
  purchaseUnit: z.string().min(1).max(20),
  purchaseUnitFactor: z.number().positive().max(1_000_000).default(1),
  minStock: qty.nullable().optional(),
  trackLots: z.boolean().default(false),
  defaultSupplierId: idSchema.nullable().optional(),
  /** Giá vốn mỗi đơn vị cơ sở (đồng, có thể lẻ) */
  costPerBaseUnit: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type StockItemInput = z.infer<typeof stockItemSchema>;

export const supplierSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(150),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  taxCode: z.string().max(20).nullable().optional(),
  paymentTerms: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const recipeSchema = z.object({
  variantId: idSchema.nullable().optional(),
  modifierOptionId: idSchema.nullable().optional(),
  yieldQty: z.number().positive().max(10_000).default(1),
  notes: z.string().max(500).nullable().optional(),
  lines: z.array(z.object({ stockItemId: idSchema, quantity: z.number().positive().max(1_000_000), wastageBps: z.number().int().min(0).max(10_000).default(0) })).min(1),
});
export type RecipeInput = z.infer<typeof recipeSchema>;

export const purchaseOrderSchema = z.object({
  branchId: idSchema,
  warehouseId: idSchema,
  supplierId: idSchema,
  expectedDate: dateOnlySchema.optional(),
  notes: z.string().max(500).optional(),
  lines: z.array(z.object({ stockItemId: idSchema, quantity: z.number().positive(), unit: z.string().min(1).max(20), unitPrice: amountSchema })).min(1),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const goodsReceiptSchema = z.object({
  branchId: idSchema,
  warehouseId: idSchema,
  poId: idSchema.optional(),
  supplierId: idSchema.optional(),
  receivedAt: z.string().datetime().optional(),
  invoiceNo: z.string().max(50).optional(),
  invoiceImageUrl: z.string().url().optional(),
  notes: z.string().max(500).optional(),
  lines: z
    .array(z.object({ stockItemId: idSchema, quantity: z.number().positive(), unit: z.string().min(1).max(20), unitPrice: amountSchema, lotCode: z.string().max(40).optional(), expiresAt: dateOnlySchema.optional() }))
    .min(1),
});
export type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;

export const stockTransferSchema = z.object({
  fromWarehouseId: idSchema,
  toWarehouseId: idSchema,
  notes: z.string().max(500).optional(),
  lines: z.array(z.object({ stockItemId: idSchema, quantitySent: z.number().positive() })).min(1),
});
export const stockTransferReceiveSchema = z.object({
  lines: z.array(z.object({ stockItemId: idSchema, quantityReceived: qty })).min(1),
});

export const stocktakeCreateSchema = z.object({
  warehouseId: idSchema,
  category: z.string().max(60).optional(),
  stockItemIds: z.array(idSchema).optional(),
  notes: z.string().max(500).optional(),
});
export const stocktakeCountSchema = z.object({ lines: z.array(z.object({ stockItemId: idSchema, countedQty: qty })).min(1) });

export const wasteSchema = z.object({
  warehouseId: idSchema,
  reason: z.string().min(1).max(200),
  lines: z.array(z.object({ stockItemId: idSchema, quantity: z.number().positive() })).min(1),
});

export const manualAdjustSchema = z.object({
  warehouseId: idSchema,
  reason: z.string().min(1).max(200),
  lines: z.array(z.object({ stockItemId: idSchema, quantity: z.number() })).min(1),
});

export const movementsQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  stockItemId: idSchema.optional(),
  kind: z.string().max(30).optional(),
});

export const STOCK_MOVEMENT_LABELS: Record<string, string> = {
  SALE: 'Bán hàng (trừ theo định lượng)',
  VOID_RETURN: 'Hủy món hoàn kho',
  PURCHASE: 'Nhập mua',
  TRANSFER_OUT: 'Chuyển đi',
  TRANSFER_IN: 'Chuyển đến',
  STOCKTAKE_ADJ: 'Điều chỉnh kiểm kê',
  WASTE: 'Hao hụt, hủy',
  PRODUCTION_IN: 'Sản xuất nhập',
  PRODUCTION_OUT: 'Sản xuất xuất',
  MANUAL: 'Điều chỉnh tay',
};

// Schema PATCH không áp giá trị mặc định (xem patchSchema)
export const warehousePatchSchema = patchSchema(warehouseSchema);
export const stockItemPatchSchema = patchSchema(stockItemSchema);
export const supplierPatchSchema = patchSchema(supplierSchema);
