import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  assignTablesSchema,
  availabilityQuerySchema,
  cancelReservationSchema,
  checkInSchema,
  createReservationSchema,
  recordDepositSchema,
  reservationListQuerySchema,
  updateReservationSchema,
  type AvailabilityQuery,
  type CreateReservationInput,
  type RecordDepositInput,
  type UpdateReservationInput,
} from '@dalan/contracts';
import type { z } from 'zod';
import { CurrentStaff, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('reservations')
@ApiBearerAuth()
@Controller()
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('branches/:branchId/reservations')
  @RequirePermissions('reservation.read', 'reservation.manage')
  list(@Param('branchId') branchId: string, @Query({ schema: reservationListQuerySchema }) query: z.infer<typeof reservationListQuerySchema>) {
    return this.reservations.list(branchId, query);
  }

  @Get('branches/:branchId/reservations/availability')
  @RequirePermissions('reservation.read', 'reservation.manage')
  availability(@Param('branchId') branchId: string, @Query({ schema: availabilityQuerySchema }) query: AvailabilityQuery) {
    return this.reservations.availability(branchId, query);
  }

  @Post('branches/:branchId/reservations')
  @RequirePermissions('reservation.manage')
  create(@Param('branchId') branchId: string, @Body({ schema: createReservationSchema }) body: CreateReservationInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.reservations.create({ ...body, branchId }, { staff });
  }

  @Get('reservations/:id')
  @RequirePermissions('reservation.read', 'reservation.manage')
  get(@Param('id') id: string) {
    return this.reservations.get(id);
  }

  @Patch('reservations/:id')
  @RequirePermissions('reservation.manage')
  update(@Param('id') id: string, @Body({ schema: updateReservationSchema }) body: UpdateReservationInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.reservations.update(id, body, staff);
  }

  @Post('reservations/:id/confirm')
  @RequirePermissions('reservation.manage')
  @HttpCode(200)
  confirm(@Param('id') id: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.reservations.confirm(id, staff);
  }

  @Post('reservations/:id/cancel')
  @RequirePermissions('reservation.manage')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body({ schema: cancelReservationSchema }) body: z.infer<typeof cancelReservationSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.reservations.cancel(id, body.reason, { staffId: staff.staffId });
  }

  @Post('reservations/:id/no-show')
  @RequirePermissions('reservation.manage')
  @HttpCode(200)
  noShow(@Param('id') id: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.reservations.noShow(id, staff);
  }

  @Post('reservations/:id/assign-tables')
  @RequirePermissions('reservation.manage')
  @HttpCode(200)
  assign(@Param('id') id: string, @Body({ schema: assignTablesSchema }) body: z.infer<typeof assignTablesSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.reservations.assignTables(id, body.tableIds, staff);
  }

  @Post('reservations/:id/deposit')
  @RequirePermissions('reservation.manage')
  @HttpCode(200)
  recordDeposit(@Param('id') id: string, @Body({ schema: recordDepositSchema }) body: RecordDepositInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.reservations.recordDeposit(id, body, staff);
  }

  @Post('reservations/:id/check-in')
  @RequirePermissions('reservation.manage', 'dining.open')
  @HttpCode(200)
  checkIn(@Param('id') id: string, @Body({ schema: checkInSchema }) body: z.infer<typeof checkInSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.reservations.checkIn(id, body, staff);
  }

  /** Chạy ngay vòng nhắc lịch (kiểm thử, vận hành). */
  @Post('reservations/reminders/run')
  @RequirePermissions('reservation.manage')
  @HttpCode(200)
  runReminders() {
    return this.reservations.reminderTick();
  }
}
