import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import QRCode from 'qrcode';
import { Prisma } from '@dalan/db';
import {
  assertTransition,
  banquetKitchenQuantities,
  buildDepositSchedule,
  buildVietQrPayload,
  businessDate,
  computeEventTotals,
  documentCode,
  EVENT_TRANSITIONS,
  normalizeVnPhone,
  parseHHmm,
  sanitizePurpose,
  type EventStatus,
} from '@dalan/domain';
import {
  DomainEvents,
  type BeoIssueInput,
  type EventContractInput,
  type EventCreateInput,
  type EventMenuInput,
  type EventServiceInput,
  type EventUpdateInput,
  type HallInput,
  type PublicEventInquiryInput,
} from '@dalan/contracts';
import type { z } from 'zod';
import type { eventAdjustmentSchema, eventConfirmSchema, eventListQuerySchema, eventPaymentSchema, eventQuoteCreateSchema, eventServiceCatalogSchema } from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { ENV, type Env } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import { canAccessBranch, type StaffPrincipal } from '../../common/auth/principal.js';
import { OutboxService } from '../outbox/outbox.service.js';

type Tx = Prisma.TransactionClient;
const HOLD_HOURS = 48;

const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);
const fromDateOnly = (s: string) => new Date(`${s}T00:00:00Z`);

