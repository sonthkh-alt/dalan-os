import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  attachCustomerSchema,
  campaignSchema,
  customerCreateSchema,
  customerSearchQuerySchema,
  customerUpdateSchema,
  feedbackResponseSchema,
  feedbackSchema,
  loyaltyTierSchema,
  mergeCustomersSchema,
  pointsAdjustSchema,
  voucherCreateSchema,
  type CustomerCreateInput,
  type CustomerUpdateInput,
  type FeedbackInput,
  type VoucherCreateInput,
} from '@dalan/contracts';
import { z } from 'zod';
import { AllowCustomer, AllowGuest, CurrentPrincipal, CurrentStaff, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { Principal, StaffPrincipal } from '../../common/auth/principal.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CustomersService } from './customers.service.js';

const meUpdateSchema = z.object({ fullName: z.string().max(100).optional(), email: z.string().email().nullable().optional(), birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), marketingConsent: z.boolean().optional() });

@ApiTags('customers')
@Controller()
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly prisma: PrismaService,
  ) {}

  // ───────── Nhân viên ─────────

  @ApiBearerAuth()
  @Get('customers')
  @RequirePermissions('customer.read', 'customer.manage')
  search(@CurrentStaff() staff: StaffPrincipal, @Query({ schema: customerSearchQuerySchema }) query: z.infer<typeof customerSearchQuerySchema>) {
    return this.customers.search(staff, query);
  }

  @ApiBearerAuth()
  @Post('customers')
  @RequirePermissions('customer.manage')
  create(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: customerCreateSchema }) body: CustomerCreateInput) {
    return this.customers.create(staff, body);
  }

  @ApiBearerAuth()
  @Post('customers/merge')
  @RequirePermissions('customer.manage')
  @HttpCode(200)
  merge(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: mergeCustomersSchema }) body: z.infer<typeof mergeCustomersSchema>) {
    return this.customers.merge(staff, body.sourceId, body.targetId);
  }

  @ApiBearerAuth()
  @Get('customers/:customerId')
  @RequirePermissions('customer.read', 'customer.manage')
  get(@CurrentStaff() staff: StaffPrincipal, @Param('customerId') customerId: string) {
    return this.customers.get(staff, customerId);
  }

  @ApiBearerAuth()
  @Patch('customers/:customerId')
  @RequirePermissions('customer.manage')
  update(@CurrentStaff() staff: StaffPrincipal, @Param('customerId') customerId: string, @Body({ schema: customerUpdateSchema }) body: CustomerUpdateInput) {
    return this.customers.update(staff, customerId, body);
  }

  @ApiBearerAuth()
  @Delete('customers/:customerId/personal-data')
  @RequirePermissions('customer.manage')
  anonymize(@CurrentStaff() staff: StaffPrincipal, @Param('customerId') customerId: string) {
    return this.customers.anonymize(staff, customerId);
  }

  @ApiBearerAuth()
  @Post('customers/:customerId/points')
  @RequirePermissions('customer.manage')
  adjustPoints(@CurrentStaff() staff: StaffPrincipal, @Param('customerId') customerId: string, @Body({ schema: pointsAdjustSchema }) body: z.infer<typeof pointsAdjustSchema>) {
    return this.customers.adjustPoints(staff, customerId, body.points, body.reason);
  }

  @ApiBearerAuth()
  @Get('customers/:customerId/points')
  @RequirePermissions('customer.read', 'customer.manage')
  points(@Param('customerId') customerId: string) {
    return this.customers.pointsHistory(customerId);
  }

  @ApiBearerAuth()
  @Get('customers/:customerId/vouchers')
  @RequirePermissions('customer.read', 'customer.manage', 'billing.collect')
  customerVouchers(@Param('customerId') customerId: string) {
    return this.customers.vouchersForCustomer(customerId);
  }

  @ApiBearerAuth()
  @Post('sessions/:sessionId/customer')
  @RequirePermissions('customer.read', 'dining.order', 'billing.collect')
  attach(@CurrentStaff() staff: StaffPrincipal, @Param('sessionId') sessionId: string, @Body({ schema: attachCustomerSchema }) body: z.infer<typeof attachCustomerSchema>) {
    return this.customers.attachToSession(staff, sessionId, body);
  }

  @ApiBearerAuth()
  @Get('loyalty/tiers')
  @RequirePermissions('customer.read', 'customer.manage')
  tiers(@CurrentStaff() staff: StaffPrincipal) {
    return this.customers.listTiers(staff.orgId);
  }

  @ApiBearerAuth()
  @Post('loyalty/tiers')
  @RequirePermissions('customer.manage')
  createTier(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: loyaltyTierSchema }) body: z.infer<typeof loyaltyTierSchema>) {
    return this.customers.upsertTier(staff.orgId, body);
  }

  @ApiBearerAuth()
  @Put('loyalty/tiers/:tierId')
  @RequirePermissions('customer.manage')
  updateTier(@CurrentStaff() staff: StaffPrincipal, @Param('tierId') tierId: string, @Body({ schema: loyaltyTierSchema }) body: z.infer<typeof loyaltyTierSchema>) {
    return this.customers.upsertTier(staff.orgId, body, tierId);
  }

  @ApiBearerAuth()
  @Post('loyalty/recalculate')
  @RequirePermissions('customer.manage')
  @HttpCode(200)
  recalc(@CurrentStaff() staff: StaffPrincipal, @Query('customerId') customerId?: string) {
    return this.customers.recalcTiers(staff.orgId, customerId);
  }

  @ApiBearerAuth()
  @Get('vouchers')
  @RequirePermissions('customer.read', 'customer.manage', 'billing.collect')
  vouchers(@CurrentStaff() staff: StaffPrincipal, @Query('customerId') customerId?: string, @Query('code') code?: string, @Query('status') status?: string, @Query('campaignId') campaignId?: string) {
    return this.customers.listVouchers(staff.orgId, { customerId, code, status, campaignId });
  }

  @ApiBearerAuth()
  @Post('vouchers')
  @RequirePermissions('customer.manage')
  createVouchers(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: voucherCreateSchema }) body: VoucherCreateInput) {
    return this.customers.createVouchers(staff.orgId, body);
  }

  @ApiBearerAuth()
  @Post('vouchers/:voucherId/revoke')
  @RequirePermissions('customer.manage')
  @HttpCode(200)
  revoke(@CurrentStaff() staff: StaffPrincipal, @Param('voucherId') voucherId: string) {
    return this.customers.revokeVoucher(staff.orgId, voucherId);
  }

  @ApiBearerAuth()
  @Get('campaigns')
  @RequirePermissions('customer.manage')
  campaigns(@CurrentStaff() staff: StaffPrincipal) {
    return this.customers.listCampaigns(staff.orgId);
  }

  @ApiBearerAuth()
  @Post('campaigns')
  @RequirePermissions('customer.manage')
  createCampaign(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: campaignSchema }) body: z.infer<typeof campaignSchema>) {
    return this.customers.upsertCampaign(staff.orgId, body);
  }

  @ApiBearerAuth()
  @Put('campaigns/:campaignId')
  @RequirePermissions('customer.manage')
  updateCampaign(@CurrentStaff() staff: StaffPrincipal, @Param('campaignId') campaignId: string, @Body({ schema: campaignSchema }) body: z.infer<typeof campaignSchema>) {
    return this.customers.upsertCampaign(staff.orgId, body, campaignId);
  }

  @ApiBearerAuth()
  @Post('campaigns/birthday/run')
  @RequirePermissions('customer.manage')
  @HttpCode(200)
  runBirthday() {
    return this.customers.runBirthdayCampaign();
  }

  @ApiBearerAuth()
  @Get('feedback')
  @RequirePermissions('customer.read', 'customer.manage', 'report.branch')
  feedback(@Query('branchId') branchId?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('maxRating') maxRating?: string, @Query('unhandled') unhandled?: string) {
    return this.customers.listFeedback(branchId, { from, to, maxRating: maxRating ? Number(maxRating) : undefined, unhandled: unhandled === 'true' });
  }

  @ApiBearerAuth()
  @Get('feedback/stats')
  @RequirePermissions('customer.read', 'report.branch', 'report.all')
  feedbackStats(@Query('branchId') branchId?: string, @Query('days') days?: string) {
    return this.customers.feedbackStats(branchId, days ? Number(days) : 30);
  }

  @ApiBearerAuth()
  @Post('feedback')
  @RequirePermissions('customer.manage', 'dining.order')
  staffFeedback(@Body({ schema: feedbackSchema.extend({ sessionId: z.uuid().optional(), branchId: z.uuid().optional() }) }) body: FeedbackInput & { sessionId?: string; branchId?: string }) {
    return this.customers.createFeedback(body);
  }

  @ApiBearerAuth()
  @Post('feedback/:feedbackId/respond')
  @RequirePermissions('customer.manage')
  @HttpCode(200)
  respond(@CurrentStaff() staff: StaffPrincipal, @Param('feedbackId') feedbackId: string, @Body({ schema: feedbackResponseSchema }) body: z.infer<typeof feedbackResponseSchema>) {
    return this.customers.respondFeedback(staff, feedbackId, body.response);
  }

  // ───────── Khách QR và khách thành viên ─────────

  @ApiSecurity('guest')
  @AllowGuest()
  @AllowCustomer()
  @Post('guest/feedback')
  async guestFeedback(@CurrentPrincipal() principal: Principal | undefined, @Body({ schema: feedbackSchema }) body: FeedbackInput) {
    if (principal?.kind === 'guest') {
      const paid = await this.prisma.bill.count({ where: { sessionId: principal.sessionId, status: 'PAID' } });
      const closed = await this.prisma.tableSession.count({ where: { id: principal.sessionId, status: 'CLOSED' } });
      if (!paid && !closed) throw Errors.state('Bạn có thể đánh giá sau khi thanh toán');
      return this.customers.createFeedback({ ...body, sessionId: principal.sessionId, participantId: principal.participantId });
    }
    if (principal?.kind === 'customer') {
      if (!body.billId) throw Errors.invalid('BILL_REQUIRED', 'Chọn bill để đánh giá');
      const bill = await this.prisma.bill.findFirst({ where: { id: body.billId, customerId: principal.customerId } });
      if (!bill) throw Errors.forbidden('Bill không thuộc tài khoản của bạn');
      return this.customers.createFeedback({ ...body, customerId: principal.customerId });
    }
    throw Errors.unauthorized();
  }

  @ApiBearerAuth()
  @AllowCustomer()
  @Get('me')
  me(@CurrentPrincipal() principal: Principal | undefined) {
    if (principal?.kind !== 'customer') throw Errors.unauthorized();
    return this.customers.me(principal.customerId);
  }

  @ApiBearerAuth()
  @AllowCustomer()
  @Patch('me')
  updateMe(@CurrentPrincipal() principal: Principal | undefined, @Body({ schema: meUpdateSchema }) body: z.infer<typeof meUpdateSchema>) {
    if (principal?.kind !== 'customer') throw Errors.unauthorized();
    return this.customers.updateMe(principal.customerId, body);
  }
}
