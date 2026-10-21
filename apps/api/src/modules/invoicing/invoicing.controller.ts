import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { adjustEInvoiceSchema, cancelEInvoiceSchema, eInvoiceListQuerySchema, issueEInvoiceSchema, replaceEInvoiceSchema, type IssueEInvoiceInput } from '@dalan/contracts';
import type { z } from 'zod';
import { AllowGuest, CurrentPrincipal, CurrentStaff, RequirePermissions } from '../../common/auth/auth.guard.js';
import { hasPermission, type Principal, type StaffPrincipal } from '../../common/auth/principal.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { InvoicingService } from './invoicing.service.js';

@ApiTags('invoicing')
@ApiBearerAuth()
@Controller()
export class InvoicingController {
  constructor(
    private readonly invoicing: InvoicingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('bills/:billId/einvoice')
  @RequirePermissions('invoice.issue', 'billing.collect')
  issue(@Param('billId') billId: string, @Body({ schema: issueEInvoiceSchema }) body: IssueEInvoiceInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.invoicing.createForBill(billId, body, staff.staffId);
  }

  @Get('einvoices')
  @RequirePermissions('invoice.issue', 'invoice.cancel', 'billing.read', 'report.branch', 'report.all')
  list(@Query({ schema: eInvoiceListQuerySchema }) query: z.infer<typeof eInvoiceListQuerySchema>, @CurrentStaff() staff: StaffPrincipal) {
    const all = hasPermission(staff.permissions, '*') || hasPermission(staff.permissions, 'report.all');
    return this.invoicing.list(query, all ? null : staff.branchIds);
  }

  @Get('einvoices/:id')
  @ApiSecurity('guest')
  @AllowGuest()
  @RequirePermissions('invoice.issue', 'invoice.cancel', 'billing.read')
  async get(@Param('id') id: string, @CurrentPrincipal() principal: Principal | undefined) {
    const inv = await this.invoicing.get(id);
    if (principal?.kind === 'guest' && inv.bill?.sessionId !== principal.sessionId) throw Errors.forbidden();
    return inv;
  }

  @Get('einvoices/:id/pdf')
  @ApiSecurity('guest')
  @AllowGuest()
  @RequirePermissions('invoice.issue', 'invoice.cancel', 'billing.read')
  async pdf(@Param('id') id: string, @CurrentPrincipal() principal: Principal | undefined, @Res() reply: FastifyReply) {
    if (principal?.kind === 'guest') {
      const inv = await this.invoicing.get(id);
      if (inv.bill?.sessionId !== principal.sessionId) throw Errors.forbidden();
    }
    const { buffer, filename } = await this.invoicing.getPdf(id);
    void reply.header('content-disposition', `inline; filename="${filename}"`).type('application/pdf').send(buffer);
  }

  @Post('einvoices/:id/cancel')
  @RequirePermissions('invoice.cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body({ schema: cancelEInvoiceSchema }) body: z.infer<typeof cancelEInvoiceSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.invoicing.cancel(id, body.reason, staff.staffId);
  }

  @Post('einvoices/:id/replace')
  @RequirePermissions('invoice.cancel')
  replace(@Param('id') id: string, @Body({ schema: replaceEInvoiceSchema }) body: z.infer<typeof replaceEInvoiceSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.invoicing.replace(id, body, staff.staffId);
  }

  @Post('einvoices/:id/adjust')
  @RequirePermissions('invoice.cancel')
  adjust(@Param('id') id: string, @Body({ schema: adjustEInvoiceSchema }) body: z.infer<typeof adjustEInvoiceSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.invoicing.adjust(id, body, staff.staffId);
  }

  @Post('einvoices/:id/retry')
  @RequirePermissions('invoice.issue')
  @HttpCode(200)
  retry(@Param('id') id: string) {
    return this.invoicing.retry(id);
  }

  /** Tra cứu mã số thuế để điền thông tin người mua (khách tại bàn cũng dùng được). */
  @Get('tax-codes/:taxCode')
  @ApiSecurity('guest')
  @AllowGuest()
  @RequirePermissions('invoice.issue', 'billing.collect', 'billing.read')
  lookup(@Param('taxCode') taxCode: string, @CurrentPrincipal() principal: Principal | undefined) {
    const branchId = principal?.kind === 'guest' ? principal.branchId : principal?.kind === 'staff' ? principal.activeBranchId : null;
    return this.invoicing.lookupTaxCode(taxCode, branchId);
  }

  @Get('branches/:branchId/einvoice/reconcile')
  @RequirePermissions('invoice.issue', 'invoice.cancel', 'report.branch', 'report.all')
  async reconcile(@Param('branchId') branchId: string, @Query('date') date?: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) throw Errors.notFound('cơ sở');
    const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
    return this.invoicing.reconcile(branchId, d);
  }
}