/** Nội dung chuyển khoản cọc tiệc: "DLT <mã tiệc>" (≤ 25 ký tự để đối soát). */
export function eventTransferPurpose(code: string): string {
  return sanitizePurpose(`DLT ${code}`);
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger('Events');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ───────────────── Sảnh ─────────────────

  listHalls(branchId: string) {
    return this.prisma.hall.findMany({ where: { branchId }, orderBy: { code: 'asc' } });
  }

  createHall(branchId: string, input: HallInput) {
    return this.prisma.hall.create({ data: { ...input, branchId, capacityByLayout: input.capacityByLayout as Prisma.InputJsonValue, rentalFee: toBig(input.rentalFee) } });
  }

  async updateHall(branchId: string, hallId: string, input: Partial<HallInput>) {
    const hall = await this.prisma.hall.findFirst({ where: { id: hallId, branchId } });
    if (!hall) throw Errors.notFound('sảnh');
    return this.prisma.hall.update({ where: { id: hallId }, data: { ...input, capacityByLayout: input.capacityByLayout as Prisma.InputJsonValue | undefined, rentalFee: toBig(input.rentalFee) } });
  }

  /** Lịch sảnh theo khoảng ngày: mọi tiệc chưa hủy, kèm giữ chỗ tạm và thời gian dọn. */
  async hallCalendar(branchId: string, from: string, to: string) {
    const halls = await this.prisma.hall.findMany({ where: { branchId, isActive: true }, orderBy: { code: 'asc' } });
    const rows = await this.prisma.eventHall.findMany({
      where: { hall: { branchId }, event: { eventDate: { gte: fromDateOnly(from), lte: fromDateOnly(to) }, status: { not: 'CANCELLED' } } },
      include: { event: { select: { id: true, code: true, kind: true, status: true, eventDate: true, startTime: true, endTime: true, contactName: true, expectedTables: true, confirmedTables: true, holdExpiresAt: true } } },
      orderBy: [{ event: { eventDate: 'asc' } }, { event: { startTime: 'asc' } }],
    });
    const now = new Date();
    return halls.map((h) => ({
      hall: h,
      bookings: rows
        .filter((r) => r.hallId === h.id)
        .map((r) => ({
          ...r.event,
          eventDate: toDateOnly(r.event.eventDate),
          layout: r.layout,
          isTentative: ['LEAD', 'QUOTED'].includes(r.event.status),
          holdExpired: !!r.event.holdExpiresAt && r.event.holdExpiresAt < now && ['LEAD', 'QUOTED'].includes(r.event.status),
          turnoverMinutes: h.turnoverMinutes,
        })),
    }));
  }

  private async assertHallsFree(tx: Tx, hallIds: string[], eventDate: string, startTime: string, endTime: string, excludeEventId?: string) {
    if (hallIds.length === 0) return;
    const halls = await tx.hall.findMany({ where: { id: { in: hallIds }, isActive: true } });
    if (halls.length !== new Set(hallIds).size) throw Errors.notFound('sảnh (hoặc sảnh ngừng hoạt động)');
    const start = parseHHmm(startTime);
    const end = parseHHmm(endTime);
    if (end <= start) throw Errors.invalid('TIME_RANGE', 'Giờ kết thúc phải sau giờ bắt đầu');
    const now = new Date();
    const existing = await tx.eventHall.findMany({
      where: { hallId: { in: hallIds }, event: { eventDate: fromDateOnly(eventDate), status: { notIn: ['CANCELLED', 'CLOSED', 'SETTLED'] }, ...(excludeEventId ? { id: { not: excludeEventId } } : {}) } },
      include: { event: { select: { id: true, code: true, status: true, startTime: true, endTime: true, holdExpiresAt: true } }, hall: { select: { name: true, turnoverMinutes: true } } },
    });
    for (const eh of existing) {
      const tentativeExpired = !!eh.event.holdExpiresAt && eh.event.holdExpiresAt < now && ['LEAD', 'QUOTED'].includes(eh.event.status);
      if (tentativeExpired) continue;
      const s = parseHHmm(eh.event.startTime) - eh.hall.turnoverMinutes;
      const e = parseHHmm(eh.event.endTime) + eh.hall.turnoverMinutes;
      if (start < e && end > s) {
        throw Errors.conflict('HALL_CONFLICT', `${eh.hall.name} đã có tiệc ${eh.event.code} (${eh.event.startTime}-${eh.event.endTime}, tính cả ${eh.hall.turnoverMinutes} phút dọn)`, {
          hallId: eh.hallId,
          eventId: eh.event.id,
          status: eh.event.status,
        });
      }
    }
  }

  // ───────────────── Danh mục dịch vụ ─────────────────

  listServiceCatalog(orgId: string) {
    return this.prisma.eventServiceCatalog.findMany({ where: { orgId }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }
  createServiceCatalog(orgId: string, input: z.infer<typeof eventServiceCatalogSchema>) {
    return this.prisma.eventServiceCatalog.create({ data: { ...input, orgId, price: BigInt(input.price) } });
  }
  async updateServiceCatalog(orgId: string, id: string, input: Partial<z.infer<typeof eventServiceCatalogSchema>>) {
    const row = await this.prisma.eventServiceCatalog.findFirst({ where: { id, orgId } });
    if (!row) throw Errors.notFound('dịch vụ');
    return this.prisma.eventServiceCatalog.update({ where: { id }, data: { ...input, price: toBig(input.price) ?? undefined } });
  }

  // ───────────────── Tiệc: tạo và đọc ─────────────────

  async listEvents(branchId: string, q: z.infer<typeof eventListQuerySchema>) {
    const events = await this.prisma.eventBooking.findMany({
      where: {
        branchId,
        ...(q.from || q.to ? { eventDate: { ...(q.from ? { gte: fromDateOnly(q.from) } : {}), ...(q.to ? { lte: fromDateOnly(q.to) } : {}) } } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.search ? { OR: [{ code: { contains: q.search, mode: 'insensitive' } }, { contactName: { contains: q.search, mode: 'insensitive' } }, { contactPhone: { contains: q.search } }, { companyName: { contains: q.search, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
      take: 500,
      include: { halls: { include: { hall: { select: { id: true, code: true, name: true } } } } },
    });
    return events.map((e) => ({ ...e, eventDate: toDateOnly(e.eventDate) }));
  }

  async getEvent(eventId: string, staff?: StaffPrincipal) {
    const ev = await this.prisma.eventBooking.findUnique({
      where: { id: eventId },
      include: {
        branch: { select: { id: true, code: true, name: true, address: true, phone: true, bankBin: true, bankAccountNo: true, bankAccountName: true } },
        customer: { select: { id: true, fullName: true, phone: true, companyName: true, taxCode: true, tags: true, pointsBalance: true } },
        halls: { include: { hall: true } },
        quotes: { orderBy: { version: 'desc' } },
        menus: { orderBy: { sortOrder: 'asc' }, include: { lines: { orderBy: { sortOrder: 'asc' } } } },
        services: { orderBy: { sortOrder: 'asc' }, include: { catalog: { select: { code: true, category: true } } } },
        deposits: { orderBy: { seq: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
        beos: { orderBy: { version: 'desc' } },
        adjustments: { orderBy: { createdAt: 'asc' } },
        eInvoices: { select: { id: true, status: true, invoiceNo: true, lookupUrl: true, provider: true } },
      },
    });
    if (!ev) throw Errors.notFound('tiệc');
    if (staff && !canAccessBranch(staff, ev.branchId)) throw Errors.forbidden('Bạn không thuộc cơ sở của tiệc này');
    const totals = this.totalsOf(ev);
    return { ...ev, eventDate: toDateOnly(ev.eventDate), deposits: ev.deposits.map((d) => ({ ...d, dueDate: toDateOnly(d.dueDate) })), totals };
  }

  private totalsOf(ev: { menus: { pricePerTable: bigint; tables: number }[]; services: { unitPrice: bigint; quantity: Prisma.Decimal; isIncluded: boolean }[]; adjustments: { amount: bigint }[]; payments: { kind: string; status: string; amount: bigint }[]; discountAmount: bigint; serviceChargeBps: number; vatBps: number }) {
    const totals = computeEventTotals({
      menus: ev.menus.map((m) => ({ pricePerTable: Number(m.pricePerTable), tables: m.tables })),
      services: ev.services.map((s) => ({ unitPrice: Number(s.unitPrice), quantity: Number(s.quantity), isIncluded: s.isIncluded })),
      adjustments: ev.adjustments.map((a) => ({ amount: Number(a.amount) })),
      discountAmount: Number(ev.discountAmount),
      serviceChargeBps: ev.serviceChargeBps,
      vatBps: ev.vatBps,
      priceIncludesVat: true,
    });
    const ok = ev.payments.filter((p) => p.status === 'SUCCEEDED');
    const deposits = ok.filter((p) => p.kind === 'DEPOSIT').reduce((s, p) => s + Number(p.amount), 0);
    const balance = ok.filter((p) => p.kind === 'BALANCE').reduce((s, p) => s + Number(p.amount), 0);
    const refunds = ok.filter((p) => p.kind === 'REFUND').reduce((s, p) => s + Number(p.amount), 0);
    const paid = deposits + balance - refunds;
    return { ...totals, depositsPaid: deposits, paid, due: Math.max(0, totals.total - paid) };
  }

  private async recompute(tx: Tx, eventId: string) {
    const ev = await tx.eventBooking.findUniqueOrThrow({ where: { id: eventId }, include: { menus: true, services: true, adjustments: true, payments: true } });
    const t = this.totalsOf(ev);
    await tx.eventBooking.update({
      where: { id: eventId },
      data: { subtotalMenu: BigInt(t.subtotalMenu), subtotalServices: BigInt(t.subtotalServices), discountAmount: BigInt(t.discountAmount), total: BigInt(t.total), depositTotal: BigInt(t.depositsPaid), paidTotal: BigInt(t.paid) },
    });
    return t;
  }

  private async appendTimeline(tx: Tx, eventId: string, entry: { status?: string; note: string; by?: string | null }) {
    const ev = await tx.eventBooking.findUniqueOrThrow({ where: { id: eventId }, select: { timeline: true } });
    const timeline = Array.isArray(ev.timeline) ? (ev.timeline as unknown[]) : [];
    timeline.push({ at: new Date().toISOString(), ...entry });
    await tx.eventBooking.update({ where: { id: eventId }, data: { timeline: timeline as Prisma.InputJsonValue } });
  }

  private async emit(tx: Tx, eventId: string, branchId: string, payload: Record<string, unknown>, staffId?: string | null) {
    await this.outbox.append(tx, { type: DomainEvents.eventBookingUpdated, aggregateType: 'event', aggregateId: eventId, branchId, payload: { eventId, ...payload }, actorStaffId: staffId ?? null });
  }

  private async transition(tx: Tx, eventId: string, to: EventStatus, staffId: string | null | undefined, note: string) {
    const ev = await tx.eventBooking.findUniqueOrThrow({ where: { id: eventId } });
    assertTransition('Tiệc', EVENT_TRANSITIONS, ev.status, to);
    await tx.eventBooking.update({ where: { id: eventId }, data: { status: to } });
    await this.appendTimeline(tx, eventId, { status: to, note, by: staffId ?? null });
    await this.emit(tx, eventId, ev.branchId, { status: to, previous: ev.status }, staffId);
    return ev;
  }

  async createEvent(branchId: string, input: EventCreateInput, staff: StaffPrincipal | null, source = 'STAFF') {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || !branch.isActive) throw Errors.notFound('cơ sở');
    const phone = normalizeVnPhone(input.contactPhone);
    if (!phone) throw Errors.invalid('INVALID_PHONE', 'Số điện thoại không hợp lệ');
    const id = await this.prisma.$transaction(async (tx) => {
      const customerId = input.customerId ?? (await this.upsertCustomer(tx, branch.orgId, phone, input.contactName, input.companyName, input.taxCode));
      const hallIds = input.halls.map((h) => h.hallId);
      await this.assertHallsFree(tx, hallIds, input.eventDate, input.startTime, input.endTime);
      const today = businessDate(new Date(), branch.businessDayCutoff, branch.timezone);
      const seq = await this.nextSeq(`EV:${branch.code}:${today}`);
      const code = documentCode(`EV${branch.code.slice(0, 1)}`, today, seq);
      const { halls, holdHalls, customerId: _c, ...rest } = input;
      const created = await tx.eventBooking.create({
        data: {
          ...rest,
          contactPhone: phone,
          branchId,
          code,
          customerId,
          eventDate: fromDateOnly(input.eventDate),
          source,
          ownerStaffId: input.ownerStaffId ?? staff?.staffId ?? null,
          holdExpiresAt: holdHalls && hallIds.length ? new Date(Date.now() + HOLD_HOURS * 3600_000) : null,
          vatBps: branch.vatRateBps,
          timeline: [{ at: new Date().toISOString(), status: 'LEAD', note: 'Tạo yêu cầu', by: staff?.staffId ?? null }],
          halls: { create: halls.map((h) => ({ hallId: h.hallId, layout: h.layout, setupNotes: h.setupNotes ?? null })) },
        },
      });
      await this.emit(tx, created.id, branchId, { status: 'LEAD', code }, staff?.staffId);
      return created.id;
    });
    return this.getEvent(id);
  }

  private async upsertCustomer(tx: Tx, orgId: string, phone: string, fullName: string, companyName?: string, taxCode?: string) {
    const customer = await tx.customer.upsert({
      where: { orgId_phone: { orgId, phone } },
      update: { ...(companyName ? { companyName } : {}), ...(taxCode ? { taxCode } : {}) },
      create: { orgId, phone, fullName, companyName: companyName ?? null, taxCode: taxCode ?? null, source: 'event', firstVisitAt: new Date() },
    });
    return customer.id;
  }

  /** Form yêu cầu tiệc công khai (web, Zalo): tạo lead và hồ sơ khách. */
  async publicInquiry(input: PublicEventInquiryInput) {
    const branch = await this.prisma.branch.findFirst({ where: { code: input.branchCode.toUpperCase(), isActive: true } });
    if (!branch) throw Errors.notFound('cơ sở');
    const startTime = input.startTime ?? '18:00';
    const endMinutes = Math.min(parseHHmm(startTime) + 180, 23 * 60 + 59);
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    const ev = await this.createEvent(
      branch.id,
      {
        kind: input.kind,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        eventDate: input.eventDate,
        startTime,
        endTime,
        halls: [],
        holdHalls: false,
        expectedTables: input.expectedTables ?? (input.expectedGuests ? Math.ceil(input.expectedGuests / 10) : 0),
        guestsPerTable: 10,
        expectedGuests: input.expectedGuests,
        beveragePolicy: 'ACTUAL',
        notes: input.notes,
      },
      null,
      'WEB',
    );
    return { id: ev.id, code: ev.code, status: ev.status, message: 'Dạ Lan đã nhận yêu cầu, nhân viên sẽ liên hệ trong 24 giờ' };
  }

  async updateEvent(eventId: string, input: EventUpdateInput, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    if (['SETTLED', 'CLOSED', 'CANCELLED'].includes(ev.status)) throw Errors.state('Tiệc đã kết thúc, không sửa được');
    await this.prisma.$transaction(async (tx) => {
      const { halls, holdHalls, customerId, contactPhone, ...rest } = input;
      const eventDate = input.eventDate ?? ev.eventDate;
      const startTime = input.startTime ?? ev.startTime;
      const endTime = input.endTime ?? ev.endTime;
      const hallIds = halls ? halls.map((h) => h.hallId) : ev.halls.map((h) => h.hallId);
      if (halls || input.eventDate || input.startTime || input.endTime) await this.assertHallsFree(tx, hallIds, eventDate, startTime, endTime, eventId);
      const data: Prisma.EventBookingUncheckedUpdateInput = {
        ...rest,
        ...(contactPhone ? { contactPhone: normalizeVnPhone(contactPhone) ?? contactPhone } : {}),
        ...(customerId !== undefined ? { customerId } : {}),
        ...(input.eventDate ? { eventDate: fromDateOnly(input.eventDate) } : {}),
        ...(input.discountAmount !== undefined ? { discountAmount: BigInt(input.discountAmount) } : {}),
      };
      if (holdHalls !== undefined && ['LEAD', 'QUOTED'].includes(ev.status)) data.holdExpiresAt = holdHalls ? new Date(Date.now() + HOLD_HOURS * 3600_000) : null;
      await tx.eventBooking.update({ where: { id: eventId }, data });
      if (halls) {
        await tx.eventHall.deleteMany({ where: { eventId } });
        await tx.eventHall.createMany({ data: halls.map((h) => ({ eventId, hallId: h.hallId, layout: h.layout, setupNotes: h.setupNotes ?? null })) });
      }
      await this.recompute(tx, eventId);
      await this.emit(tx, eventId, ev.branchId, { updated: Object.keys(input) }, staff.staffId);
    });
    return this.getEvent(eventId);
  }

  // ───────────────── Thực đơn và dịch vụ ─────────────────

  async replaceMenus(eventId: string, menus: EventMenuInput[], staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    if (!['LEAD', 'QUOTED', 'CONTRACTED', 'CONFIRMED', 'BEO_ISSUED'].includes(ev.status)) throw Errors.state('Không sửa thực đơn ở trạng thái hiện tại');
    const itemIds = menus.flatMap((m) => m.lines.map((l) => l.itemId).filter((x): x is string => !!x));
    const items = itemIds.length ? await this.prisma.menuItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true } }) : [];
    await this.prisma.$transaction(async (tx) => {
      await tx.eventMenu.deleteMany({ where: { eventId } });
      for (const [i, m] of menus.entries()) {
        await tx.eventMenu.create({
          data: {
            eventId,
            name: m.name,
            pricePerTable: BigInt(m.pricePerTable),
            tables: m.tables,
            notes: m.notes ?? null,
            isFinal: m.isFinal,
            sortOrder: i,
            lines: {
              create: m.lines.map((l, j) => {
                const item = l.itemId ? items.find((x) => x.id === l.itemId) : undefined;
                if (l.itemId && !item) throw Errors.notFound(`món ${l.itemId}`);
                if (!item && !l.name) throw Errors.invalid('LINE_NAME', 'Dòng thực đơn cần món hoặc tên');
                return { itemId: item?.id ?? null, nameSnapshot: l.name ?? item!.name, quantityPerTable: l.quantityPerTable, unit: l.unit ?? item?.unit ?? null, note: l.note ?? null, sortOrder: j };
              }),
            },
          },
        });
      }
      await this.recompute(tx, eventId);
      await this.emit(tx, eventId, ev.branchId, { menus: menus.length }, staff.staffId);
    });
    return this.getEvent(eventId);
  }

  async replaceServices(eventId: string, services: EventServiceInput[], staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    if (!['LEAD', 'QUOTED', 'CONTRACTED', 'CONFIRMED', 'BEO_ISSUED'].includes(ev.status)) throw Errors.state('Không sửa dịch vụ ở trạng thái hiện tại');
    const catalogIds = services.map((s) => s.catalogId).filter((x): x is string => !!x);
    const catalog = catalogIds.length ? await this.prisma.eventServiceCatalog.findMany({ where: { id: { in: catalogIds } } }) : [];
    await this.prisma.$transaction(async (tx) => {
      await tx.eventService.deleteMany({ where: { eventId } });
      for (const [i, s] of services.entries()) {
        const c = s.catalogId ? catalog.find((x) => x.id === s.catalogId) : undefined;
        if (s.catalogId && !c) throw Errors.notFound(`dịch vụ ${s.catalogId}`);
        const unitPrice = s.unitPrice ?? (c ? Number(c.price) : undefined);
        const name = s.name ?? c?.name;
        if (unitPrice === undefined || !name) throw Errors.invalid('SERVICE_INPUT', 'Dịch vụ cần tên và đơn giá (hoặc chọn từ danh mục)');
        await tx.eventService.create({ data: { eventId, catalogId: c?.id ?? null, name, unitPrice: BigInt(unitPrice), quantity: s.quantity, total: BigInt(Math.round(unitPrice * s.quantity)), note: s.note ?? null, isIncluded: s.isIncluded, sortOrder: i } });
      }
      await this.recompute(tx, eventId);
      await this.emit(tx, eventId, ev.branchId, { services: services.length }, staff.staffId);
    });
    return this.getEvent(eventId);
  }

  // ───────────────── Báo giá → hợp đồng → chốt → BEO ─────────────────

  async createQuote(eventId: string, input: z.infer<typeof eventQuoteCreateSchema>, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    if (!['LEAD', 'QUOTED'].includes(ev.status)) throw Errors.state('Chỉ báo giá khi tiệc ở trạng thái yêu cầu hoặc đã báo giá');
    if (ev.menus.length === 0) throw Errors.state('Thêm thực đơn tiệc trước khi báo giá');
    const quoteId = await this.prisma.$transaction(async (tx) => {
      await tx.eventBooking.update({
        where: { id: eventId },
        data: { ...(input.discountAmount !== undefined ? { discountAmount: BigInt(input.discountAmount) } : {}), ...(input.serviceChargeBps !== undefined ? { serviceChargeBps: input.serviceChargeBps } : {}), ...(input.vatBps !== undefined ? { vatBps: input.vatBps } : {}) },
      });
      const totals = await this.recompute(tx, eventId);
      const fresh = await tx.eventBooking.findUniqueOrThrow({ where: { id: eventId }, include: { menus: { include: { lines: true } }, services: true, halls: { include: { hall: true } } } });
      await tx.eventQuote.updateMany({ where: { eventId, status: { in: ['DRAFT', 'SENT'] } }, data: { status: 'SUPERSEDED' } });
      const version = (await tx.eventQuote.count({ where: { eventId } })) + 1;
      const quote = await tx.eventQuote.create({
        data: {
          eventId,
          version,
          status: 'SENT',
          sentAt: new Date(),
          createdById: staff.staffId,
          total: BigInt(totals.total),
          payload: {
            version,
            event: { code: fresh.code, kind: fresh.kind, eventDate: toDateOnly(fresh.eventDate), startTime: fresh.startTime, endTime: fresh.endTime, contactName: fresh.contactName, companyName: fresh.companyName, expectedTables: fresh.expectedTables, guestsPerTable: fresh.guestsPerTable },
            halls: fresh.halls.map((h) => ({ name: h.hall.name, layout: h.layout })),
            menus: fresh.menus.map((m) => ({ name: m.name, pricePerTable: Number(m.pricePerTable), tables: m.tables, lines: m.lines.map((l) => ({ name: l.nameSnapshot, quantityPerTable: Number(l.quantityPerTable), unit: l.unit })) })),
            services: fresh.services.map((s) => ({ name: s.name, unitPrice: Number(s.unitPrice), quantity: Number(s.quantity), total: Number(s.total), isIncluded: s.isIncluded })),
            totals,
            validUntil: input.validUntil ?? null,
            terms: input.terms ?? null,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      if (ev.status === 'LEAD') await this.transition(tx, eventId, 'QUOTED', staff.staffId, `Báo giá v${version}`);
      else await this.appendTimeline(tx, eventId, { note: `Báo giá v${version}`, by: staff.staffId });
      await this.emit(tx, eventId, ev.branchId, { quoteVersion: version, total: totals.total }, staff.staffId);
      return quote.id;
    });
    return { quoteId, event: await this.getEvent(eventId) };
  }

  async contract(eventId: string, input: EventContractInput, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    await this.prisma.$transaction(async (tx) => {
      await this.assertHallsFree(tx, ev.halls.map((h) => h.hallId), ev.eventDate, ev.startTime, ev.endTime, eventId);
      const totals = await this.recompute(tx, eventId);
      const rows = buildDepositSchedule(totals.total, input.depositSteps, 'Thanh toán còn lại', input.finalDueDate ?? ev.eventDate);
      await tx.eventDepositSchedule.deleteMany({ where: { eventId } });
      await tx.eventDepositSchedule.createMany({ data: rows.map((r) => ({ eventId, seq: r.seq, label: r.label, amount: BigInt(r.amount), percentBps: r.percentBps, dueDate: fromDateOnly(r.dueDate) })) });
      await tx.eventQuote.updateMany({ where: { eventId, status: 'SENT' }, data: { status: 'ACCEPTED' } });
      await tx.eventBooking.update({ where: { id: eventId }, data: { holdExpiresAt: null, ...(input.signedDocumentUrl ? { internalNotes: `${ev.internalNotes ?? ''}\nHợp đồng: ${input.signedDocumentUrl}`.trim() } : {}) } });
      await this.transition(tx, eventId, 'CONTRACTED', staff.staffId, input.note ?? 'Ký hợp đồng, lập lịch đặt cọc');
    });
    return this.getEvent(eventId);
  }

  async confirm(eventId: string, input: z.infer<typeof eventConfirmSchema>, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    await this.prisma.$transaction(async (tx) => {
      await tx.eventBooking.update({ where: { id: eventId }, data: { confirmedTables: input.confirmedTables, reserveTables: input.reserveTables, ...(input.guestsPerTable ? { guestsPerTable: input.guestsPerTable } : {}) } });
      if (input.menuTables) {
        for (const mt of input.menuTables) await tx.eventMenu.updateMany({ where: { id: mt.menuId, eventId }, data: { tables: mt.tables, isFinal: true } });
      } else if (ev.menus.length === 1) {
        await tx.eventMenu.updateMany({ where: { eventId }, data: { tables: input.confirmedTables, isFinal: true } });
      } else {
        await tx.eventMenu.updateMany({ where: { eventId }, data: { isFinal: true } });
      }
      await this.recompute(tx, eventId);
      await this.transition(tx, eventId, 'CONFIRMED', staff.staffId, `Chốt ${input.confirmedTables} mâm (+${input.reserveTables} dự phòng)`);
    });
    return this.getEvent(eventId);
  }

  async issueBeo(eventId: string, input: BeoIssueInput, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    if (!['CONFIRMED', 'BEO_ISSUED'].includes(ev.status)) throw Errors.state('Phát hành BEO sau khi chốt thực đơn và số mâm');
    const confirmed = ev.confirmedTables ?? ev.expectedTables;
    const kitchen = banquetKitchenQuantities(
      ev.menus.flatMap((m) => m.lines.map((l) => ({ name: `${l.nameSnapshot}${ev.menus.length > 1 ? ` [${m.name}]` : ''}`, quantityPerTable: Number(l.quantityPerTable) * (ev.menus.length > 1 ? m.tables / Math.max(1, confirmed) : 1), unit: l.unit ?? undefined }))),
      confirmed,
      ev.reserveTables,
    );
    const beoId = await this.prisma.$transaction(async (tx) => {
      await tx.eventOrderSheet.updateMany({ where: { eventId, status: 'ISSUED' }, data: { status: 'SUPERSEDED' } });
      const version = (await tx.eventOrderSheet.count({ where: { eventId } })) + 1;
      const content = {
        version,
        issuedAt: new Date().toISOString(),
        issuedBy: staff.fullName,
        event: { code: ev.code, kind: ev.kind, eventDate: ev.eventDate, startTime: ev.startTime, endTime: ev.endTime, confirmedTables: confirmed, reserveTables: ev.reserveTables, guestsPerTable: ev.guestsPerTable, expectedGuests: ev.expectedGuests, beveragePolicy: ev.beveragePolicy, beverageNotes: ev.beverageNotes },
        customer: { contactName: ev.contactName, contactPhone: ev.contactPhone, contactEmail: ev.contactEmail, companyName: ev.companyName, taxCode: ev.taxCode, notes: ev.notes },
        halls: ev.halls.map((h) => ({ name: h.hall.name, layout: h.layout, setupNotes: h.setupNotes })),
        timeline: input.timeline,
        menus: ev.menus.map((m) => ({ name: m.name, pricePerTable: Number(m.pricePerTable), tables: m.tables, lines: m.lines.map((l) => ({ name: l.nameSnapshot, quantityPerTable: Number(l.quantityPerTable), unit: l.unit, note: l.note })) })),
        kitchenQuantities: kitchen,
        services: ev.services.map((s) => ({ name: s.name, quantity: Number(s.quantity), unitPrice: Number(s.unitPrice), total: Number(s.total), isIncluded: s.isIncluded, note: s.note })),
        staffing: input.staffing,
        setupNotes: input.setupNotes ?? null,
        specialNotes: input.specialNotes ?? ev.internalNotes ?? null,
        financials: { ...ev.totals, deposits: ev.deposits.map((d) => ({ label: d.label, amount: Number(d.amount), dueDate: d.dueDate, status: d.status })) },
      };
      const beo = await tx.eventOrderSheet.create({ data: { eventId, version, status: 'ISSUED', issuedAt: new Date(), issuedById: staff.staffId, content: content as unknown as Prisma.InputJsonValue } });
      if (ev.status === 'CONFIRMED') await this.transition(tx, eventId, 'BEO_ISSUED', staff.staffId, `Phát hành BEO v${version}`);
      else await this.appendTimeline(tx, eventId, { note: `Phát hành lại BEO v${version}`, by: staff.staffId });
      await this.emit(tx, eventId, ev.branchId, { beoVersion: version }, staff.staffId);
      return beo.id;
    });
    const beo = await this.prisma.eventOrderSheet.findUniqueOrThrow({ where: { id: beoId } });
    return { beo, event: await this.getEvent(eventId) };
  }

  // ───────────────── Ngày tiệc, thanh toán, quyết toán ─────────────────

  async start(eventId: string, staff: StaffPrincipal) {
    await this.getEvent(eventId, staff);
    await this.prisma.$transaction((tx) => this.transition(tx, eventId, 'IN_PROGRESS', staff.staffId, 'Bắt đầu phục vụ tiệc'));
    return this.getEvent(eventId);
  }

  async addAdjustment(eventId: string, input: z.infer<typeof eventAdjustmentSchema>, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    if (!['IN_PROGRESS', 'BEO_ISSUED', 'CONFIRMED'].includes(ev.status)) throw Errors.state('Chỉ ghi phát sinh khi tiệc đã chốt hoặc đang diễn ra');
    let amount = input.amount ?? Math.round(input.quantity * input.unitPrice);
    if (input.kind === 'DISCOUNT') amount = -Math.abs(amount);
    await this.prisma.$transaction(async (tx) => {
      await tx.eventAdjustment.create({ data: { eventId, kind: input.kind, description: input.description, quantity: input.quantity, unitPrice: BigInt(input.unitPrice), amount: BigInt(amount), createdById: staff.staffId } });
      const totals = await this.recompute(tx, eventId);
      await this.appendTimeline(tx, eventId, { note: `Phát sinh: ${input.description} (${amount.toLocaleString('vi-VN')}đ)`, by: staff.staffId });
      await this.emit(tx, eventId, ev.branchId, { adjustment: input.kind, amount, total: totals.total }, staff.staffId);
    });
    return this.getEvent(eventId);
  }

  async depositQr(eventId: string, amount: number | undefined, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    if (!ev.branch.bankBin || !ev.branch.bankAccountNo) throw Errors.state('Cơ sở chưa cấu hình tài khoản nhận VietQR');
    const nextDue = ev.deposits.find((d) => d.status === 'DUE' || d.status === 'OVERDUE');
    const qrAmount = amount ?? (nextDue ? Number(nextDue.amount) : ev.totals.due);
    if (qrAmount <= 0) throw Errors.invalid('AMOUNT_INVALID', 'Số tiền phải lớn hơn 0');
    const purpose = eventTransferPurpose(ev.code);
    const payload = buildVietQrPayload({ bankBin: ev.branch.bankBin, accountNo: ev.branch.bankAccountNo, amount: qrAmount, purpose });
    const qrDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 360 });
    return { amount: qrAmount, purpose, payload, qrDataUrl, bank: { bin: ev.branch.bankBin, accountNo: ev.branch.bankAccountNo, accountName: ev.branch.bankAccountName }, forDeposit: nextDue ? { seq: nextDue.seq, label: nextDue.label } : null };
  }

  async addPayment(eventId: string, input: z.infer<typeof eventPaymentSchema>, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    if (!['CONTRACTED', 'CONFIRMED', 'BEO_ISSUED', 'IN_PROGRESS', 'SETTLED', 'QUOTED'].includes(ev.status)) throw Errors.state('Tiệc chưa ký hợp đồng hoặc đã đóng');
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.eventPayment.create({ data: { eventId, kind: input.kind, method: input.method, amount: BigInt(input.amount), status: 'SUCCEEDED', externalRef: input.externalRef ?? null, receivedById: staff.staffId, note: input.note ?? null } });
      if (input.kind === 'DEPOSIT') {
        const target = input.depositSeq
          ? await tx.eventDepositSchedule.findFirst({ where: { eventId, seq: input.depositSeq } })
          : await tx.eventDepositSchedule.findFirst({ where: { eventId, status: { in: ['DUE', 'OVERDUE'] } }, orderBy: { seq: 'asc' } });
        if (target && target.status !== 'PAID') await tx.eventDepositSchedule.update({ where: { id: target.id }, data: { status: 'PAID', paidAt: new Date(), paymentId: payment.id } });
      }
      const totals = await this.recompute(tx, eventId);
      await this.appendTimeline(tx, eventId, { note: `${input.kind === 'REFUND' ? 'Hoàn' : 'Thu'} ${input.amount.toLocaleString('vi-VN')}đ (${input.method})`, by: staff.staffId });
      await this.emit(tx, eventId, ev.branchId, { payment: input.kind, amount: input.amount, paid: totals.paid, due: totals.due }, staff.staffId);
    });
    return this.getEvent(eventId);
  }

  async settle(eventId: string, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    await this.prisma.$transaction(async (tx) => {
      const totals = await this.recompute(tx, eventId);
      await tx.eventBooking.update({ where: { id: eventId }, data: { settledTotal: BigInt(totals.total) } });
      await tx.eventDepositSchedule.updateMany({ where: { eventId, status: { in: ['DUE', 'OVERDUE'] } }, data: { status: 'WAIVED' } });
      if (ev.taxCode && ev.eInvoices.length === 0) {
        const provider = ({ mock: 'MOCK', misa: 'MISA', viettel: 'VIETTEL', vnpt: 'VNPT' } as const)[this.env.EINVOICE_PROVIDER];
        await tx.eInvoice.create({
          data: { branchId: ev.branchId, eventBookingId: eventId, provider, status: 'DRAFT', buyerName: ev.companyName ?? ev.contactName, buyerTaxCode: ev.taxCode, buyerEmail: ev.contactEmail, buyerPhone: ev.contactPhone, totalBeforeVat: BigInt(totals.total - totals.vatAmount), vatAmount: BigInt(totals.vatAmount), total: BigInt(totals.total), createdById: staff.staffId },
        });
      }
      await this.transition(tx, eventId, 'SETTLED', staff.staffId, `Quyết toán ${totals.total.toLocaleString('vi-VN')}đ, còn thu ${totals.due.toLocaleString('vi-VN')}đ`);
    });
    return this.getEvent(eventId);
  }

  async close(eventId: string, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    if (ev.totals.due > 0) throw Errors.state(`Còn phải thu ${ev.totals.due.toLocaleString('vi-VN')}đ, thu đủ trước khi đóng hồ sơ`);
    await this.prisma.$transaction((tx) => this.transition(tx, eventId, 'CLOSED', staff.staffId, 'Đóng hồ sơ tiệc'));
    return this.getEvent(eventId);
  }

  /** Khách chưa đồng ý báo giá, quay lại trạng thái yêu cầu để báo giá lại (QUOTED → LEAD). */
  async reopenAsLead(eventId: string, note: string | undefined, staff: StaffPrincipal) {
    await this.getEvent(eventId, staff);
    await this.prisma.$transaction(async (tx) => {
      await tx.eventQuote.updateMany({ where: { eventId, status: { in: ['DRAFT', 'SENT'] } }, data: { status: 'REJECTED' } });
      await this.transition(tx, eventId, 'LEAD', staff.staffId, note ? `Mở lại yêu cầu: ${note}` : 'Mở lại yêu cầu để báo giá lại');
    });
    return this.getEvent(eventId);
  }

  async cancel(eventId: string, reason: string, refundAmount: number | undefined, staff: StaffPrincipal) {
    const ev = await this.getEvent(eventId, staff);
    await this.prisma.$transaction(async (tx) => {
      if (refundAmount && refundAmount > 0) {
        await tx.eventPayment.create({ data: { eventId, kind: 'REFUND', method: 'CASH', amount: BigInt(refundAmount), status: 'SUCCEEDED', receivedById: staff.staffId, note: `Hoàn cọc khi hủy: ${reason}` } });
      }
      await tx.eventBooking.update({ where: { id: eventId }, data: { cancelledAt: new Date(), cancelReason: reason, holdExpiresAt: null } });
      await tx.eventDepositSchedule.updateMany({ where: { eventId, status: { in: ['DUE', 'OVERDUE'] } }, data: { status: 'WAIVED' } });
      await this.recompute(tx, eventId);
      await this.transition(tx, eventId, 'CANCELLED', staff.staffId, `Hủy: ${reason}`);
    });
    return this.getEvent(eventId);
  }

  // ───────────────── Báo cáo nhanh ─────────────────

  async summary(branchId: string) {
    const now = new Date();
    const today = fromDateOnly(toDateOnly(now));
    const in7 = new Date(today.getTime() + 7 * 86_400_000);
    const in30 = new Date(today.getTime() + 30 * 86_400_000);
    const ago30 = new Date(today.getTime() - 30 * 86_400_000);
    const [byStatus, upcoming7, upcoming30, settled, leads30, contracted30, overdueDeposits] = await Promise.all([
      this.prisma.eventBooking.groupBy({ by: ['status'], where: { branchId }, _count: true }),
      this.prisma.eventBooking.count({ where: { branchId, eventDate: { gte: today, lt: in7 }, status: { notIn: ['CANCELLED', 'CLOSED'] } } }),
      this.prisma.eventBooking.count({ where: { branchId, eventDate: { gte: today, lt: in30 }, status: { notIn: ['CANCELLED', 'CLOSED'] } } }),
      this.prisma.eventBooking.groupBy({ by: ['kind'], where: { branchId, status: { in: ['SETTLED', 'CLOSED'] }, eventDate: { gte: ago30 } }, _sum: { total: true }, _count: true }),
      this.prisma.eventBooking.count({ where: { branchId, createdAt: { gte: ago30 } } }),
      this.prisma.eventBooking.count({ where: { branchId, createdAt: { gte: ago30 }, status: { in: ['CONTRACTED', 'CONFIRMED', 'BEO_ISSUED', 'IN_PROGRESS', 'SETTLED', 'CLOSED'] } } }),
      this.prisma.eventDepositSchedule.findMany({ where: { status: { in: ['DUE', 'OVERDUE'] }, dueDate: { lt: today }, event: { branchId, status: { notIn: ['CANCELLED', 'CLOSED'] } } }, include: { event: { select: { code: true, contactName: true } } } }),
    ]);
    return {
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      upcoming: { next7Days: upcoming7, next30Days: upcoming30 },
      revenueLast30DaysByKind: settled.map((r) => ({ kind: r.kind, events: r._count, total: Number(r._sum.total ?? 0) })),
      conversion: { leads: leads30, contracted: contracted30, rate: leads30 ? Math.round((contracted30 / leads30) * 100) : null },
      overdueDeposits: overdueDeposits.map((d) => ({ eventCode: d.event.code, contactName: d.event.contactName, label: d.label, amount: Number(d.amount), dueDate: toDateOnly(d.dueDate) })),
    };
  }

  /** Worker: giải phóng giữ chỗ tạm quá 48 giờ chưa ký hợp đồng, đánh dấu cọc quá hạn. */
  @Interval(10 * 60_000)
  async housekeeping(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.eventBooking.findMany({ where: { holdExpiresAt: { lt: now }, status: { in: ['LEAD', 'QUOTED'] } }, select: { id: true, branchId: true, code: true } });
    for (const ev of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.eventHall.deleteMany({ where: { eventId: ev.id } });
        await tx.eventBooking.update({ where: { id: ev.id }, data: { holdExpiresAt: null } });
        await this.appendTimeline(tx, ev.id, { note: 'Hết hạn giữ chỗ tạm 48 giờ, đã giải phóng sảnh' });
        await this.emit(tx, ev.id, ev.branchId, { holdReleased: true });
      });
      this.logger.log(`Giải phóng giữ chỗ tạm tiệc ${ev.code}`);
    }
    await this.prisma.eventDepositSchedule.updateMany({ where: { status: 'DUE', dueDate: { lt: now } }, data: { status: 'OVERDUE' } });
  }

  private async nextSeq(key: string): Promise<number> {
    const full = `seq:${key}`;
    const n = await this.redis.incr(full);
    if (n === 1) await this.redis.expire(full, 3 * 24 * 3600);
    return n;
  }
}

function toBig(value: number | null | undefined): bigint | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return BigInt(value);
}
