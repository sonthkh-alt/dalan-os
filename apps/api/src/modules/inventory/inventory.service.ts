import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Prisma } from '@dalan/db';
import { businessDate, documentCode } from '@dalan/domain';
import { DomainEvents, type GoodsReceiptInput, type PurchaseOrderInput, type RecipeInput, type StockItemInput, type WarehouseInput } from '@dalan/contracts';
import type { z } from 'zod';
import type { manualAdjustSchema, movementsQuerySchema, stockTransferReceiveSchema, stockTransferSchema, stocktakeCountSchema, stocktakeCreateSchema, supplierSchema, wasteSchema } from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { Errors } from '../../common/errors.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { OutboxService, type PublishedEvent } from '../outbox/outbox.service.js';

type Tx = Prisma.TransactionClient;
type MovementKind = 'SALE' | 'VOID_RETURN' | 'PURCHASE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'STOCKTAKE_ADJ' | 'WASTE' | 'PRODUCTION_IN' | 'PRODUCTION_OUT' | 'MANUAL';

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fromDateOnly = (s: string) => new Date(`${s}T00:00:00+07:00`);
const nextDay = (s: string) => new Date(fromDateOnly(s).getTime() + 86_400_000);

interface MovementInput {
  warehouseId: string;
  stockItemId: string;
  kind: MovementKind;
  /** Số lượng theo đơn vị cơ sở, có dấu (+ nhập, − xuất). */
  quantity: number;
  unitCost: number;
  refType?: string;
  refId?: string;
  reason?: string;
  createdById?: string | null;
}

