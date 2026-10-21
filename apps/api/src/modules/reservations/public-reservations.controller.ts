import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { availabilityQuerySchema, cancelReservationSchema, lookupReservationSchema, publicReservationSchema, type AvailabilityQuery, type PublicReservationInput } from '@dalan/contracts';
import type { z } from 'zod';
import { AllowCustomer, CurrentPrincipal, Public } from '../../common/auth/auth.guard.js';
import type { Principal } from '../../common/auth/principal.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ReservationsService } from './reservations.service.js';

/** Đặt bàn công khai cho khách (web, Zalo, Mini App) và cho khách thành viên đã đăng nhập. */
@ApiTags('reservations')
@Controller()
export class PublicReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('public/branches')
  async branches() {
    const rows = await this.prisma.branch.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, address: true, phone: true, openingHours: true, defaultDiningMinutes: true, settings: true } });
    return rows.map((b) => ({ id: b.id, code: b.code, name: b.name, address: b.address, phone: b.phone, openingHours: b.openingHours, defaultDiningMinutes: b.defaultDiningMinutes, depositPolicy: (b.settings as { depositPolicy?: unknown }).depositPolicy ?? null }));
  }

  @Public()
  @Get('public/branches/:branchCode/areas')
  async areas(@Param('branchCode') branchCode: string) {
    const branch = await this.branchByCode(branchCode);
    const areas = await this.prisma.area.findMany({ where: { branchId: branch.id, isActive: true, kind: { notIn: ['VIRTUAL', 'TAKEAWAY'] } }, orderBy: { sortOrder: 'asc' }, select: { id: true, code: true, name: true, kind: true, floor: true, minSpend: true, tables: { where: { isActive: true }, select: { maxSeats: true } } } });
    return areas.map((a) => ({ id: a.id, code: a.code, name: a.name, kind: a.kind, floor: a.floor, minSpend: a.minSpend === null ? null : Number(a.minSpend), seats: a.tables.reduce((s, t) => s + t.maxSeats, 0), tables: a.tables.length }));
  }

  @Public()
  @Get('public/branches/:branchCode/reservations/availability')
  async availability(@Param('branchCode') branchCode: string, @Query({ schema: availabilityQuerySchema }) query: AvailabilityQuery) {
    const branch = await this.branchByCode(branchCode);
    return this.reservations.availability(branch.id, query);
  }

  @Public()
  @AllowCustomer()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('public/reservations')
  async create(@Body({ schema: publicReservationSchema }) body: PublicReservationInput, @CurrentPrincipal() principal: Principal | undefined) {
    const customerId = principal?.kind === 'customer' ? principal.customerId : null;
    const r = await this.reservations.create(body, { customerId });
    return this.reservations.publicView(r);
  }

  @Public()
  @Get('public/reservations/:code')
  lookup(@Param('code') code: string, @Query({ schema: lookupReservationSchema }) query: z.infer<typeof lookupReservationSchema>) {
    return this.reservations.lookup(code, query.phone);
  }

  @Public()
  @Post('public/reservations/:code/cancel')
  @HttpCode(200)
  async cancel(@Param('code') code: string, @Body({ schema: lookupReservationSchema.merge(cancelReservationSchema) }) body: z.infer<typeof lookupReservationSchema> & z.infer<typeof cancelReservationSchema>) {
    const r = await this.reservations.lookup(code, body.phone);
    const cancelled = await this.reservations.cancel(r.id, body.reason, { byCustomer: true });
    return this.reservations.publicView(cancelled);
  }

  @ApiBearerAuth()
  @AllowCustomer()
  @Get('me/reservations')
  mine(@CurrentPrincipal() principal: Principal | undefined) {
    if (principal?.kind !== 'customer') throw Errors.unauthorized();
    return this.reservations.forCustomer(principal.customerId);
  }

  private async branchByCode(branchCode: string) {
    const branch = await this.prisma.branch.findFirst({ where: { code: branchCode.toUpperCase(), isActive: true }, select: { id: true } });
    if (!branch) throw Errors.notFound('cơ sở');
    return branch;
  }
}
