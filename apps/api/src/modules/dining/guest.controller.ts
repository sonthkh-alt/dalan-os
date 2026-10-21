import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { guestOrderSchema, serviceRequestSchema, type GuestOrderInput } from '@dalan/contracts';
import type { z } from 'zod';
import { AllowGuest, CurrentPrincipal } from '../../common/auth/auth.guard.js';
import type { GuestPrincipal, Principal } from '../../common/auth/principal.js';
import { Errors } from '../../common/errors.js';
import { DiningService } from './dining.service.js';
import { MenuService } from '../menu/menu.service.js';

function guestOf(p: Principal | undefined): GuestPrincipal {
  if (!p || p.kind !== 'guest') throw Errors.unauthorized('Cần token phiên khách');
  return p;
}

/** API cho khách quét QR tại bàn. Không cần đăng nhập; mọi thao tác giới hạn trong phiên của bàn. */
@ApiTags('guest')
@Controller()
export class GuestController {
  constructor(
    private readonly dining: DiningService,
    private readonly menu: MenuService,
  ) {}

  @ApiSecurity('guest')
  @AllowGuest()
  @Get('guest/session')
  async session(@CurrentPrincipal() principal: Principal | undefined) {
    const guest = guestOf(principal);
    const session = await this.dining.getSession(guest.sessionId);
    // Khách không thấy thông tin nội bộ (nhân viên, ghi chú quản lý, hồ sơ khách)
    return {
      id: session.id,
      code: session.code,
      status: session.status,
      guestCount: session.guestCount,
      openedAt: session.openedAt,
      branch: session.branch,
      tables: session.tables.map((t) => ({ id: t.table.id, name: t.table.name, area: t.table.area.name })),
      participants: session.participants.map((p) => ({ id: p.id, nickname: p.nickname, isHost: p.isHost })),
      orders: session.orders.map((o) => ({
        id: o.id,
        seq: o.seq,
        source: o.source,
        status: o.status,
        createdAt: o.createdAt,
        placedByParticipantId: o.placedByParticipantId,
        lines: o.lines.map((l) => ({
          id: l.id,
          name: l.nameSnapshot,
          nameEn: l.nameEnSnapshot,
          unit: l.unitSnapshot,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          modifiers: l.modifiersSnapshot,
          lineTotal: l.lineTotal,
          status: l.status,
          course: l.course,
          note: l.note,
          participantId: l.participantId,
          sentAt: l.sentAt,
          readyAt: l.readyAt,
          servedAt: l.servedAt,
        })),
      })),
      bills: session.bills,
      requests: session.requests.map((r) => ({ id: r.id, kind: r.kind, status: r.status, createdAt: r.createdAt })),
      totals: session.totals,
      me: { participantId: guest.participantId },
    };
  }

  @ApiSecurity('guest')
  @AllowGuest()
  @Get('guest/menu')
  menuForGuest(@CurrentPrincipal() principal: Principal | undefined) {
    const guest = guestOf(principal);
    return this.menu.branchMenu(guest.branchId);
  }

  @ApiSecurity('guest')
  @AllowGuest()
  @Post('guest/orders')
  order(@CurrentPrincipal() principal: Principal | undefined, @Body({ schema: guestOrderSchema }) body: GuestOrderInput) {
    const guest = guestOf(principal);
    return this.dining.createOrder(guest.sessionId, { lines: body.lines, send: true, notes: body.notes }, { participantId: guest.participantId }, { source: 'GUEST' });
  }

  @ApiSecurity('guest')
  @AllowGuest()
  @Post('guest/service-requests')
  request(@CurrentPrincipal() principal: Principal | undefined, @Body({ schema: serviceRequestSchema }) body: z.infer<typeof serviceRequestSchema>) {
    const guest = guestOf(principal);
    if (body.kind === 'BILL') return this.dining.requestBill(guest.sessionId, { participantId: guest.participantId });
    return this.dining.createServiceRequest(guest.sessionId, body, { participantId: guest.participantId });
  }
}