@Injectable()
export class InventoryService implements OnModuleInit {
  private readonly logger = new Logger('Inventory');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.outbox.on(DomainEvents.orderSent, (e) => this.onOrderSent(e));
    this.outbox.on(DomainEvents.orderLineVoided, (e) => this.onLineVoided(e));
  }

  // ───────────────── Kho ─────────────────

  listWarehouses(orgId: string, branchId?: string) {
    return this.prisma.warehouse.findMany({
      where: branchId ? { branchId } : { OR: [{ branch: { orgId } }, { branchId: null }] },
      orderBy: { code: 'asc' },
      include: { branch: { select: { id: true, code: true, name: true } }, _count: { select: { levels: true } } },
    });
  }
  createWarehouse(input: WarehouseInput) {
    return this.prisma.warehouse.create({ data: { ...input, code: input.code.toUpperCase() } });
  }
  async updateWarehouse(id: string, input: Partial<WarehouseInput>) {
    const w = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!w) throw Errors.notFound('kho');
    return this.prisma.warehouse.update({ where: { id }, data: { ...input, code: input.code?.toUpperCase() } });
  }

  // ───────────────── Nguyên liệu, nhà cung cấp ─────────────────

  async listStockItems(orgId: string, q: { search?: string; category?: string; warehouseId?: string }) {
    const items = await this.prisma.stockItem.findMany({
      where: {
        orgId,
        ...(q.category ? { category: q.category } : {}),
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search.toUpperCase() } }] } : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { levels: q.warehouseId ? { where: { warehouseId: q.warehouseId } } : true },
    });
    return items.map((it) => ({ ...it, totalQuantity: round3(it.levels.reduce((s, l) => s + Number(l.quantity), 0)) }));
  }

  async getStockItem(orgId: string, id: string) {
    const item = await this.prisma.stockItem.findFirst({
      where: { id, orgId },
      include: { levels: { include: { warehouse: { select: { id: true, code: true, name: true } } } }, movements: { orderBy: { occurredAt: 'desc' }, take: 50, include: { warehouse: { select: { code: true } } } }, recipeLines: { include: { recipe: { select: { itemId: true, item: { select: { name: true } } } } } } },
    });
    if (!item) throw Errors.notFound('nguyên liệu');
    return item;
  }

  createStockItem(orgId: string, input: StockItemInput) {
    return this.prisma.stockItem.create({ data: { ...input, orgId, code: input.code.toUpperCase(), costPerBaseUnit: input.costPerBaseUnit ?? 0 } });
  }

  async updateStockItem(orgId: string, id: string, input: Partial<StockItemInput>) {
    const item = await this.prisma.stockItem.findFirst({ where: { id, orgId } });
    if (!item) throw Errors.notFound('nguyên liệu');
    return this.prisma.stockItem.update({ where: { id }, data: { ...input, code: input.code?.toUpperCase() } });
  }

  listSuppliers(orgId: string) {
    return this.prisma.supplier.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }
  createSupplier(orgId: string, input: z.infer<typeof supplierSchema>) {
    return this.prisma.supplier.create({ data: { ...input, orgId, code: input.code.toUpperCase() } });
  }
  async updateSupplier(orgId: string, id: string, input: Partial<z.infer<typeof supplierSchema>>) {
    const s = await this.prisma.supplier.findFirst({ where: { id, orgId } });
    if (!s) throw Errors.notFound('nhà cung cấp');
    return this.prisma.supplier.update({ where: { id }, data: { ...input, code: input.code?.toUpperCase() } });
  }

  // ───────────────── Định lượng ─────────────────

  async getRecipes(itemId: string) {
    const recipes = await this.prisma.recipe.findMany({ where: { itemId }, include: { lines: { include: { stockItem: { select: { id: true, code: true, name: true, baseUnit: true, costPerBaseUnit: true } } } } } });
    return recipes.map((r) => ({
      ...r,
      estimatedCost: Math.round(r.lines.reduce((s, l) => s + Number(l.quantity) * (1 + l.wastageBps / 10_000) * Number(l.stockItem.costPerBaseUnit), 0) / Number(r.yieldQty)),
    }));
  }

  async upsertRecipe(orgId: string, itemId: string, input: RecipeInput) {
    const item = await this.prisma.menuItem.findFirst({ where: { id: itemId, orgId } });
    if (!item) throw Errors.notFound('món');
    const stockIds = input.lines.map((l) => l.stockItemId);
    const count = await this.prisma.stockItem.count({ where: { id: { in: stockIds }, orgId } });
    if (count !== new Set(stockIds).size) throw Errors.notFound('nguyên liệu trong định lượng');
    const recipeId = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.recipe.findFirst({ where: { itemId, variantId: input.variantId ?? null, modifierOptionId: input.modifierOptionId ?? null } });
      const recipe = existing
        ? await tx.recipe.update({ where: { id: existing.id }, data: { yieldQty: input.yieldQty, notes: input.notes ?? null, isActive: true } })
        : await tx.recipe.create({ data: { itemId, variantId: input.variantId ?? null, modifierOptionId: input.modifierOptionId ?? null, yieldQty: input.yieldQty, notes: input.notes ?? null } });
      await tx.recipeLine.deleteMany({ where: { recipeId: recipe.id } });
      await tx.recipeLine.createMany({ data: input.lines.map((l) => ({ recipeId: recipe.id, stockItemId: l.stockItemId, quantity: l.quantity, wastageBps: l.wastageBps })) });
      return recipe.id;
    });
    return (await this.getRecipes(itemId)).find((r) => r.id === recipeId);
  }

  // ───────────────── Biến động tồn ─────────────────

  private async applyMovement(tx: Tx, m: MovementInput) {
    const qty = round4(m.quantity);
    if (qty === 0) return null;
    const movement = await tx.stockMovement.create({
      data: { warehouseId: m.warehouseId, stockItemId: m.stockItemId, kind: m.kind, quantity: qty, unitCost: round4(m.unitCost), refType: m.refType ?? null, refId: m.refId ?? null, reason: m.reason ?? null, createdById: m.createdById ?? null },
    });
    await tx.stockLevel.upsert({
      where: { warehouseId_stockItemId: { warehouseId: m.warehouseId, stockItemId: m.stockItemId } },
      update: { quantity: { increment: qty } },
      create: { warehouseId: m.warehouseId, stockItemId: m.stockItemId, quantity: qty },
    });
    return movement;
  }

  private toBaseQty(item: { baseUnit: string; purchaseUnit: string; purchaseUnitFactor: Prisma.Decimal; name: string }, unit: string, quantity: number): { qty: number; factor: number } {
    if (unit === item.baseUnit) return { qty: quantity, factor: 1 };
    if (unit === item.purchaseUnit) return { qty: quantity * Number(item.purchaseUnitFactor), factor: Number(item.purchaseUnitFactor) };
    throw Errors.invalid('UNIT_MISMATCH', `${item.name}: đơn vị "${unit}" không phải ${item.baseUnit} hay ${item.purchaseUnit}`);
  }

  /** Giá vốn bình quân gia quyền theo tổng tồn của tổ chức. */
  private async updateAverageCost(tx: Tx, stockItemId: string, qtyBase: number, costPerBase: number) {
    const item = await tx.stockItem.findUniqueOrThrow({ where: { id: stockItemId } });
    const levels = await tx.stockLevel.aggregate({ where: { stockItemId }, _sum: { quantity: true } });
    const onHand = Math.max(0, Number(levels._sum.quantity ?? 0) - qtyBase); // tồn trước khi nhập (level đã được cộng)
    const newCost = onHand + qtyBase > 0 ? (onHand * Number(item.costPerBaseUnit) + qtyBase * costPerBase) / (onHand + qtyBase) : costPerBase;
    await tx.stockItem.update({ where: { id: stockItemId }, data: { costPerBaseUnit: round4(newCost) } });
    return round4(newCost);
  }

  // ───────────────── Đơn đặt hàng và nhập kho ─────────────────

  async createPurchaseOrder(input: PurchaseOrderInput, staff: StaffPrincipal) {
    const items = await this.prisma.stockItem.findMany({ where: { id: { in: input.lines.map((l) => l.stockItemId) } } });
    for (const l of input.lines) {
      const item = items.find((i) => i.id === l.stockItemId);
      if (!item) throw Errors.notFound(`nguyên liệu ${l.stockItemId}`);
      this.toBaseQty(item, l.unit, l.quantity);
    }
    const code = await this.nextCode('PO');
    return this.prisma.purchaseOrder.create({
      data: {
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        supplierId: input.supplierId,
        code,
        expectedDate: input.expectedDate ? new Date(`${input.expectedDate}T00:00:00Z`) : null,
        notes: input.notes ?? null,
        createdById: staff.staffId,
        total: BigInt(input.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPrice), 0)),
        lines: { create: input.lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity, unit: l.unit, unitPrice: BigInt(l.unitPrice) })) },
      },
      include: { lines: { include: { stockItem: { select: { code: true, name: true } } } }, supplier: true },
    });
  }

  listPurchaseOrders(branchId: string, status?: string) {
    return this.prisma.purchaseOrder.findMany({ where: { branchId, ...(status ? { status: status as 'DRAFT' } : {}) }, orderBy: { createdAt: 'desc' }, take: 200, include: { supplier: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } }, _count: { select: { lines: true } } } });
  }

  async getPurchaseOrder(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: { include: { stockItem: { select: { code: true, name: true, baseUnit: true, purchaseUnit: true } } } }, supplier: true, warehouse: true, receipts: { select: { id: true, code: true, receivedAt: true, total: true } } } });
    if (!po) throw Errors.notFound('đơn đặt hàng');
    return po;
  }

  async setPurchaseOrderStatus(id: string, to: 'SENT' | 'CANCELLED') {
    const po = await this.getPurchaseOrder(id);
    if (to === 'SENT' && po.status !== 'DRAFT') throw Errors.state('Chỉ gửi đơn ở trạng thái nháp');
    if (to === 'CANCELLED' && !['DRAFT', 'SENT'].includes(po.status)) throw Errors.state('Đơn đã nhận hàng, không hủy được');
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: to } });
  }

  async createGoodsReceipt(input: GoodsReceiptInput, staff: StaffPrincipal) {
    const items = await this.prisma.stockItem.findMany({ where: { id: { in: input.lines.map((l) => l.stockItemId) } } });
    const code = await this.nextCode('GR');
    const receiptId = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: {
          branchId: input.branchId,
          warehouseId: input.warehouseId,
          poId: input.poId ?? null,
          supplierId: input.supplierId ?? null,
          code,
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
          invoiceNo: input.invoiceNo ?? null,
          invoiceImageUrl: input.invoiceImageUrl ?? null,
          notes: input.notes ?? null,
          createdById: staff.staffId,
          total: BigInt(input.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPrice), 0)),
          lines: { create: input.lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity, unit: l.unit, unitPrice: BigInt(l.unitPrice), lotCode: l.lotCode ?? null, expiresAt: l.expiresAt ? new Date(`${l.expiresAt}T00:00:00Z`) : null })) },
        },
      });
      for (const l of input.lines) {
        const item = items.find((i) => i.id === l.stockItemId);
        if (!item) throw Errors.notFound(`nguyên liệu ${l.stockItemId}`);
        const { qty, factor } = this.toBaseQty(item, l.unit, l.quantity);
        const costPerBase = l.unitPrice / factor;
        await this.applyMovement(tx, { warehouseId: input.warehouseId, stockItemId: item.id, kind: 'PURCHASE', quantity: qty, unitCost: costPerBase, refType: 'GoodsReceipt', refId: receipt.id, createdById: staff.staffId });
        await this.updateAverageCost(tx, item.id, qty, costPerBase);
        if (input.poId) {
          const poLine = await tx.purchaseOrderLine.findFirst({ where: { poId: input.poId, stockItemId: item.id } });
          if (poLine) await tx.purchaseOrderLine.update({ where: { id: poLine.id }, data: { receivedQty: { increment: l.unit === poLine.unit ? l.quantity : qty / (poLine.unit === item.baseUnit ? 1 : Number(item.purchaseUnitFactor)) } } });
        }
      }
      if (input.poId) {
        const lines = await tx.purchaseOrderLine.findMany({ where: { poId: input.poId } });
        const complete = lines.every((pl) => Number(pl.receivedQty) >= Number(pl.quantity));
        await tx.purchaseOrder.update({ where: { id: input.poId }, data: { status: complete ? 'RECEIVED' : 'PARTIAL' } });
      }
      return receipt.id;
    });
    return this.prisma.goodsReceipt.findUniqueOrThrow({ where: { id: receiptId }, include: { lines: { include: { stockItem: { select: { code: true, name: true, costPerBaseUnit: true } } } }, supplier: true, warehouse: true } });
  }

  listGoodsReceipts(branchId: string) {
    return this.prisma.goodsReceipt.findMany({ where: { branchId }, orderBy: { receivedAt: 'desc' }, take: 200, include: { supplier: { select: { name: true } }, warehouse: { select: { code: true } }, _count: { select: { lines: true } } } });
  }

  // ───────────────── Chuyển kho ─────────────────

  async createTransfer(input: z.infer<typeof stockTransferSchema>, staff: StaffPrincipal) {
    if (input.fromWarehouseId === input.toWarehouseId) throw Errors.invalid('SAME_WAREHOUSE', 'Kho đi và kho đến phải khác nhau');
    const code = await this.nextCode('TR');
    return this.prisma.stockTransfer.create({
      data: { fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, code, notes: input.notes ?? null, createdById: staff.staffId, lines: { create: input.lines.map((l) => ({ stockItemId: l.stockItemId, quantitySent: l.quantitySent })) } },
      include: { lines: { include: { stockItem: { select: { code: true, name: true, baseUnit: true } } } } },
    });
  }

  listTransfers(warehouseId?: string) {
    return this.prisma.stockTransfer.findMany({ where: warehouseId ? { OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] } : {}, orderBy: { createdAt: 'desc' }, take: 200, include: { fromWarehouse: { select: { code: true, name: true } }, toWarehouse: { select: { code: true, name: true } }, _count: { select: { lines: true } } } });
  }

  async getTransfer(id: string) {
    const tr = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromWarehouse: { select: { id: true, code: true, name: true } },
        toWarehouse: { select: { id: true, code: true, name: true } },
        lines: { include: { stockItem: { select: { id: true, code: true, name: true, baseUnit: true, costPerBaseUnit: true } } } },
      },
    });
    if (!tr) throw Errors.notFound('phiếu chuyển kho');
    return tr;
  }

  listStocktakes(query: { warehouseId?: string; status?: string }) {
    return this.prisma.stocktake.findMany({
      where: { ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}), ...(query.status ? { status: query.status as 'DRAFT' } : {}) },
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: { warehouse: { select: { id: true, code: true, name: true } }, _count: { select: { lines: true } } },
    });
  }

  async sendTransfer(id: string, staff: StaffPrincipal) {
    const tr = await this.prisma.stockTransfer.findUnique({ where: { id }, include: { lines: { include: { stockItem: true } } } });
    if (!tr) throw Errors.notFound('phiếu chuyển kho');
    if (tr.status !== 'DRAFT') throw Errors.state('Phiếu đã gửi');
    await this.prisma.$transaction(async (tx) => {
      for (const l of tr.lines) {
        const level = await tx.stockLevel.findUnique({ where: { warehouseId_stockItemId: { warehouseId: tr.fromWarehouseId, stockItemId: l.stockItemId } } });
        if (Number(level?.quantity ?? 0) < Number(l.quantitySent)) throw Errors.state(`${l.stockItem.name}: tồn kho đi không đủ (${Number(level?.quantity ?? 0)} ${l.stockItem.baseUnit})`);
        await this.applyMovement(tx, { warehouseId: tr.fromWarehouseId, stockItemId: l.stockItemId, kind: 'TRANSFER_OUT', quantity: -Number(l.quantitySent), unitCost: Number(l.stockItem.costPerBaseUnit), refType: 'StockTransfer', refId: id, createdById: staff.staffId });
      }
      await tx.stockTransfer.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
    });
    return this.prisma.stockTransfer.findUniqueOrThrow({ where: { id }, include: { lines: true } });
  }

  async receiveTransfer(id: string, input: z.infer<typeof stockTransferReceiveSchema>, staff: StaffPrincipal) {
    const tr = await this.prisma.stockTransfer.findUnique({ where: { id }, include: { lines: { include: { stockItem: true } } } });
    if (!tr) throw Errors.notFound('phiếu chuyển kho');
    if (tr.status !== 'SENT') throw Errors.state('Phiếu chưa gửi hoặc đã nhận');
    await this.prisma.$transaction(async (tx) => {
      for (const l of tr.lines) {
        const received = input.lines.find((x) => x.stockItemId === l.stockItemId)?.quantityReceived ?? Number(l.quantitySent);
        await tx.stockTransferLine.update({ where: { id: l.id }, data: { quantityReceived: received } });
        // Kho nguồn đã trừ đủ số gửi. Thiếu khi nhận: ghi nhập đủ số gửi rồi ghi hao hụt phần thiếu,
        // tồn kho cuối = số thực nhận, còn khoản thất thoát hiện trong báo cáo hao hụt kèm giá vốn.
        const sent = Number(l.quantitySent);
        const lost = round4(sent - received);
        const unitCost = Number(l.stockItem.costPerBaseUnit);
        await this.applyMovement(tx, { warehouseId: tr.toWarehouseId, stockItemId: l.stockItemId, kind: 'TRANSFER_IN', quantity: lost > 0 ? sent : received, unitCost, refType: 'StockTransfer', refId: id, createdById: staff.staffId });
        if (lost > 0) {
          await this.applyMovement(tx, { warehouseId: tr.toWarehouseId, stockItemId: l.stockItemId, kind: 'WASTE', quantity: -lost, unitCost, refType: 'StockTransfer', refId: id, reason: `Thiếu khi nhận chuyển kho ${tr.code}`, createdById: staff.staffId });
        }
      }
      await tx.stockTransfer.update({ where: { id }, data: { status: 'RECEIVED', receivedAt: new Date(), receivedById: staff.staffId } });
    });
    return this.prisma.stockTransfer.findUniqueOrThrow({ where: { id }, include: { lines: true } });
  }

  // ───────────────── Kiểm kê ─────────────────

  async createStocktake(input: z.infer<typeof stocktakeCreateSchema>, staff: StaffPrincipal) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: input.warehouseId }, include: { branch: { select: { orgId: true } } } });
    if (!warehouse) throw Errors.notFound('kho');
    const items = await this.prisma.stockItem.findMany({
      where: { isActive: true, ...(input.category ? { category: input.category } : {}), ...(input.stockItemIds?.length ? { id: { in: input.stockItemIds } } : {}), ...(warehouse.branch ? { orgId: warehouse.branch.orgId } : {}) },
      include: { levels: { where: { warehouseId: input.warehouseId } } },
    });
    if (items.length === 0) throw Errors.invalid('NO_ITEMS', 'Không có nguyên liệu để kiểm kê');
    const code = await this.nextCode('ST');
    return this.prisma.stocktake.create({
      data: { warehouseId: input.warehouseId, code, status: 'COUNTING', notes: input.notes ?? null, lines: { create: items.map((it) => ({ stockItemId: it.id, expectedQty: Number(it.levels[0]?.quantity ?? 0) })) } },
      include: { lines: { include: { stockItem: { select: { code: true, name: true, baseUnit: true, category: true } } } } },
    });
  }

  async getStocktake(id: string) {
    const st = await this.prisma.stocktake.findUnique({ where: { id }, include: { warehouse: true, lines: { include: { stockItem: { select: { code: true, name: true, baseUnit: true, category: true, costPerBaseUnit: true } } }, orderBy: { stockItem: { name: 'asc' } } } } });
    if (!st) throw Errors.notFound('phiếu kiểm kê');
    const varianceValue = st.lines.reduce((s, l) => s + Number(l.varianceValue ?? 0), 0);
    return { ...st, varianceValue, countedLines: st.lines.filter((l) => l.countedQty !== null).length };
  }

  async countStocktake(id: string, input: z.infer<typeof stocktakeCountSchema>) {
    const st = await this.prisma.stocktake.findUnique({ where: { id }, include: { lines: { include: { stockItem: true } } } });
    if (!st) throw Errors.notFound('phiếu kiểm kê');
    if (!['COUNTING', 'REVIEW'].includes(st.status)) throw Errors.state('Phiếu không ở trạng thái đếm');
    await this.prisma.$transaction(async (tx) => {
      for (const c of input.lines) {
        const line = st.lines.find((l) => l.stockItemId === c.stockItemId);
        if (!line) continue;
        const variance = round3(c.countedQty - Number(line.expectedQty));
        await tx.stocktakeLine.update({ where: { id: line.id }, data: { countedQty: c.countedQty, varianceQty: variance, varianceValue: BigInt(Math.round(variance * Number(line.stockItem.costPerBaseUnit))) } });
      }
      await tx.stocktake.update({ where: { id }, data: { status: 'REVIEW' } });
    });
    return this.getStocktake(id);
  }

  async approveStocktake(id: string, staff: StaffPrincipal) {
    const st = await this.prisma.stocktake.findUnique({ where: { id }, include: { lines: { include: { stockItem: true } } } });
    if (!st) throw Errors.notFound('phiếu kiểm kê');
    if (st.status !== 'REVIEW') throw Errors.state('Nhập số đếm trước khi duyệt');
    await this.prisma.$transaction(async (tx) => {
      for (const l of st.lines) {
        if (l.countedQty === null || Number(l.varianceQty ?? 0) === 0) continue;
        await this.applyMovement(tx, { warehouseId: st.warehouseId, stockItemId: l.stockItemId, kind: 'STOCKTAKE_ADJ', quantity: Number(l.varianceQty), unitCost: Number(l.stockItem.costPerBaseUnit), refType: 'Stocktake', refId: id, reason: 'Điều chỉnh theo kiểm kê', createdById: staff.staffId });
      }
      await tx.stocktake.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date(), approvedById: staff.staffId } });
      await tx.auditLog.create({ data: { actorStaffId: staff.staffId, action: 'stocktake.approve', entityType: 'Stocktake', entityId: id, after: { lines: st.lines.filter((l) => Number(l.varianceQty ?? 0) !== 0).map((l) => ({ item: l.stockItem.code, variance: Number(l.varianceQty) })) } as Prisma.InputJsonValue } });
    });
    return this.getStocktake(id);
  }

  async cancelStocktake(id: string) {
    const st = await this.prisma.stocktake.findUnique({ where: { id } });
    if (!st) throw Errors.notFound('phiếu kiểm kê');
    if (st.status === 'APPROVED') throw Errors.state('Phiếu đã duyệt');
    return this.prisma.stocktake.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  // ───────────────── Hao hụt, điều chỉnh tay ─────────────────

  async waste(input: z.infer<typeof wasteSchema>, staff: StaffPrincipal) {
    const items = await this.prisma.stockItem.findMany({ where: { id: { in: input.lines.map((l) => l.stockItemId) } } });
    return this.prisma.$transaction(async (tx) => {
      const out = [];
      for (const l of input.lines) {
        const item = items.find((i) => i.id === l.stockItemId);
        if (!item) throw Errors.notFound(`nguyên liệu ${l.stockItemId}`);
        out.push(await this.applyMovement(tx, { warehouseId: input.warehouseId, stockItemId: item.id, kind: 'WASTE', quantity: -l.quantity, unitCost: Number(item.costPerBaseUnit), reason: input.reason, createdById: staff.staffId }));
      }
      return out;
    });
  }

  async manualAdjust(input: z.infer<typeof manualAdjustSchema>, staff: StaffPrincipal) {
    const items = await this.prisma.stockItem.findMany({ where: { id: { in: input.lines.map((l) => l.stockItemId) } } });
    return this.prisma.$transaction(async (tx) => {
      const out = [];
      for (const l of input.lines) {
        const item = items.find((i) => i.id === l.stockItemId);
        if (!item) throw Errors.notFound(`nguyên liệu ${l.stockItemId}`);
        out.push(await this.applyMovement(tx, { warehouseId: input.warehouseId, stockItemId: item.id, kind: 'MANUAL', quantity: l.quantity, unitCost: Number(item.costPerBaseUnit), reason: input.reason, createdById: staff.staffId }));
      }
      return out;
    });
  }

  // ───────────────── Tồn, biến động, cảnh báo, giá vốn ─────────────────

  async levels(warehouseId: string) {
    const rows = await this.prisma.stockLevel.findMany({ where: { warehouseId }, include: { stockItem: true }, orderBy: { stockItem: { name: 'asc' } } });
    return rows.map((r) => ({
      stockItemId: r.stockItemId,
      code: r.stockItem.code,
      name: r.stockItem.name,
      category: r.stockItem.category,
      baseUnit: r.stockItem.baseUnit,
      quantity: Number(r.quantity),
      minStock: r.stockItem.minStock === null ? null : Number(r.stockItem.minStock),
      costPerBaseUnit: Number(r.stockItem.costPerBaseUnit),
      value: Math.round(Number(r.quantity) * Number(r.stockItem.costPerBaseUnit)),
      isLow: r.stockItem.minStock !== null && Number(r.quantity) < Number(r.stockItem.minStock),
      updatedAt: r.updatedAt,
    }));
  }

  movements(warehouseId: string, q: z.infer<typeof movementsQuerySchema>) {
    return this.prisma.stockMovement.findMany({
      where: { warehouseId, ...(q.stockItemId ? { stockItemId: q.stockItemId } : {}), ...(q.kind ? { kind: q.kind as MovementKind } : {}), ...(q.from || q.to ? { occurredAt: { ...(q.from ? { gte: fromDateOnly(q.from) } : {}), ...(q.to ? { lt: nextDay(q.to) } : {}) } } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: 500,
      include: { stockItem: { select: { code: true, name: true, baseUnit: true } } },
    });
  }

  async alerts(branchId: string) {
    const warehouses = await this.prisma.warehouse.findMany({ where: { branchId, isActive: true }, select: { id: true } });
    const items = await this.prisma.stockItem.findMany({ where: { isActive: true, minStock: { not: null } }, include: { levels: { where: { warehouseId: { in: warehouses.map((w) => w.id) } } } } });
    return items
      .map((it) => ({ stockItemId: it.id, code: it.code, name: it.name, baseUnit: it.baseUnit, quantity: round3(it.levels.reduce((s, l) => s + Number(l.quantity), 0)), minStock: Number(it.minStock) }))
      .filter((r) => r.quantity < r.minStock)
      .sort((a, b) => a.quantity / a.minStock - b.quantity / b.minStock);
  }

  async cogs(branchId: string, from: string, to: string) {
    const warehouses = await this.prisma.warehouse.findMany({ where: { branchId }, select: { id: true } });
    const sales = await this.prisma.stockMovement.findMany({
      where: { warehouseId: { in: warehouses.map((w) => w.id) }, kind: { in: ['SALE', 'VOID_RETURN'] }, occurredAt: { gte: fromDateOnly(from), lt: nextDay(to) } },
      select: { quantity: true, unitCost: true, refId: true, occurredAt: true, kind: true },
    });
    const byDay = new Map<string, number>();
    const byLine = new Map<string, number>();
    for (const m of sales) {
      const cost = -Number(m.quantity) * Number(m.unitCost);
      const day = new Date(m.occurredAt.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + cost);
      if (m.refId) byLine.set(m.refId, (byLine.get(m.refId) ?? 0) + cost);
    }
    const lines = byLine.size ? await this.prisma.orderLine.findMany({ where: { id: { in: [...byLine.keys()] } }, select: { id: true, nameSnapshot: true, quantity: true, lineTotal: true, status: true } }) : [];
    const byItem = new Map<string, { name: string; quantity: number; cogs: number; revenue: number }>();
    for (const l of lines) {
      const entry = byItem.get(l.nameSnapshot) ?? { name: l.nameSnapshot, quantity: 0, cogs: 0, revenue: 0 };
      if (l.status !== 'VOIDED') {
        entry.quantity += Number(l.quantity);
        entry.revenue += Number(l.lineTotal);
      }
      entry.cogs += byLine.get(l.id) ?? 0;
      byItem.set(l.nameSnapshot, entry);
    }
    const totalCogs = Math.round([...byDay.values()].reduce((s, v) => s + v, 0));
    return {
      from,
      to,
      totalCogs,
      byDay: [...byDay.entries()].sort().map(([date, cogs]) => ({ date, cogs: Math.round(cogs) })),
      byItem: [...byItem.values()].map((e) => ({ ...e, cogs: Math.round(e.cogs), marginBps: e.revenue > 0 ? Math.round(((e.revenue - e.cogs) / e.revenue) * 10_000) : null })).sort((a, b) => b.cogs - a.cogs),
    };
  }

  // ───────────────── Phát lại (bảo trì): trừ kho/hoàn kho cho đơn đã có, an toàn khi gọi nhiều lần ─────────────────

  async replayOrder(orderId: string, staffId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { lines: { select: { id: true, status: true } } } });
    if (!order) throw Errors.notFound('đơn');
    const sent = order.lines.filter((l) => ['SENT', 'PREPARING', 'READY', 'SERVED', 'VOIDED'].includes(l.status)).map((l) => l.id);
    await this.onOrderSent({ id: '', seq: 0, type: DomainEvents.orderSent, aggregateType: 'session', aggregateId: order.sessionId, branchId: order.branchId, payload: { lineIds: sent }, actorStaffId: staffId, occurredAt: new Date().toISOString() });
    for (const l of order.lines.filter((x) => x.status === 'VOIDED')) {
      await this.onLineVoided({ id: '', seq: 0, type: DomainEvents.orderLineVoided, aggregateType: 'session', aggregateId: order.sessionId, branchId: order.branchId, payload: { lineId: l.id, status: 'VOIDED' }, actorStaffId: staffId, occurredAt: new Date().toISOString() });
    }
    return { orderId, lines: sent.length, movements: await this.prisma.stockMovement.count({ where: { refType: 'OrderLine', refId: { in: order.lines.map((l) => l.id) } } }) };
  }

  // ───────────────── Trừ kho tự động từ sự kiện ─────────────────

  private async warehouseFor(branchId: string, stationCode: string | null) {
    const warehouses = await this.prisma.warehouse.findMany({ where: { branchId, isActive: true } });
    if (stationCode === 'BAR') {
      const bar = warehouses.find((w) => w.kind === 'BAR');
      if (bar) return bar;
    }
    return warehouses.find((w) => w.kind === 'KITCHEN') ?? warehouses.find((w) => w.kind === 'MAIN') ?? warehouses[0] ?? null;
  }

  private async onOrderSent(e: PublishedEvent): Promise<void> {
    const lineIds = (e.payload as { lineIds?: string[] }).lineIds ?? [];
    if (!e.branchId || lineIds.length === 0) return;
    const lines = await this.prisma.orderLine.findMany({ where: { id: { in: lineIds }, itemId: { not: null } } });
    for (const line of lines) {
      const already = await this.prisma.stockMovement.count({ where: { kind: 'SALE', refType: 'OrderLine', refId: line.id } });
      if (already > 0) continue;
      const recipe =
        (await this.prisma.recipe.findFirst({ where: { itemId: line.itemId!, variantId: line.variantId, modifierOptionId: null, isActive: true }, include: { lines: { include: { stockItem: true } } } })) ??
        (line.variantId ? await this.prisma.recipe.findFirst({ where: { itemId: line.itemId!, variantId: null, modifierOptionId: null, isActive: true }, include: { lines: { include: { stockItem: true } } } }) : null);
      if (!recipe || recipe.lines.length === 0) continue;
      const warehouse = await this.warehouseFor(e.branchId, line.stationCode);
      if (!warehouse) continue;
      const qty = Number(line.quantity);
      await this.prisma.$transaction(async (tx) => {
        for (const rl of recipe.lines) {
          const need = (Number(rl.quantity) * (1 + rl.wastageBps / 10_000) * qty) / Number(recipe.yieldQty);
          await this.applyMovement(tx, { warehouseId: warehouse.id, stockItemId: rl.stockItemId, kind: 'SALE', quantity: -need, unitCost: Number(rl.stockItem.costPerBaseUnit), refType: 'OrderLine', refId: line.id, createdById: e.actorStaffId });
        }
      });
    }
  }

  private async onLineVoided(e: PublishedEvent): Promise<void> {
    const p = e.payload as { lineId?: string; status?: string };
    if (!p.lineId || p.status !== 'VOIDED') return;
    const line = await this.prisma.orderLine.findUnique({ where: { id: p.lineId } });
    if (!line || line.wasteOnVoid) return;
    const sales = await this.prisma.stockMovement.findMany({ where: { kind: 'SALE', refType: 'OrderLine', refId: line.id } });
    if (sales.length === 0) return;
    const returned = await this.prisma.stockMovement.count({ where: { kind: 'VOID_RETURN', refType: 'OrderLine', refId: line.id } });
    if (returned > 0) return;
    await this.prisma.$transaction(async (tx) => {
      for (const s of sales) {
        await this.applyMovement(tx, { warehouseId: s.warehouseId, stockItemId: s.stockItemId, kind: 'VOID_RETURN', quantity: -Number(s.quantity), unitCost: Number(s.unitCost), refType: 'OrderLine', refId: line.id, reason: line.voidReason ?? undefined, createdById: e.actorStaffId });
      }
    });
    this.logger.log(`Hoàn kho cho dòng ${line.nameSnapshot} (${sales.length} nguyên liệu)`);
  }

  private async nextCode(prefix: string): Promise<string> {
    const date = businessDate(new Date());
    const key = `seq:${prefix}:${date}`;
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, 3 * 24 * 3600);
    return documentCode(prefix, date, n);
  }
}
