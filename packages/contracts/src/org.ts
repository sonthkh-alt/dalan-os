import { z } from 'zod';
import { amountSchema, bpsSchema, hhmmSchema, idSchema, patchSchema } from './common.js';

export const branchUpdateSchema = z
  .object({
    name: z.string().min(1).max(120),
    address: z.string().max(300).nullable(),
    phone: z.string().max(30).nullable(),
    email: z.string().email().nullable(),
    taxCode: z.string().max(20).nullable(),
    businessDayCutoff: hhmmSchema,
    vatRateBps: bpsSchema,
    priceIncludesVat: z.boolean(),
    serviceChargeBps: bpsSchema,
    rounding: z.enum(['NONE', 'TO_500', 'TO_1000']),
    qrOrderMode: z.enum(['DIRECT', 'STAFF_CONFIRM']),
    guestJoinMode: z.enum(['OPEN', 'PIN', 'STAFF']),
    defaultDiningMinutes: z.number().int().min(15).max(600),
    bankBin: z.string().regex(/^\d{6}$/).nullable(),
    bankAccountNo: z.string().regex(/^[A-Za-z0-9]{1,19}$/).nullable(),
    bankAccountName: z.string().max(60).nullable(),
    receiptHeader: z.string().max(300).nullable(),
    receiptFooter: z.string().max(300).nullable(),
    openingHours: z.record(z.string(), z.unknown()),
    settings: z.record(z.string(), z.unknown()),
    isActive: z.boolean(),
  })
  .partial();
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

export const areaSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  kind: z.enum(['HALL', 'VIP_ROOM', 'OUTDOOR', 'BAR', 'TAKEAWAY', 'VIRTUAL']).default('HALL'),
  floor: z.number().int().nullable().optional(),
  sortOrder: z.number().int().default(0),
  serviceChargeBps: bpsSchema.nullable().optional(),
  minSpend: amountSchema.nullable().optional(),
  layout: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});
export type AreaInput = z.infer<typeof areaSchema>;

export const tableSchema = z.object({
  areaId: idSchema,
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(60),
  minSeats: z.number().int().min(1).default(1),
  maxSeats: z.number().int().min(1).default(4),
  shape: z.enum(['ROUND', 'RECT', 'SQUARE', 'BAR']).default('ROUND'),
  posX: z.number().int().default(0),
  posY: z.number().int().default(0),
  width: z.number().int().min(20).default(100),
  height: z.number().int().min(20).default(100),
  rotation: z.number().int().default(0),
  isPrivateRoom: z.boolean().default(false),
  minSpend: amountSchema.nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().optional(),
});
export type TableInput = z.infer<typeof tableSchema>;

export const tableLayoutBatchSchema = z.object({
  tables: z.array(
    z.object({ id: idSchema, posX: z.number().int(), posY: z.number().int(), width: z.number().int().optional(), height: z.number().int().optional(), rotation: z.number().int().optional() }),
  ),
});

export const stationSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(60),
  mode: z.enum(['KDS', 'PRINTER', 'BOTH']).default('BOTH'),
  printerId: idSchema.nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().optional(),
});

export const printerSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(60),
  kind: z.enum(['RECEIPT', 'KITCHEN', 'LABEL']).default('KITCHEN'),
  connection: z.enum(['NETWORK', 'USB', 'BLUETOOTH']).default('NETWORK'),
  address: z.string().max(100).nullable().optional(),
  paperWidthMm: z.union([z.literal(58), z.literal(80)]).default(80),
  isActive: z.boolean().optional(),
});

export const staffCreateSchema = z.object({
  code: z.string().min(1).max(20),
  fullName: z.string().min(1).max(100),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  roleId: idSchema,
  branchIds: z.array(idSchema).min(1),
  pin: z.string().regex(/^\d{4,6}$/).optional(),
  password: z.string().min(8).max(100).optional(),
});
export const staffUpdateSchema = patchSchema(staffCreateSchema).extend({ isActive: z.boolean().optional() });

export const roleSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(60),
  permissions: z.array(z.string()),
});

export const shiftOpenSchema = z.object({ branchId: idSchema, openingCash: amountSchema, notes: z.string().max(300).optional() });
export const shiftCloseSchema = z.object({ closingCashCounted: amountSchema, notes: z.string().max(300).optional() });
export const cashMovementSchema = z.object({
  kind: z.enum(['IN', 'OUT']),
  amount: amountSchema.min(1),
  reason: z.string().min(1).max(100),
  note: z.string().max(300).optional(),
  attachmentUrl: z.string().url().optional(),
});

// Schema PATCH không áp giá trị mặc định (xem patchSchema)
export const areaPatchSchema = patchSchema(areaSchema);
export const tablePatchSchema = patchSchema(tableSchema);
export const stationPatchSchema = patchSchema(stationSchema);
export const printerPatchSchema = patchSchema(printerSchema);
export const rolePatchSchema = patchSchema(roleSchema);
