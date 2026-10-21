import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Prisma } from '@dalan/db';
import { assertTransition, businessDate, documentCode, normalizeVnPhone, parseHHmm, RESERVATION_TRANSITIONS, toLocal } from '@dalan/domain';
import {
  DomainEvents,
  NotificationTemplates,
  type AvailabilityQuery,
  type AvailabilityResult,
  type AvailabilitySlot,
  type CreateReservationInput,
  type RecordDepositInput,
  type PublicReservationInput,
  type UpdateReservationInput,
} from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { Errors } from '../../common/errors.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { DiningService } from '../dining/dining.service.js';
import { MessagingService, formatVnDateTime } from '../notifications/messaging.service.js';

interface ReservationSettings {
  reservationSlotMinutes?: number;
  reservationLeadMinutes?: number;
  reservationMaxDaysAhead?: number;
  reservationCapacityBps?: number;
  reservationAutoConfirm?: boolean;
  vipDiningMinutes?: number;
  cancelBeforeMinutes?: number;
  autoNoShowMinutes?: number | null;
  depositPolicy?: {
    minPartySize?: number;
    amountPerGuest?: number;
    fixedAmount?: number;
    vipRoomAmount?: number;
    holidayDates?: string[];
    holidayAmountPerGuest?: number;
  };
}

type OpeningHours = Record<string, { from: string; to: string }>;
const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'SEATED'] as const;
const VN_OFFSET = '+07:00';

