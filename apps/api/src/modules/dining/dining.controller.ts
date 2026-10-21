import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createOrderSchema,
  fireCourseSchema,
  mergeSessionSchema,
  moveTablesSchema,
  openSessionSchema,
  serviceRequestSchema,
  splitSessionSchema,
  updateLineSchema,
  updateSessionSchema,
  voidLineSchema,
  type CreateOrderInput,
  type OpenSessionInput,
  type VoidLineInput,
} from '@dalan/contracts';
import { z } from 'zod';
import { CurrentStaff, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { DiningService } from './dining.service.js';

const actorOf = (s: StaffPrincipal) => ({ staffId: s.staffId });
const reasonBodySchema = z.object({ reason: z.string().max(200).optional() }).optional();

@ApiTags('dining')
@ApiBearerAuth()
@Controller()
export class DiningController {
  constructor(private readonly dining: DiningService) {}

  @Get('branches/:branchId/floor')
  @RequirePermissions('dining.read')
  floor(@Param('branchId') branchId: string) {
    return this.dining.floor(branchId);
  }

  @Get('branches/:branchId/service-requests')
  @RequirePermissions('dining.read')
  requests(@Param('branchId') branchId: string) {
    return this.dining.listServiceRequests(branchId);
  }

  @Post('branches/:branchId/sessions')
  @RequirePermissions('dining.open', 'dining.order')
  open(@Param('branchId') branchId: string, @Body({ schema: openSessionSchema }) body: OpenSessionInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.openSession(branchId, body, actorOf(staff));
  }

  @Get('sessions/:sessionId')
  @RequirePermissions('dining.read')
  get(@Param('sessionId') sessionId: string) {
    return this.dining.getSession(sessionId);
  }

  @Patch('sessions/:sessionId')
  @RequirePermissions('dining.order', 'dining.open')
  update(@Param('sessionId') sessionId: string, @Body({ schema: updateSessionSchema }) body: z.infer<typeof updateSessionSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.updateSession(sessionId, body, actorOf(staff));
  }

  @Post('sessions/:sessionId/orders')
  @RequirePermissions('dining.order')
  createOrder(@Param('sessionId') sessionId: string, @Body({ schema: createOrderSchema }) body: CreateOrderInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.createOrder(sessionId, body, actorOf(staff), { source: 'STAFF', staff });
  }

  @Post('sessions/:sessionId/orders/:orderId/send')
  @RequirePermissions('dining.order')
  send(@Param('sessionId') sessionId: string, @Param('orderId') orderId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.sendOrder(sessionId, orderId, actorOf(staff));
  }

  @Post('sessions/:sessionId/orders/:orderId/confirm')
  @RequirePermissions('dining.order')
  confirm(@Param('sessionId') sessionId: string, @Param('orderId') orderId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.confirmOrder(sessionId, orderId, actorOf(staff));
  }

  @Post('sessions/:sessionId/orders/:orderId/reject')
  @RequirePermissions('dining.order')
  reject(
    @Param('sessionId') sessionId: string,
    @Param('orderId') orderId: string,
    @Body({ schema: reasonBodySchema }) body: z.infer<typeof reasonBodySchema>,
    @CurrentStaff() staff: StaffPrincipal,
  ) {
    return this.dining.rejectOrder(sessionId, orderId, actorOf(staff), body?.reason);
  }

  @Post('sessions/:sessionId/fire-course')
  @RequirePermissions('dining.order')
  fire(@Param('sessionId') sessionId: string, @Body({ schema: fireCourseSchema }) body: z.infer<typeof fireCourseSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.fireCourse(sessionId, body.course, actorOf(staff));
  }

  @Patch('sessions/:sessionId/lines/:lineId')
  @RequirePermissions('dining.order')
  updateLine(@Param('sessionId') sessionId: string, @Param('lineId') lineId: string, @Body({ schema: updateLineSchema }) body: z.infer<typeof updateLineSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.updateLine(sessionId, lineId, body, actorOf(staff), staff);
  }

  @Post('sessions/:sessionId/lines/:lineId/void')
  @RequirePermissions('dining.void', 'dining.order')
  voidLine(@Param('sessionId') sessionId: string, @Param('lineId') lineId: string, @Body({ schema: voidLineSchema }) body: VoidLineInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.voidLine(sessionId, lineId, body, actorOf(staff), staff);
  }

  @Post('sessions/:sessionId/lines/:lineId/served')
  @RequirePermissions('dining.order', 'kitchen.bump')
  served(@Param('sessionId') sessionId: string, @Param('lineId') lineId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.markServed(sessionId, lineId, actorOf(staff));
  }

  @Post('sessions/:sessionId/move')
  @RequirePermissions('dining.move')
  move(@Param('sessionId') sessionId: string, @Body({ schema: moveTablesSchema }) body: z.infer<typeof moveTablesSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.moveTables(sessionId, body.tableIds, actorOf(staff));
  }

  @Post('sessions/:sessionId/merge')
  @RequirePermissions('dining.move')
  merge(@Param('sessionId') sessionId: string, @Body({ schema: mergeSessionSchema }) body: z.infer<typeof mergeSessionSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.mergeSessions(sessionId, body.otherSessionId, actorOf(staff));
  }

  @Post('sessions/:sessionId/split')
  @RequirePermissions('dining.move')
  split(@Param('sessionId') sessionId: string, @Body({ schema: splitSessionSchema }) body: z.infer<typeof splitSessionSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.splitSession(sessionId, body.lineIds, body.tableIds, body.guestCount, actorOf(staff));
  }

  @Post('sessions/:sessionId/request-bill')
  @RequirePermissions('dining.order', 'billing.read')
  requestBill(@Param('sessionId') sessionId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.requestBill(sessionId, actorOf(staff));
  }

  @Post('sessions/:sessionId/reopen')
  @RequirePermissions('dining.order', 'billing.collect')
  reopen(@Param('sessionId') sessionId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.reopenSession(sessionId, actorOf(staff));
  }

  @Post('sessions/:sessionId/cancel')
  @RequirePermissions('dining.open', 'dining.order')
  cancel(@Param('sessionId') sessionId: string, @Body({ schema: reasonBodySchema }) body: z.infer<typeof reasonBodySchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.cancelSession(sessionId, actorOf(staff), body?.reason);
  }

  @Post('sessions/:sessionId/service-requests')
  @RequirePermissions('dining.order')
  createRequest(@Param('sessionId') sessionId: string, @Body({ schema: serviceRequestSchema }) body: z.infer<typeof serviceRequestSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.createServiceRequest(sessionId, body, actorOf(staff));
  }

  @Post('service-requests/:requestId/ack')
  @RequirePermissions('dining.order', 'dining.read')
  @HttpCode(200)
  ack(@Param('requestId') requestId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.updateServiceRequest(requestId, 'ACKED', actorOf(staff));
  }

  @Post('service-requests/:requestId/done')
  @RequirePermissions('dining.order', 'dining.read')
  @HttpCode(200)
  done(@Param('requestId') requestId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.dining.updateServiceRequest(requestId, 'DONE', actorOf(staff));
  }
}
