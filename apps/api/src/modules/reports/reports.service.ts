import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@dalan/db';
import { businessDate, toLocal } from '@dalan/domain';
import { DomainEvents, type RealtimeReport, type SalesGroupBy, type SalesQuery, type SalesRow } from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { canAccessBranch, hasPermission, type StaffPrincipal } from '../../common/auth/principal.js';
import { OutboxService, type PublishedEvent } from '../outbox/outbox.service.js';

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const vnStart = (s: string) => new Date(`${s}T00:00:00+07:00`);
const vnEnd = (s: string) => new Date(vnStart(s).getTime() + 86_400_000);
const WEEKDAY_LABELS = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

interface Bucket {
  key: string;
  label: string;
  revenue: number;
  bills: Set<string>;
  guests: number;
  discounts: number;
}

@Injectable()
export class ReportsService implements OnModuleInit {
  private readonly logger = new Logger('Reports');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  onModuleInit(): void {
    this.outbox.on(DomainEvents.billPaid, (e) => this.onBillPaid(e));
    this.outbox.on(DomainEvents.paymentRefunded, (e) => this.onPaymentRefunded(e));
  }

  // ───────────────── Tổng hợp theo giờ từ outbox ─────────────────

  private async onBillPaid(e: PublishedEvent): Promise<void> {
    const billId = (e.payload as { billId?: string }).billId;
    if (!billId) return;
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { session: { select: { id: true, businessDate: true, guestCount: true } }, lines: { include: { orderLine: { select: { item: { select: { category: { select: { name: true } } } } } } } }, payments: { where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } } },
    });
    if (!bill || bill.status !== 'PAID') return;
    const hour = toLocal(bill.closedAt ?? new Date()).hour;
    const paidBillsInSession = await this.prisma.bill.count({ where: { sessionId: bill.sessionId, status: 'PAID' } });
    const byMethod: Record<string, number> = {};
    for (const p of bill.payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
    const byCategory: Record<string, number> = {};
    for (const l of bill.lines) {
      const cat = l.orderLine.item?.category.name ?? 'Khác';
      byCategory[cat] = (byCategory[cat] ?? 0) + Number(l.amount) - Number(l.discountAmount);
    }
    await this.bump(bill.branchId, bill.session.businessDate, hour, {
      revenue: Number(bill.total),
      bills: 1,
      guests: paidBillsInSession === 1 ? bill.session.guestCount : 0,
      sessions: paidBillsInSession === 1 ? 1 : 0,
      discounts: Number(bill.billDiscountTotal) + Number(bill.lineDiscountTotal),
      byMethod,
      byCategory,
    });
  }

  private async onPaymentRefunded(e: PublishedEvent): Promise<void> {
    const p = e.payload as { billId?: string; amount?: number };
    if (!p.billId || !p.amount) return;
    const bill = await this.prisma.bill.findUnique({ where: { id: p.billId }, include: { session: { select: { businessDate: true } } } });
    if (!bill) return;
    const hour = toLocal(bill.closedAt ?? new Date()).hour;
    await this.bump(bill.branchId, bill.session.businessDate, hour, { revenue: -p.amount, bills: 0, guests: 0, sessions: 0, discounts: 0, byMethod: {}, byCategory: {} });
  }

  private async bump(branchId: string, businessDateValue: Date, hour: number, d: { revenue: number; bills: number; guests: number; sessions: number; discounts: number; byMethod: Record<string, number>; byCategory: Record<string, number> }) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.dailySalesSummary.findFirst({ where: { branchId, businessDate: businessDateValue, hour } });
      const mergeJson = (base: unknown, add: Record<string, number>) => {
        const out = { ...((base as Record<string, number>) ?? {}) };
        for (const [k, v] of Object.entries(add)) out[k] = (out[k] ?? 0) + v;
        return out as Prisma.InputJsonValue;
      };
      if (existing) {
        await tx.dailySalesSummary.update({
          where: { id: existing.id },
          data: { revenue: { increment: BigInt(d.revenue) }, bills: { increment: d.bills }, guests: { increment: d.guests }, sessions: { increment: d.sessions }, discounts: { increment: BigInt(d.discounts) }, byMethod: mergeJson(existing.byMethod, d.byMethod), byCategory: mergeJson(existing.byCategory, d.byCategory) },
        });
      } else {
        await tx.dailySalesSummary.create({ data: { branchId, businessDate: businessDateValue, hour, revenue: BigInt(d.revenue), bills: d.bills, guests: d.guests, sessions: d.sessions, discounts: BigInt(d.discounts), byMethod: d.byMethod, byCategory: d.byCategory } });
      }
    });
  }

  /** Bảo trì: dựng lại tổng hợp theo giờ của một ngày kinh doanh từ các bill đã thanh toán. */
  async rebuildDay(staff: StaffPrincipal, branchId: string, date: string) {
    if (!canAccessBranch(staff, branchId)) throw Errors.forbidden('Bạn không thuộc cơ sở này');
    const day = asDate(date);
    await this.prisma.dailySalesSummary.deleteMany({ where: { branchId, businessDate: day } });
    const bills = await this.prisma.bill.findMany({ where: { branchId, status: 'PAID', session: { businessDate: day } }, select: { id: true }, orderBy: { closedAt: 'asc' } });
    for (const b of bills) await this.onBillPaid({ id: '', seq: 0, type: DomainEvents.billPaid, aggregateType: 'session', aggregateId: '', branchId, payload: { billId: b.id }, occurredAt: new Date().toISOString() });
    const refunds = await this.prisma.refund.findMany({ where: { status: 'SUCCEEDED', payment: { branchId, bill: { session: { businessDate: day } } } }, select: { amount: true, payment: { select: { billId: true } } } });
    for (const r of refunds) await this.onPaymentRefunded({ id: '', seq: 0, type: DomainEvents.paymentRefunded, aggregateType: 'session', aggregateId: '', branchId, payload: { billId: r.payment.billId, amount: Number(r.amount) }, occurredAt: new Date().toISOString() });
    return { branchId, date, bills: bills.length, refunds: refunds.length };
  }

  // ───────────────── Phạm vi cơ sở ─────────────────

  private async resolveBranchIds(staff: StaffPrincipal, branchId?: string): Promise<string[]> {
    if (branchId) {
      if (!canAccessBranch(staff, branchId)) throw Errors.forbidden('Bạn không thuộc cơ sở này');
      return [branchId];
    }
    if (hasPermission(staff.permissions, 'report.all')) {
      const all = await this.prisma.branch.findMany({ where: { orgId: staff.orgId, isActive: true }, select: { id: true } });
      return all.map((b) => b.id);
    }
    if (staff.branchIds.length === 0) throw Errors.forbidden('Không có cơ sở nào để xem báo cáo');
    return staff.branchIds;
  }

  // ───────────────── Thời gian thực ─────────────────

  async realtime(staff: StaffPrincipal, branchId?: string): Promise<RealtimeReport> {
    const branchIds = await this.resolveBranchIds(staff, branchId);
    const branch = await this.prisma.branch.findFirst({ where: { id: { in: branchIds } }, select: { businessDayCutoff: true, timezone: true, settings: true } });
    const now = new Date();
    const today = businessDate(now, branch?.businessDayCutoff ?? '04:00', branch?.timezone ?? 'Asia/Ho_Chi_Minh');
    const lastWeek = dateOnly(new Date(asDate(today).getTime() - 7 * 86_400_000));
    const lateMinutes = Number((branch?.settings as { kdsLateMinutes?: number } | null)?.kdsLateMinutes ?? 20);
    const [todayRows, lastWeekRows, openSessions, overdueTickets, openServiceRequests, upcomingReservations, eventsToday] = await Promise.all([
      this.prisma.dailySalesSummary.findMany({ where: { branchId: { in: branchIds }, businessDate: asDate(today) } }),
      this.prisma.dailySalesSummary.aggregate({ where: { branchId: { in: branchIds }, businessDate: asDate(lastWeek) }, _sum: { revenue: true } }),
      this.prisma.tableSession.findMany({ where: { branchId: { in: branchIds }, status: { in: ['PENDING', 'OPEN', 'BILL_REQUESTED'] } }, select: { guestCount: true } }),
      this.prisma.kitchenTicket.count({ where: { branchId: { in: branchIds }, status: { in: ['NEW', 'IN_PROGRESS'] }, firedAt: { lt: new Date(now.getTime() - lateMinutes * 60_000) } } }),
      this.prisma.serviceRequest.count({ where: { branchId: { in: branchIds }, status: { in: ['OPEN', 'ACKED'] } } }),
      this.prisma.reservation.count({ where: { branchId: { in: branchIds }, status: { in: ['PENDING', 'CONFIRMED'] }, reservedAt: { gte: now, lte: new Date(now.getTime() + 2 * 3600_000) } } }),
      this.prisma.eventBooking.count({ where: { branchId: { in: branchIds }, eventDate: asDate(dateOnly(new Date(now.getTime() + 7 * 3600_000))), status: { notIn: ['CANCELLED', 'CLOSED'] } } }),
    ]);
    const todayRevenue = todayRows.reduce((s, r) => s + Number(r.revenue), 0);
    const lastWeekRevenue = Number(lastWeekRows._sum.revenue ?? 0);
    const byMethod: Record<string, number> = {};
    const hourly = new Map<number, { hour: number; revenue: number; bills: number }>();
    for (const r of todayRows) {
      for (const [k, v] of Object.entries((r.byMethod as Record<string, number>) ?? {})) byMethod[k] = (byMethod[k] ?? 0) + v;
      const h = r.hour ?? 0;
      const entry = hourly.get(h) ?? { hour: h, revenue: 0, bills: 0 };
      entry.revenue += Number(r.revenue);
      entry.bills += r.bills;
      hourly.set(h, entry);
    }
    return {
      branchIds,
      businessDate: today,
      todayRevenue,
      lastWeekSameDayRevenue: lastWeekRevenue,
      changePct: lastWeekRevenue > 0 ? Math.round(((todayRevenue - lastWeekRevenue) / lastWeekRevenue) * 100) : null,
      todayBills: todayRows.reduce((s, r) => s + r.bills, 0),
      todayGuests: todayRows.reduce((s, r) => s + r.guests, 0),
      openSessions: openSessions.length,
      seatedGuests: openSessions.reduce((s, x) => s + x.guestCount, 0),
      overdueTickets,
      openServiceRequests,
      upcomingReservations,
      eventsToday,
      hourly: [...hourly.values()].sort((a, b) => a.hour - b.hour),
      byMethod,
    };
  }

  // ───────────────── Doanh thu ─────────────────

  async sales(staff: StaffPrincipal, q: SalesQuery): Promise<{ groupBy: SalesGroupBy; from: string; to: string; rows: SalesRow[]; total: SalesRow }> {
    const branchIds = await this.resolveBranchIds(staff, q.branchId);
    const bills = await this.prisma.bill.findMany({
      where: { branchId: { in: branchIds }, status: 'PAID', session: { businessDate: { gte: asDate(q.from), lte: asDate(q.to) } } },
      include: {
        session: { select: { businessDate: true, guestCount: true, source: true, serverId: true } },
        lines: { include: { orderLine: { select: { nameSnapshot: true, quantity: true, item: { select: { category: { select: { name: true } } } } } } } },
        payments: { where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, select: { method: true, amount: true } },
      },
    });
    const [branches, staffRows] = await Promise.all([
      this.prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } }),
      q.groupBy === 'staff' ? this.prisma.staff.findMany({ where: { id: { in: [...new Set(bills.map((b) => b.closedById ?? b.session.serverId).filter((x): x is string => !!x))] } }, select: { id: true, fullName: true } }) : Promise.resolve([]),
    ]);
    const buckets = new Map<string, Bucket>();
    const add = (key: string, label: string, billId: string, revenue: number, guests: number, discounts: number) => {
      const b = buckets.get(key) ?? { key, label, revenue: 0, bills: new Set<string>(), guests: 0, discounts: 0 };
      const first = !b.bills.has(billId);
      b.revenue += revenue;
      b.bills.add(billId);
      if (first) {
        b.guests += guests;
        b.discounts += discounts;
      }
      buckets.set(key, b);
    };
    for (const bill of bills) {
      const total = Number(bill.total);
      const guests = bill.session.guestCount;
      const discounts = Number(bill.billDiscountTotal) + Number(bill.lineDiscountTotal);
      switch (q.groupBy) {
        case 'day': {
          const d = dateOnly(bill.session.businessDate);
          add(d, d, bill.id, total, guests, discounts);
          break;
        }
        case 'hour': {
          const h = toLocal(bill.closedAt ?? bill.createdAt).hour;
          add(String(h).padStart(2, '0'), `${String(h).padStart(2, '0')}:00`, bill.id, total, guests, discounts);
          break;
        }
        case 'weekday': {
          const wd = toLocal(bill.session.businessDate).isoWeekday;
          add(String(wd), WEEKDAY_LABELS[wd] ?? String(wd), bill.id, total, guests, discounts);
          break;
        }
        case 'branch': {
          const name = branches.find((b) => b.id === bill.branchId)?.name ?? bill.branchId;
          add(bill.branchId, name, bill.id, total, guests, discounts);
          break;
        }
        case 'source': {
          add(bill.session.source, bill.session.source, bill.id, total, guests, discounts);
          break;
        }
        case 'staff': {
          const id = bill.closedById ?? bill.session.serverId ?? 'unknown';
          add(id, staffRows.find((s) => s.id === id)?.fullName ?? 'Không rõ', bill.id, total, guests, discounts);
          break;
        }
        case 'method': {
          for (const p of bill.payments) add(p.method, p.method, bill.id, Number(p.amount), guests, discounts);
          break;
        }
        case 'category': {
          for (const l of bill.lines) {
            const cat = l.orderLine.item?.category.name ?? 'Khác';
            add(cat, cat, bill.id, Number(l.amount) - Number(l.discountAmount), guests, discounts);
          }
          break;
        }
        case 'item': {
          for (const l of bill.lines) add(l.orderLine.nameSnapshot, l.orderLine.nameSnapshot, bill.id, Number(l.amount) - Number(l.discountAmount), guests, discounts);
          break;
        }
      }
    }
    const rows: SalesRow[] = [...buckets.values()]
      .map((b) => ({ key: b.key, label: b.label, revenue: b.revenue, bills: b.bills.size, guests: b.guests, discounts: b.discounts, avgBill: b.bills.size ? Math.round(b.revenue / b.bills.size) : 0 }))
      .sort((a, b) => (['day', 'hour', 'weekday'].includes(q.groupBy) ? a.key.localeCompare(b.key) : b.revenue - a.revenue));
    const totalRevenue = bills.reduce((s, b) => s + Number(b.total), 0);
    const total: SalesRow = { key: 'total', label: 'Tổng', revenue: totalRevenue, bills: bills.length, guests: bills.reduce((s, b) => s + b.session.guestCount, 0), discounts: bills.reduce((s, b) => s + Number(b.billDiscountTotal) + Number(b.lineDiscountTotal), 0), avgBill: bills.length ? Math.round(totalRevenue / bills.length) : 0 };
    return { groupBy: q.groupBy, from: q.from, to: q.to, rows, total };
  }

  // ───────────────── Bếp ─────────────────

  async kitchen(staff: StaffPrincipal, q: { branchId?: string; from: string; to: string }) {
    const branchIds = await this.resolveBranchIds(staff, q.branchId);
    const range = { gte: vnStart(q.from), lt: vnEnd(q.to) };
    const tickets = await this.prisma.kitchenTicket.findMany({ where: { branchId: { in: branchIds }, status: 'DONE', bumpedAt: { not: null }, firedAt: range }, select: { stationCode: true, firedAt: true, startedAt: true, bumpedAt: true } });
    const byStation = new Map<string, number[]>();
    for (const t of tickets) {
      const mins = (t.bumpedAt!.getTime() - t.firedAt.getTime()) / 60_000;
      byStation.set(t.stationCode, [...(byStation.get(t.stationCode) ?? []), mins]);
    }
    const stations = [...byStation.entries()].map(([stationCode, arr]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return { stationCode, tickets: arr.length, avgMinutes: round1(arr.reduce((s, v) => s + v, 0) / arr.length), p90Minutes: round1(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] ?? 0), maxMinutes: round1(sorted.at(-1) ?? 0) };
    });
    const lines = await this.prisma.orderLine.findMany({ where: { branchId: { in: branchIds }, sentAt: range, readyAt: { not: null } }, select: { nameSnapshot: true, stationCode: true, sentAt: true, readyAt: true, quantity: true } });
    const byItem = new Map<string, { name: string; stationCode: string | null; count: number; total: number }>();
    for (const l of lines) {
      const e = byItem.get(l.nameSnapshot) ?? { name: l.nameSnapshot, stationCode: l.stationCode, count: 0, total: 0 };
      e.count += 1;
      e.total += (l.readyAt!.getTime() - l.sentAt!.getTime()) / 60_000;
      byItem.set(l.nameSnapshot, e);
    }
    const items = [...byItem.values()].map((e) => ({ name: e.name, stationCode: e.stationCode, count: e.count, avgMinutes: round1(e.total / e.count) })).sort((a, b) => b.avgMinutes - a.avgMinutes);
    return { from: q.from, to: q.to, stations: stations.sort((a, b) => b.avgMinutes - a.avgMinutes), slowestItems: items.slice(0, 20), ticketCount: tickets.length };
  }

  // ───────────────── Giảm giá và hủy món ─────────────────

  async discountsVoids(staff: StaffPrincipal, q: { branchId?: string; from: string; to: string }) {
    const branchIds = await this.resolveBranchIds(staff, q.branchId);
    const range = { gte: vnStart(q.from), lt: vnEnd(q.to) };
    const [discounts, voids] = await Promise.all([
      this.prisma.billDiscount.findMany({ where: { createdAt: range, bill: { branchId: { in: branchIds }, status: { not: 'VOID' } } }, select: { kind: true, amount: true, reason: true, appliedById: true, approvedById: true } }),
      this.prisma.orderLine.findMany({ where: { branchId: { in: branchIds }, status: 'VOIDED', voidedAt: range }, select: { nameSnapshot: true, lineTotal: true, voidReason: true, voidedById: true, voidApprovedById: true, wasteOnVoid: true } }),
    ]);
    const staffIds = [...new Set([...discounts.map((d) => d.appliedById), ...voids.map((v) => v.voidedById)].filter((x): x is string => !!x))];
    const staffRows = staffIds.length ? await this.prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } }) : [];
    const nameOf = (id: string | null) => staffRows.find((s) => s.id === id)?.fullName ?? 'Không rõ';
    const group = <T>(rows: T[], keyFn: (r: T) => string, amountFn: (r: T) => number) => {
      const m = new Map<string, { key: string; count: number; amount: number }>();
      for (const r of rows) {
        const k = keyFn(r);
        const e = m.get(k) ?? { key: k, count: 0, amount: 0 };
        e.count += 1;
        e.amount += amountFn(r);
        m.set(k, e);
      }
      return [...m.values()].sort((a, b) => b.amount - a.amount);
    };
    return {
      from: q.from,
      to: q.to,
      discounts: { total: discounts.reduce((s, d) => s + Number(d.amount), 0), count: discounts.length, byKind: group(discounts, (d) => d.kind, (d) => Number(d.amount)), byStaff: group(discounts, (d) => nameOf(d.appliedById), (d) => Number(d.amount)) },
      voids: { total: voids.reduce((s, v) => s + Number(v.lineTotal), 0), count: voids.length, wasted: voids.filter((v) => v.wasteOnVoid).reduce((s, v) => s + Number(v.lineTotal), 0), byReason: group(voids, (v) => (v.voidReason ?? 'OTHER').split(':')[0] ?? 'OTHER', (v) => Number(v.lineTotal)), byStaff: group(voids, (v) => nameOf(v.voidedById), (v) => Number(v.lineTotal)), byItem: group(voids, (v) => v.nameSnapshot, (v) => Number(v.lineTotal)).slice(0, 20) },
    };
  }

  // ───────────────── Ca ─────────────────

  async shifts(staff: StaffPrincipal, q: { branchId?: string; from: string; to: string }) {
    const branchIds = await this.resolveBranchIds(staff, q.branchId);
    const shifts = await this.prisma.shift.findMany({ where: { branchId: { in: branchIds }, openedAt: { gte: vnStart(q.from), lt: vnEnd(q.to) } }, orderBy: { openedAt: 'desc' }, include: { branch: { select: { name: true } }, _count: { select: { bills: true, payments: true } } } });
    const staffIds = [...new Set(shifts.flatMap((s) => [s.openedById, s.closedById]).filter((x): x is string => !!x))];
    const staffRows = staffIds.length ? await this.prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } }) : [];
    const nameOf = (id: string | null) => staffRows.find((s) => s.id === id)?.fullName ?? null;
    return shifts.map((s) => ({ id: s.id, branch: s.branch.name, status: s.status, openedAt: s.openedAt, closedAt: s.closedAt, openedBy: nameOf(s.openedById), closedBy: nameOf(s.closedById), openingCash: Number(s.openingCash), expectedCash: s.expectedCash === null ? null : Number(s.expectedCash), closingCashCounted: s.closingCashCounted === null ? null : Number(s.closingCashCounted), variance: s.variance === null ? null : Number(s.variance), bills: s._count.bills, payments: s._count.payments, notes: s.notes }));
  }

  // ───────────────── Xuất CSV ─────────────────

  async exportCsv(staff: StaffPrincipal, q: SalesQuery & { report: 'sales' | 'kitchen' | 'discounts-voids' | 'shifts' }): Promise<{ filename: string; csv: string }> {
    let header: string[] = [];
    let rows: (string | number | null)[][] = [];
    if (q.report === 'sales') {
      const r = await this.sales(staff, q);
      header = ['Nhóm', 'Doanh thu', 'Số bill', 'Số khách', 'Giảm giá', 'Bill trung bình'];
      rows = [...r.rows, r.total].map((x) => [x.label, x.revenue, x.bills, x.guests, x.discounts, x.avgBill]);
    } else if (q.report === 'kitchen') {
      const r = await this.kitchen(staff, q);
      header = ['Trạm', 'Số phiếu', 'TB phút', 'P90 phút', 'Tối đa phút'];
      rows = r.stations.map((s) => [s.stationCode, s.tickets, s.avgMinutes, s.p90Minutes, s.maxMinutes]);
    } else if (q.report === 'discounts-voids') {
      const r = await this.discountsVoids(staff, q);
      header = ['Loại', 'Nhóm', 'Số lần', 'Số tiền'];
      rows = [...r.discounts.byStaff.map((x) => ['Giảm giá', x.key, x.count, x.amount]), ...r.voids.byStaff.map((x) => ['Hủy món', x.key, x.count, x.amount])];
    } else {
      const r = await this.shifts(staff, q);
      header = ['Cơ sở', 'Mở ca', 'Kết ca', 'Người mở', 'Người kết', 'Tiền đầu ca', 'Tiền dự kiến', 'Tiền đếm', 'Chênh lệch', 'Số bill'];
      rows = r.map((s) => [s.branch, s.openedAt.toISOString(), s.closedAt?.toISOString() ?? '', s.openedBy, s.closedBy, s.openingCash, s.expectedCash, s.closingCashCounted, s.variance, s.bills]);
    }
    const escape = (v: string | number | null) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
    return { filename: `bao-cao-${q.report}-${q.from}-${q.to}.csv`, csv };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