@Injectable()
export class ReservationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Reservations');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly dining: DiningService,
    private readonly messaging: MessagingService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    if (process.env.RESERVATION_WORKER === 'off') return;
    this.timer = setInterval(() => void this.reminderTick(), 5 * 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ───────────────── Khả dụng ─────────────────

  async availability(branchId: string, query: AvailabilityQuery, now = new Date()): Promise<AvailabilityResult> {
    const branch = await this.loadBranch(branchId);
    const settings = branch.settings as ReservationSettings;
    const area = query.areaId ? await this.prisma.area.findFirst({ where: { id: query.areaId, branchId, isActive: true } }) : null;
    if (query.areaId && !area) throw Errors.notFound('khu vực');
    const isVip = area?.kind === 'VIP_ROOM';
    const duration = query.durationMinutes ?? (isVip ? (settings.vipDiningMinutes ?? 150) : branch.defaultDiningMinutes);
    const slotMinutes = settings.reservationSlotMinutes ?? 15;
    const leadMinutes = settings.reservationLeadMinutes ?? 30;
    const capacityBps = settings.reservationCapacityBps ?? 8000;

    const local = toLocal(new Date(`${query.date}T12:00:00${VN_OFFSET}`), branch.timezone);
    const hours = this.openingHoursFor(branch.openingHours as OpeningHours, local.isoWeekday);
    const open = parseHHmm(hours.from);
    const close = parseHHmm(hours.to);

    const tables = await this.prisma.diningTable.findMany({
      where: { branchId, isActive: true, area: { isActive: true, kind: { notIn: ['VIRTUAL', 'TAKEAWAY'] }, ...(area ? { id: area.id } : {}) } },
      select: { id: true, maxSeats: true, isPrivateRoom: true, areaId: true },
    });
    const capacitySeats = tables.reduce((s, t) => s + t.maxSeats, 0);
    const usableSeats = Math.floor((capacitySeats * capacityBps) / 10_000);
    const tableIdSet = new Set(tables.map((t) => t.id));
    const rooms = tables.filter((t) => t.isPrivateRoom && t.maxSeats >= query.partySize);

    const dayStart = new Date(`${query.date}T00:00:00${VN_OFFSET}`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
    const reservations = await this.prisma.reservation.findMany({
      where: {
        branchId,
        status: { in: [...ACTIVE_STATUSES] },
        reservedAt: { gte: new Date(dayStart.getTime() - 12 * 3600_000), lt: dayEnd },
        ...(area ? { OR: [{ areaId: area.id }, { areaId: null, tableIds: { hasSome: tables.map((t) => t.id) } }] } : {}),
      },
      select: { partySize: true, reservedAt: true, durationMinutes: true, tableIds: true, areaId: true },
    });
    const isToday = businessDate(now, '00:00', branch.timezone) === query.date;
    const sessions = isToday
      ? await this.prisma.tableSession.findMany({
          where: { branchId, status: { in: ['PENDING', 'OPEN', 'BILL_REQUESTED'] } },
          select: { openedAt: true, guestCount: true, tables: { where: { releasedAt: null }, select: { tableId: true, table: { select: { maxSeats: true } } } } },
        })
      : [];

    const slots: AvailabilitySlot[] = [];
    const depositRequired = this.depositFor(settings, { partySize: query.partySize, date: query.date, isVip });
    for (let m = open; m + duration <= close; m += slotMinutes) {
      const hh = Math.floor(m / 60).toString().padStart(2, '0');
      const mm = (m % 60).toString().padStart(2, '0');
      const startsAt = new Date(`${query.date}T${hh}:${mm}:00${VN_OFFSET}`);
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      let occupied = 0;
      const busyRooms = new Set<string>();
      for (const r of reservations) {
        const rEnd = new Date(r.reservedAt.getTime() + r.durationMinutes * 60_000);
        if (r.reservedAt < endsAt && rEnd > startsAt) {
          occupied += r.partySize;
          for (const t of r.tableIds) if (tableIdSet.has(t)) busyRooms.add(t);
        }
      }
      for (const s of sessions) {
        const sEnd = new Date(s.openedAt.getTime() + duration * 60_000);
        const seats = s.tables.filter((t) => tableIdSet.has(t.tableId)).reduce((sum, t) => sum + t.table.maxSeats, 0);
        if (seats > 0 && s.openedAt < endsAt && sEnd > startsAt) {
          occupied += Math.max(s.guestCount, seats);
          for (const t of s.tables) busyRooms.add(t.tableId);
        }
      }
      let available = occupied + query.partySize <= usableSeats;
      let reason: string | undefined;
      if (!available) reason = 'Hết chỗ';
      if (isVip) {
        const freeRooms = rooms.filter((r) => !busyRooms.has(r.id)).length;
        if (freeRooms === 0) {
          available = false;
          reason = 'Hết phòng';
        }
      }
      if (startsAt.getTime() < now.getTime() + leadMinutes * 60_000) {
        available = false;
        reason = 'Đã qua giờ nhận đặt';
      }
      slots.push({ time: `${hh}:${mm}`, startsAt: startsAt.toISOString(), available, remainingSeats: Math.max(0, usableSeats - occupied), reason });
    }
    return {
      date: query.date,
      partySize: query.partySize,
      durationMinutes: duration,
      area: area ? { id: area.id, name: area.name, kind: area.kind } : null,
      capacitySeats,
      slots,
      depositRequired: depositRequired > 0 ? depositRequired : null,
    };
  }

  private openingHoursFor(hours: OpeningHours | null | undefined, isoWeekday: number): { from: string; to: string } {
    return hours?.[String(isoWeekday)] ?? hours?.default ?? { from: '06:00', to: '22:00' };
  }

  private depositFor(settings: ReservationSettings, ctx: { partySize: number; date: string; isVip: boolean }): number {
    const p = settings.depositPolicy;
    if (!p) return 0;
    let amount = 0;
    if (ctx.isVip && p.vipRoomAmount) amount = Math.max(amount, p.vipRoomAmount);
    if (p.minPartySize && ctx.partySize >= p.minPartySize) {
      amount = Math.max(amount, p.fixedAmount ?? 0, (p.amountPerGuest ?? 0) * ctx.partySize);
    }
    if (p.holidayDates?.includes(ctx.date) && p.holidayAmountPerGuest) amount = Math.max(amount, p.holidayAmountPerGuest * ctx.partySize);
    return amount;
  }

  // ───────────────── Tạo và quản lý ─────────────────

  async create(input: CreateReservationInput | PublicReservationInput, actor: { staff?: StaffPrincipal | null; customerId?: string | null }, now = new Date()) {
    if (!input.branchId) throw Errors.invalid('BRANCH_REQUIRED', 'Thiếu cơ sở');
    const branch = await this.loadBranch(input.branchId);
    const settings = branch.settings as ReservationSettings;
    const staffInput = input as CreateReservationInput;
    const isStaff = !!actor.staff;
    const phone = normalizeVnPhone(input.customerPhone);
    if (!phone) throw Errors.invalid('INVALID_PHONE', 'Số điện thoại không hợp lệ');
    const reservedAt = new Date(input.reservedAt);
    if (Number.isNaN(reservedAt.getTime())) throw Errors.invalid('INVALID_TIME', 'Thời gian đặt không hợp lệ');
    const leadMinutes = settings.reservationLeadMinutes ?? 30;
    const maxDays = settings.reservationMaxDaysAhead ?? 60;
    if (!isStaff || !staffInput.force) {
      if (reservedAt.getTime() < now.getTime() + leadMinutes * 60_000) throw Errors.invalid('TOO_SOON', `Vui lòng đặt trước ít nhất ${leadMinutes} phút`);
      if (reservedAt.getTime() > now.getTime() + maxDays * 24 * 3600_000) throw Errors.invalid('TOO_FAR', `Chỉ nhận đặt trước tối đa ${maxDays} ngày`);
    }
    const local = toLocal(reservedAt, branch.timezone);
    const date = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
    const minutes = local.hour * 60 + local.minute;
    const hours = this.openingHoursFor(branch.openingHours as OpeningHours, local.isoWeekday);
    if (!(isStaff && staffInput.force) && (minutes < parseHHmm(hours.from) || minutes > parseHHmm(hours.to) - 30)) {
      throw Errors.invalid('OUT_OF_HOURS', `Cơ sở nhận khách từ ${hours.from} đến ${hours.to}`);
    }
    const area = input.areaId ? await this.prisma.area.findFirst({ where: { id: input.areaId, branchId: branch.id, isActive: true } }) : null;
    if (input.areaId && !area) throw Errors.notFound('khu vực');
    const isVip = area?.kind === 'VIP_ROOM';
    const duration = (isStaff ? staffInput.durationMinutes : undefined) ?? (isVip ? (settings.vipDiningMinutes ?? 150) : branch.defaultDiningMinutes);

    let status: 'PENDING' | 'CONFIRMED' | 'WAITLIST' = 'PENDING';
    if (!(isStaff && staffInput.force)) {
      const avail = await this.availability(branch.id, { date, partySize: input.partySize, areaId: input.areaId, durationMinutes: duration }, now);
      const time = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
      const slot = avail.slots.find((s) => s.time === time) ?? avail.slots.find((s) => s.startsAt <= reservedAt.toISOString() && new Date(s.startsAt).getTime() + (settings.reservationSlotMinutes ?? 15) * 60_000 > reservedAt.getTime());
      if (!slot || !slot.available) {
        if (isStaff && !staffInput.waitlist) throw Errors.conflict('NO_AVAILABILITY', slot?.reason ?? 'Khung giờ này đã hết chỗ', { slot });
        status = 'WAITLIST';
      }
    }
    if (isStaff && staffInput.tableIds?.length) {
      const count = await this.prisma.diningTable.count({ where: { id: { in: staffInput.tableIds }, branchId: branch.id, isActive: true } });
      if (count !== staffInput.tableIds.length) throw Errors.notFound('bàn (hoặc bàn không thuộc cơ sở)');
      await this.assertTablesNotReserved(branch.id, staffInput.tableIds, reservedAt, duration);
    }
    const depositRequired = isStaff && staffInput.depositRequired !== undefined ? staffInput.depositRequired : this.depositFor(settings, { partySize: input.partySize, date, isVip });
    if (status !== 'WAITLIST') {
      const autoConfirm = isStaff ? (staffInput.autoConfirm ?? true) : (settings.reservationAutoConfirm ?? true) && depositRequired === 0;
      status = autoConfirm ? 'CONFIRMED' : 'PENDING';
    }

    const customer = await this.findOrCreateCustomer(branch.orgId, phone, input.customerName, actor.customerId ?? (isStaff ? staffInput.customerId : undefined), (input as PublicReservationInput).marketingConsent);
    const seq = await this.nextSeq(`R:${branch.code}:${date}`);
    const code = documentCode(`R${branch.code.slice(0, 1)}`, date, seq);
    const waitlistPosition = status === 'WAITLIST' ? (await this.prisma.reservation.count({ where: { branchId: branch.id, status: 'WAITLIST', reservedAt: { gte: new Date(`${date}T00:00:00${VN_OFFSET}`), lt: new Date(`${date}T23:59:59${VN_OFFSET}`) } } })) + 1 : null;

    const reservation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reservation.create({
        data: {
          branchId: branch.id,
          code,
          customerId: customer.id,
          customerName: input.customerName.trim(),
          customerPhone: phone,
          partySize: input.partySize,
          reservedAt,
          durationMinutes: duration,
          areaId: area?.id ?? null,
          tableIds: isStaff ? (staffInput.tableIds ?? []) : [],
          status,
          source: input.source,
          occasion: input.occasion ?? null,
          specialRequests: input.specialRequests ?? null,
          depositRequired: depositRequired > 0 ? BigInt(depositRequired) : null,
          depositStatus: depositRequired > 0 ? 'PENDING' : 'NOT_REQUIRED',
          preorderLines: isStaff && staffInput.preorderLines ? (staffInput.preorderLines as Prisma.InputJsonValue) : undefined,
          notes: isStaff ? (staffInput.notes ?? null) : null,
          waitlistPosition,
          confirmedAt: status === 'CONFIRMED' ? now : null,
          createdById: actor.staff?.staffId ?? null,
        },
      });
      await this.outbox.append(tx, {
        type: DomainEvents.reservationCreated,
        aggregateType: 'reservation',
        aggregateId: created.id,
        branchId: branch.id,
        payload: { reservationId: created.id, code, status, customerId: customer.id, reservedAt: reservedAt.toISOString(), partySize: input.partySize, source: input.source },
        actorStaffId: actor.staff?.staffId ?? null,
      });
      return created;
    });
    return this.get(reservation.id);
  }

  async get(id: string) {
    const r = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, code: true, name: true, address: true, phone: true } },
        area: { select: { id: true, name: true, kind: true } },
        customer: { select: { id: true, fullName: true, phone: true, tierId: true, visitCount: true, tags: true, allergies: true, preferences: true, notes: true } },
        session: { select: { id: true, code: true, status: true } },
      },
    });
    if (!r) throw Errors.notFound('đặt bàn');
    const tables = r.tableIds.length ? await this.prisma.diningTable.findMany({ where: { id: { in: r.tableIds } }, select: { id: true, code: true, name: true, areaId: true } }) : [];
    return { ...r, tables };
  }

  async list(branchId: string, query: { date?: string; from?: string; to?: string; status?: string; areaId?: string; search?: string }) {
    const branch = await this.loadBranch(branchId);
    const date = query.date ?? (query.from ? undefined : businessDate(new Date(), '00:00', branch.timezone));
    const from = date ? new Date(`${date}T00:00:00${VN_OFFSET}`) : new Date(`${query.from}T00:00:00${VN_OFFSET}`);
    const to = date ? new Date(from.getTime() + 24 * 3600_000) : new Date(`${query.to ?? query.from}T00:00:00${VN_OFFSET}`);
    if (!date) to.setTime(to.getTime() + 24 * 3600_000);
    const rows = await this.prisma.reservation.findMany({
      where: {
        branchId,
        reservedAt: { gte: from, lt: to },
        ...(query.status ? { status: { in: query.status.split(',') as ('PENDING' | 'CONFIRMED')[] } } : {}),
        ...(query.areaId ? { areaId: query.areaId } : {}),
        ...(query.search ? { OR: [{ customerName: { contains: query.search, mode: 'insensitive' } }, { customerPhone: { contains: query.search.replace(/\D/g, '') } }, { code: { contains: query.search.toUpperCase() } }] } : {}),
      },
      orderBy: { reservedAt: 'asc' },
      include: { area: { select: { id: true, name: true, kind: true } }, customer: { select: { id: true, fullName: true, tierId: true, visitCount: true, tags: true } }, session: { select: { id: true, code: true, status: true } } },
    });
    const tableIds = [...new Set(rows.flatMap((r) => r.tableIds))];
    const tables = tableIds.length ? await this.prisma.diningTable.findMany({ where: { id: { in: tableIds } }, select: { id: true, code: true, name: true } }) : [];
    const tableMap = new Map(tables.map((t) => [t.id, t]));
    const now = Date.now();
    return rows.map((r) => ({ ...r, tables: r.tableIds.map((id) => tableMap.get(id)).filter(Boolean), isUpcoming: r.status === 'CONFIRMED' && r.reservedAt.getTime() - now <= 2 * 3600_000 && r.reservedAt.getTime() >= now - 30 * 60_000, isLate: r.status === 'CONFIRMED' && r.reservedAt.getTime() < now - 15 * 60_000 }));
  }

  async update(id: string, input: UpdateReservationInput, staff: StaffPrincipal) {
    const r = await this.mustGet(id);
    if (['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status)) throw Errors.state('Đặt bàn đã kết thúc');
    const data: Prisma.ReservationUncheckedUpdateInput = {};
    if (input.customerName !== undefined) data.customerName = input.customerName;
    if (input.customerPhone !== undefined) {
      const phone = normalizeVnPhone(input.customerPhone);
      if (!phone) throw Errors.invalid('INVALID_PHONE', 'Số điện thoại không hợp lệ');
      data.customerPhone = phone;
    }
    if (input.partySize !== undefined) data.partySize = input.partySize;
    if (input.reservedAt !== undefined) data.reservedAt = new Date(input.reservedAt);
    if (input.durationMinutes !== undefined) data.durationMinutes = input.durationMinutes;
    if (input.areaId !== undefined) data.areaId = input.areaId;
    if (input.tableIds !== undefined) {
      if (input.tableIds.length) {
        const count = await this.prisma.diningTable.count({ where: { id: { in: input.tableIds }, branchId: r.branchId, isActive: true } });
        if (count !== input.tableIds.length) throw Errors.notFound('bàn');
      }
      data.tableIds = input.tableIds;
    }
    if (input.occasion !== undefined) data.occasion = input.occasion;
    if (input.specialRequests !== undefined) data.specialRequests = input.specialRequests;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.depositRequired !== undefined) {
      data.depositRequired = input.depositRequired === null || input.depositRequired === 0 ? null : BigInt(input.depositRequired);
      if (!input.depositRequired) data.depositStatus = 'NOT_REQUIRED';
      else if (r.depositStatus === 'NOT_REQUIRED') data.depositStatus = 'PENDING';
    }
    if (input.preorderLines !== undefined) data.preorderLines = input.preorderLines === null ? Prisma.DbNull : (input.preorderLines as Prisma.InputJsonValue);
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({ where: { id }, data });
      await tx.auditLog.create({ data: { branchId: r.branchId, actorStaffId: staff.staffId, action: 'reservation.update', entityType: 'Reservation', entityId: id, after: input as Prisma.InputJsonValue } });
      await this.outbox.append(tx, { type: DomainEvents.reservationUpdated, aggregateType: 'reservation', aggregateId: id, branchId: r.branchId, payload: { reservationId: id, status: r.status, fields: Object.keys(input), notify: false }, actorStaffId: staff.staffId });
    });
    return this.get(id);
  }

  async confirm(id: string, staff: StaffPrincipal) {
    const r = await this.mustGet(id);
    assertTransition('Đặt bàn', RESERVATION_TRANSITIONS, r.status, 'CONFIRMED');
    await this.transition(r, 'CONFIRMED', { confirmedAt: new Date(), waitlistPosition: null }, staff.staffId);
    return this.get(id);
  }

  async cancel(id: string, reason: string | undefined, actor: { staffId?: string | null; byCustomer?: boolean }) {
    const r = await this.mustGet(id);
    assertTransition('Đặt bàn', RESERVATION_TRANSITIONS, r.status, 'CANCELLED');
    const settings = (await this.loadBranch(r.branchId)).settings as ReservationSettings;
    const cancelBefore = settings.cancelBeforeMinutes ?? 120;
    const late = r.reservedAt.getTime() - Date.now() < cancelBefore * 60_000;
    let depositStatus = r.depositStatus;
    if (r.depositStatus === 'PAID') depositStatus = actor.byCustomer && late ? 'FORFEITED' : 'REFUNDED';
    await this.transition(r, 'CANCELLED', { cancelledAt: new Date(), cancelReason: reason ?? (actor.byCustomer ? 'Khách hủy' : 'Nhà hàng hủy'), depositStatus }, actor.staffId ?? null);
    return this.get(id);
  }

  async noShow(id: string, staff: StaffPrincipal) {
    const r = await this.mustGet(id);
    assertTransition('Đặt bàn', RESERVATION_TRANSITIONS, r.status, 'NO_SHOW');
    await this.transition(r, 'NO_SHOW', { depositStatus: r.depositStatus === 'PAID' ? 'FORFEITED' : r.depositStatus }, staff.staffId);
    return this.get(id);
  }

  /** Ghi nhận tiền cọc đã thu tại quầy; đủ mức yêu cầu thì chuyển PAID và tự xác nhận đặt bàn đang chờ. */
  async recordDeposit(id: string, input: RecordDepositInput, staff: StaffPrincipal) {
    const r = await this.mustGet(id);
    if (['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status)) throw Errors.state('Đặt bàn đã kết thúc, không thu cọc được');
    const paid = Number(r.depositPaid) + input.amount;
    const required = Number(r.depositRequired ?? 0);
    const depositStatus = paid >= required ? 'PAID' : 'PENDING';
    const confirm = depositStatus === 'PAID' && r.status === 'PENDING';
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id },
        data: { depositPaid: BigInt(paid), depositStatus, ...(confirm ? { status: 'CONFIRMED', confirmedAt: new Date() } : {}) },
      });
      await tx.auditLog.create({
        data: { branchId: r.branchId, actorStaffId: staff.staffId, action: 'reservation.deposit', entityType: 'Reservation', entityId: id, after: { amount: input.amount, method: input.method, externalRef: input.externalRef ?? null, note: input.note ?? null, paid, required } },
      });
      await this.outbox.append(tx, { type: DomainEvents.reservationUpdated, aggregateType: 'reservation', aggregateId: id, branchId: r.branchId, payload: { reservationId: id, depositStatus, depositPaid: paid, status: confirm ? 'CONFIRMED' : r.status }, actorStaffId: staff.staffId });
    });
    return this.get(id);
  }

  async assignTables(id: string, tableIds: string[], staff: StaffPrincipal) {
    const r = await this.mustGet(id);
    if (!['PENDING', 'CONFIRMED', 'WAITLIST'].includes(r.status)) throw Errors.state('Chỉ xếp bàn cho đặt bàn chưa vào bàn');
    const tables = await this.prisma.diningTable.findMany({ where: { id: { in: tableIds }, branchId: r.branchId, isActive: true } });
    if (tables.length !== tableIds.length) throw Errors.notFound('bàn');
    await this.assertTablesNotReserved(r.branchId, tableIds, r.reservedAt, r.durationMinutes, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({ where: { id }, data: { tableIds } });
      await this.outbox.append(tx, { type: DomainEvents.reservationUpdated, aggregateType: 'reservation', aggregateId: id, branchId: r.branchId, payload: { reservationId: id, status: r.status, tableIds, notify: false }, actorStaffId: staff.staffId });
    });
    return this.get(id);
  }

  /** Đón khách: mở phiên bàn từ đặt bàn (và gửi món đặt trước nếu có). */
  async checkIn(id: string, input: { tableIds?: string[]; guestCount?: number }, staff: StaffPrincipal) {
    const r = await this.mustGet(id);
    if (!['PENDING', 'CONFIRMED', 'WAITLIST'].includes(r.status)) throw Errors.state(`Đặt bàn đang ở trạng thái ${r.status}`);
    const tableIds = input.tableIds?.length ? input.tableIds : r.tableIds;
    if (!tableIds.length) throw Errors.invalid('TABLES_REQUIRED', 'Chọn bàn để đón khách');
    const session = await this.dining.openSession(
      r.branchId,
      { tableIds, guestCount: input.guestCount ?? r.partySize, source: 'RESERVATION', customerId: r.customerId ?? undefined, reservationId: r.id, notes: [r.occasion, r.specialRequests].filter(Boolean).join(' – ') || undefined },
      { staffId: staff.staffId },
    );
    await this.prisma.reservation.update({ where: { id }, data: { tableIds } });
    const preorder = r.preorderLines as { itemId: string; quantity: number; note?: string }[] | null;
    if (preorder?.length) {
      try {
        await this.dining.createOrder(session.id, { lines: preorder.map((l) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, modifiers: [], course: 1 })), send: true }, { staffId: staff.staffId }, { source: 'PREORDER', staff });
      } catch (err) {
        this.logger.warn(`Không gửi được món đặt trước của ${r.code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await this.outbox.append(this.prisma, { type: DomainEvents.reservationUpdated, aggregateType: 'reservation', aggregateId: id, branchId: r.branchId, payload: { reservationId: id, status: 'SEATED', sessionId: session.id, notify: false }, actorStaffId: staff.staffId });
    return { reservation: await this.get(id), session };
  }

  async lookup(code: string, phoneInput: string) {
    const phone = normalizeVnPhone(phoneInput);
    if (!phone) throw Errors.invalid('INVALID_PHONE', 'Số điện thoại không hợp lệ');
    const r = await this.prisma.reservation.findFirst({ where: { code: code.toUpperCase(), customerPhone: phone }, include: { branch: { select: { name: true, address: true, phone: true } }, area: { select: { name: true } } } });
    if (!r) throw Errors.notFound('đặt bàn với mã và số điện thoại này');
    return this.publicView(r);
  }

  async forCustomer(customerId: string) {
    const rows = await this.prisma.reservation.findMany({ where: { customerId }, orderBy: { reservedAt: 'desc' }, take: 50, include: { branch: { select: { name: true, address: true, phone: true } }, area: { select: { name: true } } } });
    return rows.map((r) => this.publicView(r));
  }

  publicView(r: { id: string; code: string; status: string; reservedAt: Date; durationMinutes: number; partySize: number; customerName: string; occasion: string | null; specialRequests: string | null; depositRequired: bigint | null; depositStatus: string; waitlistPosition: number | null; branch: { name: string; address: string | null; phone: string | null }; area: { name: string } | null }) {
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      reservedAt: r.reservedAt,
      durationMinutes: r.durationMinutes,
      partySize: r.partySize,
      customerName: r.customerName,
      occasion: r.occasion,
      specialRequests: r.specialRequests,
      depositRequired: r.depositRequired === null ? null : Number(r.depositRequired),
      depositStatus: r.depositStatus,
      waitlistPosition: r.waitlistPosition,
      branch: r.branch,
      area: r.area?.name ?? null,
    };
  }

  // ───────────────── Nhắc lịch ─────────────────

  async reminderTick(now = new Date()): Promise<{ reminded: number; noShows: number }> {
    const locked = await this.redis.set('dalan:reservations:reminder', '1', 'PX', 4 * 60_000, 'NX').catch(() => null);
    if (locked !== 'OK') return { reminded: 0, noShows: 0 };
    let reminded = 0;
    let noShows = 0;
    try {
      const upcoming = await this.prisma.reservation.findMany({
        where: { status: 'CONFIRMED', reservedAt: { gt: now, lte: new Date(now.getTime() + 24 * 3600_000) } },
        include: { branch: { select: { name: true, address: true, phone: true, settings: true } } },
      });
      for (const r of upcoming) {
        const sent = (r.remindersSent as string[]) ?? [];
        const hoursLeft = (r.reservedAt.getTime() - now.getTime()) / 3600_000;
        const key = hoursLeft <= 2 ? '2h' : '24h';
        if (sent.includes(key)) continue;
        if (key === '24h' && hoursLeft > 24) continue;
        await this.messaging.notify({
          templateCode: key === '2h' ? NotificationTemplates.reservationReminder2h : NotificationTemplates.reservationReminder24h,
          recipient: r.customerPhone,
          customerId: r.customerId,
          refType: 'Reservation',
          refId: r.id,
          params: { name: r.customerName, code: r.code, branch: r.branch.name, time: formatVnDateTime(r.reservedAt), party: String(r.partySize), phone: r.branch.phone ?? '' },
          fallbackText: `Da Lan ${r.branch.name} nhac ban: dat ban ${r.code} luc ${formatVnDateTime(r.reservedAt)} cho ${r.partySize} khach.`,
        });
        await this.prisma.reservation.update({ where: { id: r.id }, data: { remindersSent: [...sent.filter((s) => s !== key), key] } });
        reminded++;
      }
      const branches = await this.prisma.branch.findMany({ where: { isActive: true }, select: { id: true, settings: true } });
      for (const b of branches) {
        const minutes = (b.settings as ReservationSettings).autoNoShowMinutes;
        if (!minutes) continue;
        const late = await this.prisma.reservation.findMany({ where: { branchId: b.id, status: 'CONFIRMED', reservedAt: { lt: new Date(now.getTime() - minutes * 60_000) } } });
        for (const r of late) {
          await this.transition(r, 'NO_SHOW', { depositStatus: r.depositStatus === 'PAID' ? 'FORFEITED' : r.depositStatus }, null);
          noShows++;
        }
      }
    } catch (err) {
      this.logger.error('Nhắc lịch lỗi', err instanceof Error ? err.stack : String(err));
    } finally {
      await this.redis.del('dalan:reservations:reminder').catch(() => undefined);
    }
    return { reminded, noShows };
  }

  // ───────────────── Tiện ích ─────────────────

  private async transition(r: { id: string; branchId: string; status: string }, status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW', data: Prisma.ReservationUncheckedUpdateInput, actorStaffId: string | null) {
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({ where: { id: r.id }, data: { ...data, status } });
      await tx.auditLog.create({ data: { branchId: r.branchId, actorStaffId, action: `reservation.${status.toLowerCase()}`, entityType: 'Reservation', entityId: r.id, before: { status: r.status }, after: { status } } });
      await this.outbox.append(tx, { type: DomainEvents.reservationUpdated, aggregateType: 'reservation', aggregateId: r.id, branchId: r.branchId, payload: { reservationId: r.id, status, previous: r.status }, actorStaffId });
    });
  }

  private async findOrCreateCustomer(orgId: string, phone: string, fullName: string, customerId?: string | null, marketingConsent?: boolean) {
    if (customerId) {
      const c = await this.prisma.customer.findFirst({ where: { id: customerId, orgId, deletedAt: null } });
      if (c) return c;
    }
    const existing = await this.prisma.customer.findUnique({ where: { orgId_phone: { orgId, phone } } });
    if (existing) {
      if (!existing.fullName && fullName) await this.prisma.customer.update({ where: { id: existing.id }, data: { fullName } });
      if (marketingConsent && !existing.marketingConsent) await this.prisma.customer.update({ where: { id: existing.id }, data: { marketingConsent: true, consentAt: new Date() } });
      return existing;
    }
    return this.prisma.customer.create({ data: { orgId, phone, fullName: fullName || null, source: 'reservation', marketingConsent: marketingConsent ?? false, consentAt: marketingConsent ? new Date() : null } });
  }

  /** Bàn không được trùng với đặt bàn khác (chưa kết thúc) có khung giờ chồng lấn. */
  private async assertTablesNotReserved(branchId: string, tableIds: string[], reservedAt: Date, durationMinutes: number, excludeId?: string) {
    const end = new Date(reservedAt.getTime() + durationMinutes * 60_000);
    const conflicts = await this.prisma.reservation.findMany({
      where: { branchId, ...(excludeId ? { id: { not: excludeId } } : {}), status: { in: ['PENDING', 'CONFIRMED', 'SEATED'] }, tableIds: { hasSome: tableIds }, reservedAt: { lt: end, gte: new Date(reservedAt.getTime() - 12 * 3600_000) } },
      select: { code: true, reservedAt: true, durationMinutes: true },
    });
    const real = conflicts.filter((c) => new Date(c.reservedAt.getTime() + c.durationMinutes * 60_000) > reservedAt);
    if (real.length) throw Errors.conflict('TABLE_RESERVED', `Bàn đã được xếp cho đặt bàn ${real[0]!.code}`, { conflicts: real.map((c) => c.code) });
  }

  private async mustGet(id: string) {
    const r = await this.prisma.reservation.findUnique({ where: { id } });
    if (!r) throw Errors.notFound('đặt bàn');
    return r;
  }

  private async loadBranch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || !branch.isActive) throw Errors.notFound('cơ sở');
    return branch;
  }

  private async nextSeq(key: string): Promise<number> {
    const full = `seq:${key}`;
    const n = await this.redis.incr(full);
    if (n === 1) await this.redis.expire(full, 3 * 24 * 3600);
    return n;
  }
}
