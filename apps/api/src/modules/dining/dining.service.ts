import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { Prisma } from '@dalan/db';
import {
  assertTransition,
  businessDate,
  computeLinePricing,
  documentCode,
  isWithinSchedule,
  ORDER_LINE_TRANSITIONS,
  SENT_TO_KITCHEN,
  SESSION_TRANSITIONS,
  validateModifierSelection,
  type ModifierSelection,
  type Schedule,
} from '@dalan/domain';
import { DomainEvents, type CreateOrderInput, type OpenSessionInput, type OrderLineInput, type TableDisplayStatus, type VoidLineInput } from '@dalan/contracts';
import type { z } from 'zod';
import type { serviceRequestSchema, updateLineSchema, updateSessionSchema } from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { Errors } from '../../common/errors.js';
import { hasPermission, type StaffPrincipal } from '../../common/auth/principal.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { MenuService } from '../menu/menu.service.js';
import { AuthService } from '../auth/auth.service.js';
import { provisionalTotals } from './totals.js';

type Tx = Prisma.TransactionClient;
export interface Actor {
  staffId?: string | null;
  participantId?: string | null;
}

const DEFAULT_VOID_LIMIT = 200_000;

@Injectable()
export class DiningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly menu: MenuService,
    private readonly auth: AuthService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // ───────────────── Sơ đồ bàn ─────────────────

  async floor(branchId: string) {
    const branch = await this.loadBranch(branchId);
    const [areas, requests] = await Promise.all([
      this.prisma.area.findMany({
        where: { branchId, isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          tables: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: {
              sessionTables: {
                where: { releasedAt: null, session: { status: { in: ['PENDING', 'OPEN', 'BILL_REQUESTED'] } } },
                include: { session: { include: { orderLines: { select: { status: true, lineTotal: true, vatRateBps: true } }, tables: { where: { releasedAt: null }, select: { tableId: true } } } } },
              },
            },
          },
        },
      }),
      this.prisma.serviceRequest.findMany({ where: { branchId, status: { in: ['OPEN', 'ACKED'] } }, select: { sessionId: true, kind: true, status: true, createdAt: true } }),
    ]);
    const openRequests = new Map<string, number>();
    for (const r of requests) openRequests.set(r.sessionId, (openRequests.get(r.sessionId) ?? 0) + 1);
    return {
      branch: { id: branch.id, code: branch.code, name: branch.name, serviceChargeBps: branch.serviceChargeBps },
      generatedAt: new Date().toISOString(),
      areas: areas.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        kind: a.kind,
        floor: a.floor,
        tables: a.tables.map((t) => {
          const st = t.sessionTables[0];
          const session = st?.session;
          const status = deriveTableStatus(session ?? null);
          return {
            id: t.id,
            code: t.code,
            name: t.name,
            minSeats: t.minSeats,
            maxSeats: t.maxSeats,
            shape: t.shape,
            posX: t.posX,
            posY: t.posY,
            width: t.width,
            height: t.height,
            rotation: t.rotation,
            isPrivateRoom: t.isPrivateRoom,
            status,
            session: session
              ? {
                  id: session.id,
                  code: session.code,
                  status: session.status,
                  guestCount: session.guestCount,
                  openedAt: session.openedAt,
                  serverId: session.serverId,
                  tableIds: session.tables.map((x) => x.tableId),
                  linesSent: session.orderLines.filter((l) => SENT_TO_KITCHEN.has(l.status as never)).length,
                  linesReady: session.orderLines.filter((l) => l.status === 'READY').length,
                  openRequests: openRequests.get(session.id) ?? 0,
                  total: provisionalTotals(session.orderLines.map((l, i) => ({ id: String(i), ...l })), branch).total,
                }
              : null,
          };
        }),
      })),
    };
  }

  // ───────────────── Phiên bàn ─────────────────

  async openSession(branchId: string, input: OpenSessionInput, actor: Actor, status: 'PENDING' | 'OPEN' = 'OPEN') {
    const branch = await this.loadBranch(branchId);
    const session = await this.prisma.$transaction(async (tx) => {
      await this.assertTablesFree(tx, branchId, input.tableIds);
      const date = businessDate(new Date(), branch.businessDayCutoff, branch.timezone);
      const code = await this.nextCode('S', branch.code, date);
      const created = await tx.tableSession.create({
        data: {
          branchId,
          code,
          status,
          source: input.source,
          guestCount: input.guestCount,
          businessDate: new Date(`${date}T00:00:00Z`),
          openedById: actor.staffId ?? null,
          serverId: actor.staffId ?? null,
          customerId: input.customerId ?? null,
          reservationId: input.reservationId ?? null,
          notes: input.notes ?? null,
          joinPin: branch.guestJoinMode === 'PIN' ? randomInt(0, 10_000).toString().padStart(4, '0') : null,
          tables: { create: input.tableIds.map((tableId) => ({ tableId })) },
        },
        include: { tables: true },
      });
      if (input.reservationId) {
        await tx.reservation.update({ where: { id: input.reservationId }, data: { status: 'SEATED', seatedAt: new Date() } }).catch(() => undefined);
      }
      await this.outbox.append(tx, {
        type: DomainEvents.sessionOpened,
        aggregateType: 'session',
        aggregateId: created.id,
        branchId,
        payload: { sessionId: created.id, code, status, tableIds: input.tableIds, guestCount: input.guestCount, source: input.source },
        actorStaffId: actor.staffId,
        actorParticipantId: actor.participantId,
      });
      return created;
    });
    return this.getSession(session.id);
  }

  async getSession(sessionId: string) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        branch: { select: { id: true, code: true, name: true, vatRateBps: true, priceIncludesVat: true, serviceChargeBps: true, rounding: true, qrOrderMode: true, guestJoinMode: true } },
        tables: { where: { releasedAt: null }, include: { table: { include: { area: { select: { id: true, name: true, serviceChargeBps: true, minSpend: true } } } } } },
        participants: { orderBy: { joinedAt: 'asc' } },
        orders: { orderBy: { seq: 'asc' }, include: { lines: { orderBy: { createdAt: 'asc' } } } },
        bills: { where: { status: { not: 'VOID' } }, select: { id: true, code: true, status: true, total: true, paidTotal: true, splitType: true, createdAt: true } },
        requests: { where: { status: { in: ['OPEN', 'ACKED'] } }, orderBy: { createdAt: 'asc' } },
        customer: { select: { id: true, fullName: true, phone: true, tierId: true, pointsBalance: true, tags: true, allergies: true, preferences: true } },
      },
    });
    if (!session) throw Errors.notFound('phiên bàn');
    const lines = session.orders.flatMap((o) => o.lines);
    const area = session.tables[0]?.table.area;
    const minSpend = session.tables.reduce((max, t) => Math.max(max, Number(t.table.minSpend ?? 0)), 0) || Number(area?.minSpend ?? 0) || null;
    const totals = provisionalTotals(lines, session.branch, { serviceChargeBps: area?.serviceChargeBps ?? null, minSpend });
    return { ...session, totals };
  }

  async updateSession(sessionId: string, input: z.infer<typeof updateSessionSchema>, actor: Actor) {
    const session = await this.mustSession(sessionId, ['PENDING', 'OPEN', 'BILL_REQUESTED']);
    await this.prisma.$transaction(async (tx) => {
      await tx.tableSession.update({ where: { id: sessionId }, data: input });
      await this.outbox.append(tx, { type: DomainEvents.sessionUpdated, aggregateType: 'session', aggregateId: sessionId, branchId: session.branchId, payload: { sessionId, fields: Object.keys(input) }, actorStaffId: actor.staffId });
    });
    return this.getSession(sessionId);
  }

  async requestBill(sessionId: string, actor: Actor) {
    const session = await this.mustSession(sessionId, ['OPEN']);
    await this.prisma.$transaction(async (tx) => {
      await tx.tableSession.update({ where: { id: sessionId }, data: { status: 'BILL_REQUESTED' } });
      if (actor.participantId) {
        await tx.serviceRequest.create({ data: { sessionId, branchId: session.branchId, kind: 'BILL', participantId: actor.participantId, tableId: session.tables[0]?.tableId ?? null } });
      }
      await this.outbox.append(tx, { type: DomainEvents.sessionBillRequested, aggregateType: 'session', aggregateId: sessionId, branchId: session.branchId, payload: { sessionId }, actorStaffId: actor.staffId, actorParticipantId: actor.participantId });
    });
    return this.getSession(sessionId);
  }

  async reopenSession(sessionId: string, actor: Actor) {
    const session = await this.mustSession(sessionId, ['BILL_REQUESTED']);
    await this.prisma.$transaction(async (tx) => {
      await tx.tableSession.update({ where: { id: sessionId }, data: { status: 'OPEN' } });
      await this.outbox.append(tx, { type: DomainEvents.sessionUpdated, aggregateType: 'session', aggregateId: sessionId, branchId: session.branchId, payload: { sessionId, status: 'OPEN' }, actorStaffId: actor.staffId });
    });
    return this.getSession(sessionId);
  }

  async cancelSession(sessionId: string, actor: Actor, reason?: string) {
    const session = await this.mustSession(sessionId, ['PENDING', 'OPEN']);
    const sent = await this.prisma.orderLine.count({ where: { sessionId, status: { in: ['SENT', 'PREPARING', 'READY', 'SERVED'] } } });
    if (sent > 0) throw Errors.state('Phiên đã gửi món xuống bếp, hãy hủy từng món rồi thanh toán hoặc đóng phiên');
    await this.prisma.$transaction(async (tx) => {
      await tx.orderLine.updateMany({ where: { sessionId, status: { in: ['DRAFT', 'HOLD'] } }, data: { status: 'CANCELLED' } });
      await tx.order.updateMany({ where: { sessionId, status: { in: ['DRAFT', 'PENDING_CONFIRM'] } }, data: { status: 'CANCELLED' } });
      await tx.tableSession.update({ where: { id: sessionId }, data: { status: 'CANCELLED', closedAt: new Date(), notes: reason ?? session.notes } });
      await tx.sessionTable.updateMany({ where: { sessionId, releasedAt: null }, data: { releasedAt: new Date() } });
      await this.outbox.append(tx, { type: DomainEvents.sessionCancelled, aggregateType: 'session', aggregateId: sessionId, branchId: session.branchId, payload: { sessionId, reason }, actorStaffId: actor.staffId });
    });
    return { id: sessionId, status: 'CANCELLED' };
  }

  /** Gọi sau khi thanh toán: nếu mọi dòng đã nằm trong bill đã trả thì đóng phiên và giải phóng bàn. */
  async closeIfSettled(tx: Tx, sessionId: string, actorStaffId?: string | null): Promise<boolean> {
    const session = await tx.tableSession.findUnique({ where: { id: sessionId }, include: { orderLines: { include: { billLines: { include: { bill: { select: { status: true } } } } } } } });
    if (!session || session.status === 'CLOSED' || session.status === 'CANCELLED') return false;
    const billable = session.orderLines.filter((l) => ['SENT', 'PREPARING', 'READY', 'SERVED'].includes(l.status));
    const pendingDraft = session.orderLines.some((l) => ['DRAFT', 'HOLD'].includes(l.status));
    if (pendingDraft) return false;
    const allPaid = billable.every((l) => l.billLines.filter((bl) => bl.bill.status === 'PAID').reduce((s, bl) => s + Number(bl.quantityShare), 0) >= 0.999999);
    if (!allPaid) return false;
    await tx.tableSession.update({ where: { id: sessionId }, data: { status: 'CLOSED', closedAt: new Date() } });
    await tx.sessionTable.updateMany({ where: { sessionId, releasedAt: null }, data: { releasedAt: new Date() } });
    await tx.serviceRequest.updateMany({ where: { sessionId, status: { in: ['OPEN', 'ACKED'] } }, data: { status: 'DONE', doneAt: new Date() } });
    await this.outbox.append(tx, { type: DomainEvents.sessionClosed, aggregateType: 'session', aggregateId: sessionId, branchId: session.branchId, payload: { sessionId }, actorStaffId });
    return true;
  }

  // ───────────────── Gọi món ─────────────────

  async createOrder(sessionId: string, input: CreateOrderInput, actor: Actor, opts: { source: 'STAFF' | 'GUEST' | 'PREORDER'; staff?: StaffPrincipal | null }) {
    const session = await this.mustSession(sessionId, ['PENDING', 'OPEN', 'BILL_REQUESTED']);
    const branch = await this.loadBranch(session.branchId);
    const items = await this.menu.loadItemsForOrdering(branch.id, [...new Set(input.lines.map((l) => l.itemId))]);
    const now = new Date();
    const requireConfirm = opts.source === 'GUEST' && branch.qrOrderMode === 'STAFF_CONFIRM';

    const prepared = input.lines.map((l) => this.prepareLine(l, items, branch, now, opts));

    const order = await this.prisma.$transaction(async (tx) => {
      const seq = (await tx.order.count({ where: { sessionId } })) + 1;
      const created = await tx.order.create({
        data: {
          sessionId,
          branchId: branch.id,
          seq,
          source: opts.source,
          status: requireConfirm ? 'PENDING_CONFIRM' : 'DRAFT',
          placedById: actor.staffId ?? null,
          placedByParticipantId: actor.participantId ?? null,
          notes: input.notes ?? null,
          lines: {
            create: prepared.map((p) => ({
              sessionId,
              branchId: branch.id,
              itemId: p.itemId,
              variantId: p.variantId,
              nameSnapshot: p.name,
              nameEnSnapshot: p.nameEn,
              unitSnapshot: p.unit,
              unitPrice: BigInt(p.pricing.unitPrice),
              quantity: p.pricing.quantity,
              expectedWeightKg: p.isWeight ? p.pricing.quantity : null,
              modifiersSnapshot: p.modifiers as unknown as Prisma.InputJsonValue,
              modifiersTotal: BigInt(p.pricing.modifiersTotal),
              lineTotal: BigInt(p.pricing.lineTotal),
              vatRateBps: p.vatRateBps,
              stationCode: p.stationCode,
              course: p.course,
              status: 'DRAFT',
              note: p.note,
              participantId: actor.participantId ?? null,
              seatNo: p.seatNo,
              isCountedEmpties: p.countEmpties,
            })),
          },
        },
        include: { lines: true },
      });
      if (session.status === 'PENDING' && opts.source !== 'GUEST') {
        await tx.tableSession.update({ where: { id: sessionId }, data: { status: 'OPEN' } });
      }
      if (requireConfirm) {
        await this.outbox.append(tx, {
          type: DomainEvents.orderPendingConfirm,
          aggregateType: 'session',
          aggregateId: sessionId,
          branchId: branch.id,
          payload: { sessionId, orderId: created.id, seq, lineCount: created.lines.length, total: created.lines.reduce((s, l) => s + Number(l.lineTotal), 0) },
          actorParticipantId: actor.participantId,
        });
      } else {
        await this.outbox.append(tx, { type: DomainEvents.orderCreated, aggregateType: 'session', aggregateId: sessionId, branchId: branch.id, payload: { sessionId, orderId: created.id, seq }, actorStaffId: actor.staffId, actorParticipantId: actor.participantId });
        if (input.send) await this.sendOrderTx(tx, created.id, actor);
      }
      return created;
    });
    return this.getOrder(order.id);
  }

  private prepareLine(
    l: OrderLineInput,
    items: Awaited<ReturnType<MenuService['loadItemsForOrdering']>>,
    branch: { id: string; vatRateBps: number },
    now: Date,
    opts: { source: string; staff?: StaffPrincipal | null },
  ) {
    const item = items.get(l.itemId);
    if (!item) throw Errors.notFound(`món ${l.itemId}`);
    if (item.status !== 'ACTIVE') throw Errors.invalid('ITEM_UNAVAILABLE', `${item.name} hiện không bán`);
    if (item.category.menu.branches.length === 0) throw Errors.invalid('ITEM_UNAVAILABLE', `${item.name} không bán tại cơ sở này`);
    const override = item.overrides[0];
    if (override && !override.isAvailable) throw Errors.invalid('ITEM_UNAVAILABLE', `${item.name} không bán tại cơ sở này`);
    if (override?.soldOutUntil && override.soldOutUntil > now) throw Errors.invalid('ITEM_SOLD_OUT', `${item.name} đã hết`);
    if (override?.stockLeft !== null && override?.stockLeft !== undefined && override.stockLeft < l.quantity) {
      throw Errors.invalid('ITEM_SOLD_OUT', `${item.name} chỉ còn ${override.stockLeft}`);
    }
    if (!isWithinSchedule(item.category.menu.schedule as Schedule, now) || !isWithinSchedule(item.category.schedule as Schedule, now)) {
      throw Errors.invalid('ITEM_OUT_OF_HOURS', `${item.name} ngoài giờ bán`);
    }

    const groups = item.modifierGroups.map(({ group }) => ({
      code: group.id,
      isRequired: group.isRequired,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      optionCodes: group.options.filter((o) => o.isActive).map((o) => o.id),
    }));
    const errors = validateModifierSelection(groups, l.modifiers.map((m) => ({ groupCode: m.groupId, optionCode: m.optionId })));
    if (errors.length) throw Errors.invalid('MODIFIER_INVALID', `${item.name}: ${errors.join('; ')}`);
    const modifiers: ModifierSelection[] = l.modifiers.map((m) => {
      const group = item.modifierGroups.find((g) => g.groupId === m.groupId)!.group;
      const option = group.options.find((o) => o.id === m.optionId)!;
      return { groupCode: group.code, groupName: group.name, optionCode: option.code, optionName: option.name, priceDelta: Number(option.priceDelta) };
    });

    let variantPrice: number | null = null;
    let variantName: string | null = null;
    if (item.pricingMode === 'VARIANT') {
      const variant = item.variants.find((v) => v.id === l.variantId && v.isActive);
      if (!variant) throw Errors.invalid('VARIANT_REQUIRED', `${item.name}: cần chọn cỡ`);
      variantPrice = Number(variant.price);
      variantName = variant.name;
    }
    if ((item.pricingMode === 'MARKET' || item.pricingMode === 'OPEN') && opts.source === 'GUEST') {
      throw Errors.invalid('ASK_STAFF', `${item.name}: giá theo thời điểm, vui lòng gọi nhân viên`);
    }
    if ((item.pricingMode === 'MARKET' || item.pricingMode === 'OPEN') && opts.staff && !hasPermission(opts.staff.permissions, 'dining.price.enter')) {
      throw Errors.forbidden('Bạn không có quyền nhập giá món');
    }
    const basePrice = override?.price !== null && override?.price !== undefined ? Number(override.price) : item.basePrice === null ? null : Number(item.basePrice);
    const pricing = computeLinePricing({
      pricingMode: item.pricingMode,
      basePrice,
      variantPrice,
      enteredPrice: l.enteredPrice ?? null,
      quantity: l.quantity,
      modifiers,
    });
    const name = item.pricingMode === 'OPEN' && l.customName ? l.customName : variantName ? `${item.name} (${variantName})` : item.name;
    return {
      itemId: item.id,
      variantId: l.variantId ?? null,
      name,
      nameEn: item.nameEn,
      unit: item.unit,
      pricing,
      isWeight: item.pricingMode === 'WEIGHT',
      modifiers,
      vatRateBps: item.vatRateBps ?? branch.vatRateBps,
      stationCode: override?.stationCode ?? item.defaultStationCode ?? item.category.defaultStationCode ?? null,
      course: l.course,
      note: l.note ?? null,
      seatNo: l.seatNo ?? null,
      countEmpties: item.countEmpties,
    };
  }

  async getOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { lines: { orderBy: { createdAt: 'asc' } }, tickets: { include: { station: { select: { code: true, name: true } } } } } });
    if (!order) throw Errors.notFound('đơn');
    return order;
  }

  async sendOrder(sessionId: string, orderId: string, actor: Actor) {
    await this.mustSession(sessionId, ['PENDING', 'OPEN', 'BILL_REQUESTED']);
    await this.prisma.$transaction((tx) => this.sendOrderTx(tx, orderId, actor));
    return this.getOrder(orderId);
  }

  /** Nhân viên xác nhận đơn khách gửi qua QR (chế độ STAFF_CONFIRM). */
  async confirmOrder(sessionId: string, orderId: string, actor: Actor) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, sessionId } });
    if (!order) throw Errors.notFound('đơn');
    if (order.status !== 'PENDING_CONFIRM') throw Errors.state('Đơn không ở trạng thái chờ xác nhận');
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: 'DRAFT', confirmedById: actor.staffId ?? null } });
      await tx.tableSession.updateMany({ where: { id: sessionId, status: 'PENDING' }, data: { status: 'OPEN' } });
      await this.sendOrderTx(tx, orderId, actor);
    });
    return this.getOrder(orderId);
  }

  async rejectOrder(sessionId: string, orderId: string, actor: Actor, reason?: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, sessionId }, include: { lines: true } });
    if (!order) throw Errors.notFound('đơn');
    if (order.status !== 'PENDING_CONFIRM' && order.status !== 'DRAFT') throw Errors.state('Chỉ từ chối được đơn chưa gửi bếp');
    await this.prisma.$transaction(async (tx) => {
      await tx.orderLine.updateMany({ where: { orderId }, data: { status: 'CANCELLED', voidReason: reason ?? 'Nhân viên từ chối' } });
      await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', confirmedById: actor.staffId ?? null } });
      await this.outbox.append(tx, { type: DomainEvents.orderLineVoided, aggregateType: 'session', aggregateId: sessionId, branchId: order.branchId, payload: { sessionId, orderId, rejected: true, reason }, actorStaffId: actor.staffId });
    });
    return this.getOrder(orderId);
  }

  /** Gửi bếp: dòng course 1 (hoặc đã bắn) tạo phiếu theo trạm; course sau giữ HOLD. */
  private async sendOrderTx(tx: Tx, orderId: string, actor: Actor, onlyCourse?: number): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true, session: { include: { tables: { where: { releasedAt: null }, include: { table: true } } } } } });
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: order.branchId } });
    const toSend = order.lines.filter((l) => (onlyCourse ? l.status === 'HOLD' && l.course === onlyCourse : l.status === 'DRAFT' && l.course === 1));
    const toHold = onlyCourse ? [] : order.lines.filter((l) => l.status === 'DRAFT' && l.course > 1);
    if (toHold.length) await tx.orderLine.updateMany({ where: { id: { in: toHold.map((l) => l.id) } }, data: { status: 'HOLD' } });
    if (toSend.length === 0) {
      if (order.status !== 'SENT') await tx.order.update({ where: { id: orderId }, data: { status: 'SENT', sentAt: order.sentAt ?? new Date() } });
      return;
    }
    const now = new Date();
    await tx.orderLine.updateMany({ where: { id: { in: toSend.map((l) => l.id) } }, data: { status: 'SENT', sentAt: now } });
    // Trừ giới hạn suất theo cơ sở
    for (const l of toSend) {
      if (!l.itemId) continue;
      await tx.branchItemOverride.updateMany({ where: { branchId: branch.id, itemId: l.itemId, stockLeft: { not: null } }, data: { stockLeft: { decrement: Math.ceil(Number(l.quantity)) } } });
    }
    const stations = await tx.station.findMany({ where: { branchId: branch.id, isActive: true }, orderBy: { sortOrder: 'asc' }, include: { printer: true } });
    const fallback = stations[0];
    if (!fallback) throw Errors.state('Cơ sở chưa cấu hình trạm bếp');
    const byStation = new Map<string, typeof toSend>();
    for (const l of toSend) {
      const station = stations.find((s) => s.code === l.stationCode) ?? fallback;
      const list = byStation.get(station.id) ?? [];
      list.push(l);
      byStation.set(station.id, list);
    }
    const date = businessDate(now, branch.businessDayCutoff, branch.timezone);
    const tableNames = order.session.tables.map((t) => t.table.name).join(' + ');
    for (const [stationId, lines] of byStation) {
      const station = stations.find((s) => s.id === stationId)!;
      const seq = await this.nextSeq(`T:${branch.id}:${station.code}:${date}`);
      const ticket = await tx.kitchenTicket.create({
        data: {
          branchId: branch.id,
          orderId,
          sessionId: order.sessionId,
          stationId,
          stationCode: station.code,
          seq,
          course: lines[0]?.course ?? 1,
          priority: order.session.tables.some((t) => t.table.isPrivateRoom) ? 1 : 0,
          lines: { create: lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })) },
        },
      });
      await this.outbox.append(tx, {
        type: DomainEvents.ticketCreated,
        aggregateType: 'session',
        aggregateId: order.sessionId,
        branchId: branch.id,
        payload: {
          sessionId: order.sessionId,
          sessionCode: order.session.code,
          orderId,
          ticketId: ticket.id,
          seq,
          stationId,
          stationCode: station.code,
          stationMode: station.mode,
          printerId: station.printerId,
          tableNames,
          guestCount: order.session.guestCount,
          course: ticket.course,
          lines: lines.map((l) => ({ id: l.id, name: l.nameSnapshot, quantity: Number(l.quantity), unit: l.unitSnapshot, modifiers: l.modifiersSnapshot, note: l.note, course: l.course })),
        },
        actorStaffId: actor.staffId,
        actorParticipantId: actor.participantId,
      });
    }
    await tx.order.update({ where: { id: orderId }, data: { status: 'SENT', sentAt: order.sentAt ?? now } });
    await this.outbox.append(tx, {
      type: DomainEvents.orderSent,
      aggregateType: 'session',
      aggregateId: order.sessionId,
      branchId: branch.id,
      payload: { sessionId: order.sessionId, orderId, seq: order.seq, lineIds: toSend.map((l) => l.id), course: onlyCourse ?? 1 },
      actorStaffId: actor.staffId,
      actorParticipantId: actor.participantId,
    });
  }

  async fireCourse(sessionId: string, course: number, actor: Actor) {
    const session = await this.mustSession(sessionId, ['OPEN', 'BILL_REQUESTED']);
    const orders = await this.prisma.order.findMany({ where: { sessionId, lines: { some: { status: 'HOLD', course } } }, select: { id: true } });
    if (orders.length === 0) throw Errors.state(`Không có món đang giữ ở đợt ${course}`);
    await this.prisma.$transaction(async (tx) => {
      for (const o of orders) await this.sendOrderTx(tx, o.id, actor, course);
      await this.outbox.append(tx, { type: DomainEvents.courseFired, aggregateType: 'session', aggregateId: sessionId, branchId: session.branchId, payload: { sessionId, course }, actorStaffId: actor.staffId });
    });
    return this.getSession(sessionId);
  }

  async updateLine(sessionId: string, lineId: string, input: z.infer<typeof updateLineSchema>, actor: Actor, staff?: StaffPrincipal | null) {
    const line = await this.prisma.orderLine.findFirst({ where: { id: lineId, sessionId }, include: { item: true } });
    if (!line) throw Errors.notFound('dòng món');
    const editable = line.status === 'DRAFT' || line.status === 'HOLD';
    const data: Prisma.OrderLineUpdateInput = {};
    if (input.note !== undefined) data.note = input.note;
    if (input.seatNo !== undefined) data.seatNo = input.seatNo;
    if (input.course !== undefined) {
      if (!editable) throw Errors.state('Chỉ đổi đợt với món chưa gửi bếp');
      data.course = input.course;
    }
    let quantity = Number(line.quantity);
    let unitPrice = Number(line.unitPrice);
    if (input.quantity !== undefined) {
      if (!editable) throw Errors.state('Món đã gửi bếp: hãy hủy hoặc gọi thêm');
      quantity = input.quantity;
    }
    if (input.weightKg !== undefined) {
      if (line.item?.pricingMode !== 'WEIGHT') throw Errors.invalid('NOT_WEIGHT_ITEM', 'Món này không bán theo cân');
      const billed = await this.prisma.billLine.count({ where: { orderLineId: lineId, bill: { status: { in: ['PAID', 'PARTIALLY_PAID'] } } } });
      if (billed > 0) throw Errors.state('Món đã thanh toán, không đổi trọng lượng được');
      quantity = Math.round(input.weightKg * 1000) / 1000;
      data.weightKg = quantity;
    }
    if (input.enteredPrice !== undefined) {
      if (line.item?.pricingMode !== 'MARKET' && line.item?.pricingMode !== 'OPEN') throw Errors.invalid('NOT_OPEN_PRICE', 'Món này có giá cố định');
      if (staff && !hasPermission(staff.permissions, 'dining.price.enter')) throw Errors.forbidden('Bạn không có quyền nhập giá');
      unitPrice = input.enteredPrice;
    }
    const modifiersPerUnit = (line.modifiersSnapshot as unknown as ModifierSelection[]).reduce((s, m) => s + m.priceDelta, 0);
    const modifiersTotal = Math.round(modifiersPerUnit * quantity);
    const lineTotal = Math.round(unitPrice * quantity) + modifiersTotal;
    Object.assign(data, { quantity, unitPrice: BigInt(unitPrice), modifiersTotal: BigInt(modifiersTotal), lineTotal: BigInt(lineTotal) });
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.orderLine.update({ where: { id: lineId }, data });
      await this.outbox.append(tx, { type: DomainEvents.orderLineUpdated, aggregateType: 'session', aggregateId: sessionId, branchId: line.branchId, payload: { sessionId, lineId, quantity, lineTotal, status: u.status }, actorStaffId: actor.staffId, actorParticipantId: actor.participantId });
      return u;
    });
    return updated;
  }

  async voidLine(sessionId: string, lineId: string, input: VoidLineInput, actor: Actor, staff?: StaffPrincipal | null) {
    const line = await this.prisma.orderLine.findFirst({ where: { id: lineId, sessionId }, include: { order: true, ticketLines: { include: { ticket: true } } } });
    if (!line) throw Errors.notFound('dòng món');
    const paid = await this.prisma.billLine.count({ where: { orderLineId: lineId, bill: { status: { in: ['PAID', 'PARTIALLY_PAID'] } } } });
    if (paid > 0) throw Errors.state('Món đã thanh toán, cần hoàn tiền thay vì hủy');
    const branch = await this.loadBranch(line.branchId);
    const target: 'CANCELLED' | 'VOIDED' = SENT_TO_KITCHEN.has(line.status as never) ? 'VOIDED' : 'CANCELLED';
    assertTransition('Dòng món', ORDER_LINE_TRANSITIONS, line.status as never, target);

    let approvedById: string | null = null;
    if (target === 'VOIDED') {
      const limit = Number((branch.settings as { voidLimitWithoutApproval?: number }).voidLimitWithoutApproval ?? DEFAULT_VOID_LIMIT);
      const needsApproval = Number(line.lineTotal) > limit && !(staff && hasPermission(staff.permissions, 'dining.void.over_limit'));
      if (needsApproval) {
        if (!input.managerPin) throw Errors.invalid('APPROVAL_REQUIRED', `Hủy món trên ${limit.toLocaleString('vi-VN')}đ cần PIN quản lý`);
        approvedById = (await this.auth.verifyManagerPin(branch.id, input.managerPin, 'dining.void.over_limit')).staffId;
      }
      if (!staff) throw Errors.forbidden('Khách không thể hủy món đã gửi bếp, vui lòng gọi nhân viên');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderLine.update({
        where: { id: lineId },
        data: { status: target, voidedAt: new Date(), voidReason: `${input.reason}${input.note ? `: ${input.note}` : ''}`, voidedById: actor.staffId ?? null, voidApprovedById: approvedById, wasteOnVoid: input.waste },
      });
      if (line.itemId && target === 'VOIDED' && !input.waste) {
        await tx.branchItemOverride.updateMany({ where: { branchId: branch.id, itemId: line.itemId, stockLeft: { not: null } }, data: { stockLeft: { increment: Math.ceil(Number(line.quantity)) } } });
      }
      for (const tl of line.ticketLines) {
        await tx.kitchenTicketLine.update({ where: { id: tl.id }, data: { status: 'VOIDED' } });
        const remaining = await tx.kitchenTicketLine.count({ where: { ticketId: tl.ticketId, status: { not: 'VOIDED' } } });
        if (remaining === 0) await tx.kitchenTicket.update({ where: { id: tl.ticketId }, data: { status: 'VOIDED' } });
        await this.outbox.append(tx, {
          type: DomainEvents.ticketVoided,
          aggregateType: 'session',
          aggregateId: sessionId,
          branchId: branch.id,
          payload: { sessionId, ticketId: tl.ticketId, stationCode: tl.ticket.stationCode, stationId: tl.ticket.stationId, lineId, name: line.nameSnapshot, quantity: Number(line.quantity), reason: input.reason, wholeTicket: remaining === 0 },
          actorStaffId: actor.staffId,
        });
      }
      await tx.auditLog.create({
        data: { branchId: branch.id, actorStaffId: actor.staffId ?? null, action: target === 'VOIDED' ? 'order.line.void' : 'order.line.cancel', entityType: 'OrderLine', entityId: lineId, reason: input.reason, after: { note: input.note, waste: input.waste, approvedById, lineTotal: Number(line.lineTotal) } },
      });
      await this.outbox.append(tx, { type: DomainEvents.orderLineVoided, aggregateType: 'session', aggregateId: sessionId, branchId: branch.id, payload: { sessionId, lineId, status: target, reason: input.reason }, actorStaffId: actor.staffId, actorParticipantId: actor.participantId });
    });
    return this.getSession(sessionId);
  }

  async markServed(sessionId: string, lineId: string, actor: Actor) {
    const line = await this.prisma.orderLine.findFirst({ where: { id: lineId, sessionId } });
    if (!line) throw Errors.notFound('dòng món');
    assertTransition('Dòng món', ORDER_LINE_TRANSITIONS, line.status as never, 'SERVED');
    await this.prisma.$transaction(async (tx) => {
      await tx.orderLine.update({ where: { id: lineId }, data: { status: 'SERVED', servedAt: new Date() } });
      await this.outbox.append(tx, { type: DomainEvents.orderLineServed, aggregateType: 'session', aggregateId: sessionId, branchId: line.branchId, payload: { sessionId, lineId }, actorStaffId: actor.staffId });
    });
    return { id: lineId, status: 'SERVED' };
  }

  // ───────────────── Gộp, tách, chuyển bàn ─────────────────

  async moveTables(sessionId: string, tableIds: string[], actor: Actor) {
    const session = await this.mustSession(sessionId, ['PENDING', 'OPEN', 'BILL_REQUESTED']);
    const old = session.tables.map((t) => t.tableId);
    await this.prisma.$transaction(async (tx) => {
      await this.assertTablesFree(tx, session.branchId, tableIds, sessionId);
      await tx.sessionTable.updateMany({ where: { sessionId, releasedAt: null, tableId: { notIn: tableIds } }, data: { releasedAt: new Date() } });
      for (const tableId of tableIds) {
        if (!old.includes(tableId)) await tx.sessionTable.create({ data: { sessionId, tableId } });
        else await tx.sessionTable.updateMany({ where: { sessionId, tableId, releasedAt: { not: null } }, data: { releasedAt: null } });
      }
      await this.outbox.append(tx, { type: DomainEvents.sessionMoved, aggregateType: 'session', aggregateId: sessionId, branchId: session.branchId, payload: { sessionId, tableIds, previousTableIds: old }, actorStaffId: actor.staffId });
    });
    return this.getSession(sessionId);
  }

  async mergeSessions(sessionId: string, otherSessionId: string, actor: Actor) {
    if (sessionId === otherSessionId) throw Errors.invalid('SAME_SESSION', 'Không thể gộp phiên với chính nó');
    const target = await this.mustSession(sessionId, ['OPEN', 'BILL_REQUESTED', 'PENDING']);
    const other = await this.mustSession(otherSessionId, ['OPEN', 'BILL_REQUESTED', 'PENDING']);
    if (target.branchId !== other.branchId) throw Errors.invalid('DIFFERENT_BRANCH', 'Hai phiên thuộc hai cơ sở khác nhau');
    const otherBills = await this.prisma.bill.count({ where: { sessionId: otherSessionId, status: { in: ['PAID', 'PARTIALLY_PAID'] } } });
    if (otherBills > 0) throw Errors.state('Phiên gộp vào đã có bill thanh toán, không gộp được');
    await this.prisma.$transaction(async (tx) => {
      await tx.bill.updateMany({ where: { sessionId: otherSessionId, status: 'OPEN' }, data: { status: 'VOID', notes: `Gộp vào ${target.code}` } });
      const maxSeq = await tx.order.count({ where: { sessionId } });
      const orders = await tx.order.findMany({ where: { sessionId: otherSessionId }, orderBy: { seq: 'asc' } });
      for (const [i, o] of orders.entries()) await tx.order.update({ where: { id: o.id }, data: { sessionId, seq: maxSeq + i + 1 } });
      await tx.orderLine.updateMany({ where: { sessionId: otherSessionId }, data: { sessionId } });
      await tx.kitchenTicket.updateMany({ where: { sessionId: otherSessionId }, data: { sessionId } });
      await tx.guestParticipant.updateMany({ where: { sessionId: otherSessionId }, data: { sessionId } });
      await tx.serviceRequest.updateMany({ where: { sessionId: otherSessionId, status: { in: ['OPEN', 'ACKED'] } }, data: { sessionId } });
      const otherTables = other.tables.map((t) => t.tableId);
      await tx.sessionTable.updateMany({ where: { sessionId: otherSessionId, releasedAt: null }, data: { releasedAt: new Date() } });
      for (const tableId of otherTables) await tx.sessionTable.create({ data: { sessionId, tableId } });
      await tx.tableSession.update({ where: { id: otherSessionId }, data: { status: 'CLOSED', closedAt: new Date(), notes: `Gộp vào ${target.code}` } });
      await tx.tableSession.update({ where: { id: sessionId }, data: { guestCount: target.guestCount + other.guestCount, status: target.status === 'PENDING' ? 'OPEN' : target.status } });
      await this.outbox.append(tx, { type: DomainEvents.sessionMerged, aggregateType: 'session', aggregateId: sessionId, branchId: target.branchId, payload: { sessionId, mergedSessionId: otherSessionId, tableIds: [...target.tables.map((t) => t.tableId), ...otherTables] }, actorStaffId: actor.staffId });
      await this.outbox.append(tx, { type: DomainEvents.sessionClosed, aggregateType: 'session', aggregateId: otherSessionId, branchId: target.branchId, payload: { sessionId: otherSessionId, mergedInto: sessionId }, actorStaffId: actor.staffId });
    });
    return this.getSession(sessionId);
  }

  async splitSession(sessionId: string, lineIds: string[], tableIds: string[], guestCount: number, actor: Actor) {
    const session = await this.mustSession(sessionId, ['OPEN', 'BILL_REQUESTED']);
    const branch = await this.loadBranch(session.branchId);
    const lines = await this.prisma.orderLine.findMany({ where: { id: { in: lineIds }, sessionId }, include: { billLines: { include: { bill: true } } } });
    if (lines.length !== lineIds.length) throw Errors.notFound('một số dòng món');
    if (lines.some((l) => l.billLines.some((b) => b.bill.status !== 'VOID'))) throw Errors.state('Có món đã nằm trong bill, hãy hủy bill trước khi tách');
    const newId = await this.prisma.$transaction(async (tx) => {
      await this.assertTablesFree(tx, branch.id, tableIds);
      const date = businessDate(new Date(), branch.businessDayCutoff, branch.timezone);
      const code = await this.nextCode('S', branch.code, date);
      const created = await tx.tableSession.create({
        data: { branchId: branch.id, code, status: 'OPEN', source: session.source, guestCount, businessDate: new Date(`${date}T00:00:00Z`), openedById: actor.staffId ?? null, serverId: session.serverId, notes: `Tách từ ${session.code}`, tables: { create: tableIds.map((tableId) => ({ tableId })) } },
      });
      const order = await tx.order.create({ data: { sessionId: created.id, branchId: branch.id, seq: 1, source: 'SYSTEM', status: 'SENT', placedById: actor.staffId ?? null, sentAt: new Date(), notes: `Tách từ ${session.code}` } });
      await tx.orderLine.updateMany({ where: { id: { in: lineIds } }, data: { sessionId: created.id, orderId: order.id } });
      const tickets = await tx.kitchenTicket.findMany({ where: { lines: { some: { orderLineId: { in: lineIds } } } }, include: { lines: true } });
      for (const t of tickets) {
        if (t.lines.every((tl) => lineIds.includes(tl.orderLineId))) await tx.kitchenTicket.update({ where: { id: t.id }, data: { sessionId: created.id } });
      }
      await this.outbox.append(tx, { type: DomainEvents.sessionOpened, aggregateType: 'session', aggregateId: created.id, branchId: branch.id, payload: { sessionId: created.id, code, status: 'OPEN', tableIds, guestCount, source: session.source, splitFrom: sessionId }, actorStaffId: actor.staffId });
      await this.outbox.append(tx, { type: DomainEvents.sessionUpdated, aggregateType: 'session', aggregateId: sessionId, branchId: branch.id, payload: { sessionId, splitTo: created.id, lineIds }, actorStaffId: actor.staffId });
      return created.id;
    });
    return { from: await this.getSession(sessionId), to: await this.getSession(newId) };
  }

  // ───────────────── Yêu cầu phục vụ ─────────────────

  async createServiceRequest(sessionId: string, input: z.infer<typeof serviceRequestSchema>, actor: Actor) {
    const session = await this.mustSession(sessionId, ['PENDING', 'OPEN', 'BILL_REQUESTED']);
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.serviceRequest.create({ data: { sessionId, branchId: session.branchId, kind: input.kind, note: input.note ?? null, participantId: actor.participantId ?? null, tableId: session.tables[0]?.tableId ?? null } });
      await this.outbox.append(tx, { type: DomainEvents.serviceRequested, aggregateType: 'session', aggregateId: sessionId, branchId: session.branchId, payload: { sessionId, requestId: req.id, kind: input.kind, note: input.note, tableNames: session.tables.map((t) => t.table.name) }, actorParticipantId: actor.participantId });
      return req;
    });
  }

  async updateServiceRequest(requestId: string, status: 'ACKED' | 'DONE', actor: Actor) {
    const req = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!req) throw Errors.notFound('yêu cầu');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.update({ where: { id: requestId }, data: status === 'ACKED' ? { status, ackedAt: new Date(), ackedById: actor.staffId ?? null } : { status, doneAt: new Date(), ackedById: req.ackedById ?? actor.staffId ?? null } });
      await this.outbox.append(tx, { type: status === 'ACKED' ? DomainEvents.serviceAcked : DomainEvents.serviceDone, aggregateType: 'session', aggregateId: req.sessionId, branchId: req.branchId, payload: { sessionId: req.sessionId, requestId }, actorStaffId: actor.staffId });
      return updated;
    });
  }

  listServiceRequests(branchId: string) {
    return this.prisma.serviceRequest.findMany({ where: { branchId, status: { in: ['OPEN', 'ACKED'] } }, orderBy: { createdAt: 'asc' }, include: { table: { select: { name: true } }, session: { select: { code: true } } } });
  }

  // ───────────────── Khách QR ─────────────────

  async qrLanding(token: string) {
    const table = await this.prisma.diningTable.findUnique({ where: { qrToken: token }, include: { branch: true, area: true, sessionTables: { where: { releasedAt: null, session: { status: { in: ['PENDING', 'OPEN', 'BILL_REQUESTED'] } } }, include: { session: { select: { id: true, code: true, status: true, guestCount: true, participants: { select: { id: true, nickname: true } } } } } } } });
    if (!table || !table.isActive || !table.branch.isActive) throw Errors.notFound('bàn');
    const session = table.sessionTables[0]?.session ?? null;
    return {
      branch: { id: table.branch.id, code: table.branch.code, name: table.branch.name, address: table.branch.address, phone: table.branch.phone, qrOrderMode: table.branch.qrOrderMode, guestJoinMode: table.branch.guestJoinMode },
      table: { id: table.id, code: table.code, name: table.name, area: table.area.name, isPrivateRoom: table.isPrivateRoom, maxSeats: table.maxSeats },
      session: session ? { id: session.id, code: session.code, status: session.status, guestCount: session.guestCount, participants: session.participants.length, requiresPin: table.branch.guestJoinMode === 'PIN' } : null,
    };
  }

  async guestJoin(token: string, input: { nickname?: string; joinPin?: string; guestCount?: number; locale: 'vi' | 'en'; deviceFingerprint?: string }) {
    const landing = await this.qrLanding(token);
    const branch = landing.branch;
    let sessionId = landing.session?.id ?? null;
    let isHost = false;
    if (!sessionId) {
      const created = await this.openSession(branch.id, { tableIds: [landing.table.id], guestCount: input.guestCount ?? 2, source: 'QR' }, {}, 'PENDING');
      sessionId = created.id;
      isHost = true;
    } else if (branch.guestJoinMode === 'PIN') {
      const session = await this.prisma.tableSession.findUniqueOrThrow({ where: { id: sessionId }, select: { joinPin: true, participants: { select: { id: true } } } });
      if (session.participants.length > 0 && session.joinPin && session.joinPin !== input.joinPin) {
        throw Errors.forbidden('Cần mã 4 số của bàn để tham gia (hỏi người mở bàn hoặc nhân viên)');
      }
    }
    const participant = await this.prisma.guestParticipant.create({
      data: { sessionId, nickname: input.nickname ?? null, locale: input.locale, deviceFingerprint: input.deviceFingerprint ?? null, isHost },
    });
    const session = await this.prisma.tableSession.findUniqueOrThrow({ where: { id: sessionId }, select: { id: true, code: true, status: true, joinPin: true, guestCount: true } });
    return { session: { id: session.id, code: session.code, status: session.status, guestCount: session.guestCount, joinPin: isHost ? session.joinPin : null }, participant, branch, table: landing.table };
  }

  // ───────────────── Tiện ích ─────────────────

  private async loadBranch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || !branch.isActive) throw Errors.notFound('cơ sở');
    return branch;
  }

  private async mustSession(sessionId: string, statuses: ('PENDING' | 'OPEN' | 'BILL_REQUESTED' | 'CLOSED' | 'CANCELLED')[]) {
    const session = await this.prisma.tableSession.findUnique({ where: { id: sessionId }, include: { tables: { where: { releasedAt: null }, include: { table: { select: { id: true, name: true } } } } } });
    if (!session) throw Errors.notFound('phiên bàn');
    if (!statuses.includes(session.status)) {
      if (statuses.length === 1) assertTransition('Phiên bàn', SESSION_TRANSITIONS, session.status, statuses[0]!);
      throw Errors.state(`Phiên bàn đang ở trạng thái ${session.status}`);
    }
    return session;
  }

  private async assertTablesFree(tx: Tx, branchId: string, tableIds: string[], exceptSessionId?: string) {
    const tables = await tx.diningTable.findMany({ where: { id: { in: tableIds }, branchId, isActive: true } });
    if (tables.length !== tableIds.length) throw Errors.notFound('bàn (hoặc bàn không thuộc cơ sở)');
    const busy = await tx.sessionTable.findFirst({
      where: { tableId: { in: tableIds }, releasedAt: null, session: { status: { in: ['PENDING', 'OPEN', 'BILL_REQUESTED'] }, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } },
      include: { table: true, session: { select: { code: true } } },
    });
    if (busy) throw Errors.conflict('TABLE_OCCUPIED', `${busy.table.name} đang có khách (phiên ${busy.session.code})`, { tableId: busy.tableId });
  }

  private async nextSeq(key: string): Promise<number> {
    const full = `seq:${key}`;
    const n = await this.redis.incr(full);
    if (n === 1) await this.redis.expire(full, 3 * 24 * 3600);
    return n;
  }

  private async nextCode(prefix: string, branchCode: string, date: string): Promise<string> {
    const seq = await this.nextSeq(`${prefix}:${branchCode}:${date}`);
    return documentCode(`${prefix}${branchCode.slice(0, 1)}`, date, seq);
  }
}

function deriveTableStatus(session: { status: string; orderLines: { status: string }[] } | null): TableDisplayStatus {
  if (!session) return 'EMPTY';
  if (session.status === 'PENDING') return 'PENDING';
  if (session.status === 'BILL_REQUESTED') return 'BILL';
  const statuses = session.orderLines.map((l) => l.status);
  if (statuses.some((s) => s === 'READY')) return 'READY';
  if (statuses.some((s) => s === 'SENT' || s === 'PREPARING')) return 'COOKING';
  return 'SEATED';
}
