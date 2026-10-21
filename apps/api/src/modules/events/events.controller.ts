import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  beoIssueSchema,
  eventAdjustmentSchema,
  eventCancelSchema,
  eventConfirmSchema,
  eventContractSchema,
  eventCreateSchema,
  eventListQuerySchema,
  eventMenusReplaceSchema,
  eventPaymentSchema,
  eventQuoteCreateSchema,
  eventServiceCatalogSchema,
  eventServicesReplaceSchema,
  eventUpdateSchema,
  hallCalendarQuerySchema,
  hallPatchSchema,
  hallSchema,
  eventServiceCatalogPatchSchema,
  publicEventInquirySchema,
  type BeoIssueInput,
  type EventContractInput,
  type EventCreateInput,
  type EventUpdateInput,
  type HallInput,
  type PublicEventInquiryInput,
} from '@dalan/contracts';
import { z } from 'zod';

const reopenLeadSchema = z.object({ note: z.string().max(300).optional() }).optional();
import { CurrentStaff, Public, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { EventsService } from './events.service.js';

const amountQuery = z.object({ amount: z.coerce.number().int().min(0).optional() });

@ApiTags('events')
@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // ───── Công khai ─────

  @Public()
  @Post('public/event-inquiries')
  inquiry(@Body({ schema: publicEventInquirySchema }) body: PublicEventInquiryInput) {
    return this.events.publicInquiry(body);
  }

  // ───── Sảnh ─────

  @ApiBearerAuth()
  @RequirePermissions('event.read', 'event.manage')
  @Get('branches/:branchId/halls')
  listHalls(@Param('branchId') branchId: string) {
    return this.events.listHalls(branchId);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.read', 'event.manage')
  @Get('branches/:branchId/halls/calendar')
  calendar(@Param('branchId') branchId: string, @Query({ schema: hallCalendarQuerySchema }) q: z.infer<typeof hallCalendarQuerySchema>) {
    return this.events.hallCalendar(branchId, q.from, q.to);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage', 'branch.update')
  @Post('branches/:branchId/halls')
  createHall(@Param('branchId') branchId: string, @Body({ schema: hallSchema }) body: HallInput) {
    return this.events.createHall(branchId, body);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage', 'branch.update')
  @Patch('branches/:branchId/halls/:hallId')
  updateHall(@Param('branchId') branchId: string, @Param('hallId') hallId: string, @Body({ schema: hallPatchSchema }) body: Partial<HallInput>) {
    return this.events.updateHall(branchId, hallId, body);
  }

  // ───── Danh mục dịch vụ ─────

  @ApiBearerAuth()
  @RequirePermissions('event.read', 'event.manage')
  @Get('event-services-catalog')
  listCatalog(@CurrentStaff() staff: StaffPrincipal) {
    return this.events.listServiceCatalog(staff.orgId);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Post('event-services-catalog')
  createCatalog(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: eventServiceCatalogSchema }) body: z.infer<typeof eventServiceCatalogSchema>) {
    return this.events.createServiceCatalog(staff.orgId, body);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Patch('event-services-catalog/:id')
  updateCatalog(@CurrentStaff() staff: StaffPrincipal, @Param('id') id: string, @Body({ schema: eventServiceCatalogPatchSchema }) body: Partial<z.infer<typeof eventServiceCatalogSchema>>) {
    return this.events.updateServiceCatalog(staff.orgId, id, body);
  }

  // ───── Tiệc ─────

  @ApiBearerAuth()
  @RequirePermissions('event.read', 'event.manage')
  @Get('branches/:branchId/events')
  list(@Param('branchId') branchId: string, @Query({ schema: eventListQuerySchema }) q: z.infer<typeof eventListQuerySchema>) {
    return this.events.listEvents(branchId, q);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.read', 'event.manage', 'report.event')
  @Get('branches/:branchId/events/summary')
  summary(@Param('branchId') branchId: string) {
    return this.events.summary(branchId);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Post('branches/:branchId/events')
  create(@Param('branchId') branchId: string, @Body({ schema: eventCreateSchema }) body: EventCreateInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.createEvent(branchId, body, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.read', 'event.manage', 'event.settle')
  @Get('events/:eventId')
  get(@Param('eventId') eventId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.getEvent(eventId, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Patch('events/:eventId')
  update(@Param('eventId') eventId: string, @Body({ schema: eventUpdateSchema }) body: EventUpdateInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.updateEvent(eventId, body, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Put('events/:eventId/menus')
  menus(@Param('eventId') eventId: string, @Body({ schema: eventMenusReplaceSchema }) body: z.infer<typeof eventMenusReplaceSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.replaceMenus(eventId, body.menus, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Put('events/:eventId/services')
  services(@Param('eventId') eventId: string, @Body({ schema: eventServicesReplaceSchema }) body: z.infer<typeof eventServicesReplaceSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.replaceServices(eventId, body.services, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Post('events/:eventId/quotes')
  quote(@Param('eventId') eventId: string, @Body({ schema: eventQuoteCreateSchema }) body: z.infer<typeof eventQuoteCreateSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.createQuote(eventId, body, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Post('events/:eventId/contract')
  contract(@Param('eventId') eventId: string, @Body({ schema: eventContractSchema }) body: EventContractInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.contract(eventId, body, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Post('events/:eventId/confirm')
  confirm(@Param('eventId') eventId: string, @Body({ schema: eventConfirmSchema }) body: z.infer<typeof eventConfirmSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.confirm(eventId, body, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Post('events/:eventId/beo')
  beo(@Param('eventId') eventId: string, @Body({ schema: beoIssueSchema }) body: BeoIssueInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.issueBeo(eventId, body, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage', 'event.settle')
  @Post('events/:eventId/start')
  @HttpCode(200)
  start(@Param('eventId') eventId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.start(eventId, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage', 'event.settle')
  @Post('events/:eventId/adjustments')
  adjustment(@Param('eventId') eventId: string, @Body({ schema: eventAdjustmentSchema }) body: z.infer<typeof eventAdjustmentSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.addAdjustment(eventId, body, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.settle', 'billing.collect', 'event.manage')
  @Get('events/:eventId/deposit-qr')
  depositQr(@Param('eventId') eventId: string, @Query({ schema: amountQuery }) q: z.infer<typeof amountQuery>, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.depositQr(eventId, q.amount, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.settle', 'billing.collect')
  @Post('events/:eventId/payments')
  payment(@Param('eventId') eventId: string, @Body({ schema: eventPaymentSchema }) body: z.infer<typeof eventPaymentSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.addPayment(eventId, body, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.settle')
  @Post('events/:eventId/settle')
  @HttpCode(200)
  settle(@Param('eventId') eventId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.settle(eventId, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.settle')
  @Post('events/:eventId/close')
  @HttpCode(200)
  close(@Param('eventId') eventId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.close(eventId, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Post('events/:eventId/cancel')
  @HttpCode(200)
  cancel(@Param('eventId') eventId: string, @Body({ schema: eventCancelSchema }) body: z.infer<typeof eventCancelSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.cancel(eventId, body.reason, body.refundAmount, staff);
  }

  @ApiBearerAuth()
  @RequirePermissions('event.manage')
  @Post('events/:eventId/reopen-lead')
  @HttpCode(200)
  reopenLead(@Param('eventId') eventId: string, @Body({ schema: reopenLeadSchema }) body: z.infer<typeof reopenLeadSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.events.reopenAsLead(eventId, body?.note, staff);
  }
}
