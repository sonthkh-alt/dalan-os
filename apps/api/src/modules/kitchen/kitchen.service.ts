import { Injectable } from '@nestjs/common';
import { assertTransition, minutesSince, ticketAgeLevel, TICKET_TRANSITIONS } from '@dalan/domain';
import { DomainEvents } from '@dalan/contracts';
import type { Prisma } from '@dalan/db';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { OutboxService } from '../outbox/outbox.service.js';

type Tx = Prisma.TransactionClient;

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /** Phiếu bếp cho một trạm (hoặc toàn bộ cho expo). `view=active` là đang chờ/đang làm; `done` là 2 giờ gần nhất. */
  async listTickets(branchId: string, query: { stationCode?: string; view?: 'active' | 'done' }) {
    const now = new Date();
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { settings: true } });
    const settings = (branch?.settings ?? {}) as { kdsWarnMinutes?: number; kdsLateMinutes?: number };
    const tickets = await this.prisma.kitchenTicket.findMany({
      where: {
        branchId,
        ...(query.stationCode ? { stationCode: query.stationCode } : {}),
        ...(query.view === 'done' ? { status: { in: ['DONE', 'VOIDED'] }, bumpedAt: { gt: new Date(now.getTime() - 2 * 3600_000) } } : { status: { in: ['NEW', 'IN_PROGRESS', 'RECALLED'] } }),
      },
      orderBy: [{ priority: 'desc' }, { firedAt: 'asc' }],
      include: {
        station: { select: { code: true, name: true, color: true } },
        session: { select: { code: true, guestCount: true, tables: { where: { releasedAt: null }, select: { table: { select: { name: true, isPrivateRoom: true } } } } } },
        order: { select: { seq: true, source: true, notes: true, placedById: true } },
        lines: { include: { orderLine: { select: { id: true, itemId: true, nameSnapshot: true, unitSnapshot: true, quantity: true, weightKg: true, modifiersSnapshot: true, note: true, course: true, status: true, seatNo: true } } } },
      },
    });
    return tickets.map((t) => {
      const age = minutesSince(t.firedAt, now);
      return {
        id: t.id,
        seq: t.seq,
        status: t.status,
        course: t.course,
        priority: t.priority,
        firedAt: t.firedAt,
        startedAt: t.startedAt,
        bumpedAt: t.bumpedAt,
        ageMinutes: age,
        ageLevel: ticketAgeLevel(age, settings.kdsWarnMinutes ?? 10, settings.kdsLateMinutes ?? 20),
        station: t.station,
        sessionId: t.sessionId,
        orderId: t.orderId,
        sessionCode: t.session.code,
        guestCount: t.session.guestCount,
        tableNames: t.session.tables.map((x) => x.table.name),
        isVip: t.session.tables.some((x) => x.table.isPrivateRoom),
        orderSeq: t.order.seq,
        orderSource: t.order.source,
        orderNotes: t.order.notes,
        lines: t.lines.map((l) => ({
          id: l.id,
          orderLineId: l.orderLineId,
          itemId: l.orderLine.itemId,
          status: l.status,
          name: l.orderLine.nameSnapshot,
          unit: l.orderLine.unitSnapshot,
          quantity: l.quantity,
          weightKg: l.orderLine.weightKg,
          modifiers: l.orderLine.modifiersSnapshot,
          note: l.orderLine.note,
          course: l.orderLine.course,
          seatNo: l.orderLine.seatNo,
          lineStatus: l.orderLine.status,
        })),
      };
    });
  }

  /** Tổng hợp số lượng từng món đang chờ ở một trạm (gom "Gà quay ×5"). */
  async aggregate(branchId: string, stationCode?: string) {
    const lines = await this.prisma.kitchenTicketLine.findMany({
      where: { status: { in: ['NEW', 'IN_PROGRESS'] }, ticket: { branchId, status: { in: ['NEW', 'IN_PROGRESS', 'RECALLED'] }, ...(stationCode ? { stationCode } : {}) } },
      include: { orderLine: { select: { nameSnapshot: true, unitSnapshot: true, modifiersSnapshot: true } } },
    });
    const map = new Map<string, { name: string; unit: string; quantity: number; tickets: number }>();
    for (const l of lines) {
      const mods = (l.orderLine.modifiersSnapshot as { optionName: string }[]).map((m) => m.optionName).join(', ');
      const key = `${l.orderLine.nameSnapshot}|${mods}`;
      const entry = map.get(key) ?? { name: mods ? `${l.orderLine.nameSnapshot} (${mods})` : l.orderLine.nameSnapshot, unit: l.orderLine.unitSnapshot, quantity: 0, tickets: 0 };
      entry.quantity += Number(l.quantity);
      entry.tickets += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.quantity - a.quantity);
  }

  async start(ticketId: string, staffId: string) {
    return this.transition(ticketId, 'IN_PROGRESS', staffId);
  }

  async bump(ticketId: string, staffId: string) {
    return this.transition(ticketId, 'DONE', staffId);
  }

  async recall(ticketId: string, staffId: string) {
    return this.transition(ticketId, 'RECALLED', staffId);
  }

  /** Báo xong từng dòng; khi mọi dòng xong thì phiếu tự DONE. */
  async bumpLine(ticketId: string, ticketLineId: string, staffId: string) {
    const line = await this.prisma.kitchenTicketLine.findFirst({ where: { id: ticketLineId, ticketId }, include: { ticket: true } });
    if (!line) throw Errors.notFound('dòng phiếu');
    if (line.status === 'VOIDED') throw Errors.state('Dòng đã hủy');
    await this.prisma.$transaction(async (tx) => {
      await tx.kitchenTicketLine.update({ where: { id: ticketLineId }, data: { status: 'DONE', doneAt: new Date() } });
      await this.syncOrderLine(tx, line.orderLineId, line.ticket.sessionId, line.ticket.branchId, staffId);
      const remaining = await tx.kitchenTicketLine.count({ where: { ticketId, status: { in: ['NEW', 'IN_PROGRESS'] } } });
      if (remaining === 0) {
        await tx.kitchenTicket.update({ where: { id: ticketId }, data: { status: 'DONE', bumpedAt: new Date() } });
        await this.outbox.append(tx, { type: DomainEvents.ticketDone, aggregateType: 'session', aggregateId: line.ticket.sessionId, branchId: line.ticket.branchId, payload: { sessionId: line.ticket.sessionId, ticketId, stationCode: line.ticket.stationCode }, actorStaffId: staffId });
      } else if (line.ticket.status === 'NEW') {
        await tx.kitchenTicket.update({ where: { id: ticketId }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
      }
    });
    return this.getTicket(ticketId);
  }

  private async transition(ticketId: string, to: 'IN_PROGRESS' | 'DONE' | 'RECALLED', staffId: string) {
    const ticket = await this.prisma.kitchenTicket.findUnique({ where: { id: ticketId }, include: { lines: true } });
    if (!ticket) throw Errors.notFound('phiếu bếp');
    assertTransition('Phiếu bếp', TICKET_TRANSITIONS, ticket.status, to);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.KitchenTicketUpdateInput = { status: to };
      if (to === 'IN_PROGRESS') data.startedAt = ticket.startedAt ?? now;
      if (to === 'DONE') data.bumpedAt = now;
      await tx.kitchenTicket.update({ where: { id: ticketId }, data });
      const activeLines = ticket.lines.filter((l) => l.status !== 'VOIDED');
      if (to === 'IN_PROGRESS' || to === 'RECALLED') {
        await tx.kitchenTicketLine.updateMany({ where: { id: { in: activeLines.map((l) => l.id) } }, data: { status: 'IN_PROGRESS', startedAt: now, doneAt: null } });
        await tx.orderLine.updateMany({ where: { id: { in: activeLines.map((l) => l.orderLineId) }, status: { in: ['SENT', 'READY'] } }, data: { status: 'PREPARING', readyAt: null } });
      }
      if (to === 'DONE') {
        await tx.kitchenTicketLine.updateMany({ where: { id: { in: activeLines.map((l) => l.id) } }, data: { status: 'DONE', doneAt: now } });
        for (const l of activeLines) await this.syncOrderLine(tx, l.orderLineId, ticket.sessionId, ticket.branchId, staffId);
      }
      const type = to === 'IN_PROGRESS' ? DomainEvents.ticketStarted : to === 'DONE' ? DomainEvents.ticketDone : DomainEvents.ticketRecalled;
      await this.outbox.append(tx, { type, aggregateType: 'session', aggregateId: ticket.sessionId, branchId: ticket.branchId, payload: { sessionId: ticket.sessionId, ticketId, stationCode: ticket.stationCode, seq: ticket.seq }, actorStaffId: staffId });
    });
    return this.getTicket(ticketId);
  }

  /** Dòng món READY khi mọi phiếu chứa nó đã xong (món có thể qua nhiều trạm). */
  private async syncOrderLine(tx: Tx, orderLineId: string, sessionId: string, branchId: string, staffId: string) {
    const pending = await tx.kitchenTicketLine.count({ where: { orderLineId, status: { in: ['NEW', 'IN_PROGRESS'] } } });
    if (pending > 0) return;
    const line = await tx.orderLine.findUnique({ where: { id: orderLineId } });
    if (!line || !['SENT', 'PREPARING'].includes(line.status)) return;
    await tx.orderLine.update({ where: { id: orderLineId }, data: { status: 'READY', readyAt: new Date() } });
    await this.outbox.append(tx, { type: DomainEvents.orderLineReady, aggregateType: 'session', aggregateId: sessionId, branchId, payload: { sessionId, lineId: orderLineId, name: line.nameSnapshot }, actorStaffId: staffId });
  }

  async getTicket(ticketId: string) {
    const t = await this.prisma.kitchenTicket.findUnique({ where: { id: ticketId }, include: { lines: { include: { orderLine: { select: { nameSnapshot: true, status: true } } } }, station: { select: { code: true, name: true } } } });
    if (!t) throw Errors.notFound('phiếu bếp');
    return t;
  }
}
