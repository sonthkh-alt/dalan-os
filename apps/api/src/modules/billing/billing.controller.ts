import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  addPaymentSchema,
  billDiscountSchema,
  cashMovementSchema,
  confirmPaymentSchema,
  createBillSchema,
  emptiesCountSchema,
  refundSchema,
  shiftCloseSchema,
  shiftOpenSchema,
  taxInvoiceInfoSchema,
  type AddPaymentInput,
  type BillDiscountInput,
  type CreateBillInput,
  type TaxInvoiceInfo,
} from '@dalan/contracts';
import { z } from 'zod';
import { AllowGuest, CurrentPrincipal, CurrentStaff, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { Principal, StaffPrincipal } from '../../common/auth/principal.js';
import { Errors } from '../../common/errors.js';
import { BillingService } from './billing.service.js';

const voidBillSchema = z.object({ reason: z.string().min(1).max(200) });

@ApiTags('billing')
@ApiBearerAuth()
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('sessions/:sessionId/bills')
  @RequirePermissions('billing.collect', 'billing.provisional')
  createBill(@Param('sessionId') sessionId: string, @Body({ schema: createBillSchema }) body: CreateBillInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.createBill(sessionId, body, staff);
  }

  @Post('sessions/:sessionId/empties')
  @RequirePermissions('billing.collect', 'billing.provisional', 'dining.order')
  @HttpCode(200)
  empties(@Param('sessionId') sessionId: string, @Body({ schema: emptiesCountSchema }) body: z.infer<typeof emptiesCountSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.countEmpties(sessionId, body.counts, staff);
  }

  @Get('branches/:branchId/bills')
  @RequirePermissions('billing.read')
  listBills(@Param('branchId') branchId: string, @Query('businessDate') businessDate?: string, @Query('status') status?: string, @Query('sessionId') sessionId?: string) {
    return this.billing.listBills(branchId, { businessDate, status, sessionId });
  }

  @ApiSecurity('guest')
  @AllowGuest()
  @Get('bills/:billId')
  @RequirePermissions('billing.read')
  async getBill(@Param('billId') billId: string, @CurrentPrincipal() principal: Principal | undefined) {
    const bill = await this.billing.getBill(billId);
    if (principal?.kind === 'guest' && bill.sessionId !== principal.sessionId) throw Errors.forbidden();
    return bill;
  }

  @Post('bills/:billId/discounts')
  @RequirePermissions('billing.discount', 'billing.collect')
  addDiscount(@Param('billId') billId: string, @Body({ schema: billDiscountSchema }) body: BillDiscountInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.addDiscount(billId, body, staff);
  }

  @Delete('bills/:billId/discounts/:discountId')
  @RequirePermissions('billing.discount', 'billing.collect')
  removeDiscount(@Param('billId') billId: string, @Param('discountId') discountId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.removeDiscount(billId, discountId, staff);
  }

  @Post('bills/:billId/payments')
  @RequirePermissions('billing.collect')
  addPayment(@Param('billId') billId: string, @Body({ schema: addPaymentSchema }) body: AddPaymentInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.addPayment(billId, body, staff);
  }

  @Post('payments/:paymentId/confirm')
  @RequirePermissions('billing.collect')
  @HttpCode(200)
  confirm(@Param('paymentId') paymentId: string, @Body({ schema: confirmPaymentSchema }) body: z.infer<typeof confirmPaymentSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.confirmPayment(paymentId, body, staff);
  }

  @Post('payments/:paymentId/cancel')
  @RequirePermissions('billing.collect')
  @HttpCode(200)
  cancel(@Param('paymentId') paymentId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.cancelPayment(paymentId, staff);
  }

  @Post('payments/:paymentId/refund')
  @RequirePermissions('billing.refund', 'billing.collect')
  refund(@Param('paymentId') paymentId: string, @Body({ schema: refundSchema }) body: z.infer<typeof refundSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.refund(paymentId, body, staff);
  }

  @Post('bills/:billId/void')
  @RequirePermissions('billing.void')
  @HttpCode(200)
  voidBill(@Param('billId') billId: string, @Body({ schema: voidBillSchema }) body: z.infer<typeof voidBillSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.voidBill(billId, body.reason, staff);
  }

  @Put('bills/:billId/tax-invoice-info')
  @ApiSecurity('guest')
  @AllowGuest()
  @RequirePermissions('billing.collect', 'invoice.issue')
  async taxInfo(@Param('billId') billId: string, @Body({ schema: taxInvoiceInfoSchema.nullable() }) body: TaxInvoiceInfo | null, @CurrentPrincipal() principal: Principal | undefined) {
    if (principal?.kind === 'guest') {
      const bill = await this.billing.getBill(billId);
      if (bill.sessionId !== principal.sessionId) throw Errors.forbidden();
    }
    return this.billing.setTaxInvoiceInfo(billId, body);
  }

  @Post('bills/:billId/print-provisional')
  @RequirePermissions('billing.provisional', 'billing.collect')
  @HttpCode(200)
  printProvisional(@Param('billId') billId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.printProvisional(billId, staff);
  }

  // ───────── Ca ─────────

  @Get('branches/:branchId/shifts/current')
  @RequirePermissions('shift.open', 'shift.close', 'billing.collect')
  async currentShift(@Param('branchId') branchId: string) {
    const shift = await this.billing.currentShift(branchId);
    return shift ? this.billing.shiftSummary(shift.id) : null;
  }

  @Post('shifts')
  @RequirePermissions('shift.open')
  openShift(@Body({ schema: shiftOpenSchema }) body: z.infer<typeof shiftOpenSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.openShift(body.branchId, body.openingCash, staff, body.notes);
  }

  @Get('shifts/:shiftId')
  @RequirePermissions('shift.open', 'shift.close', 'report.branch')
  shift(@Param('shiftId') shiftId: string) {
    return this.billing.shiftSummary(shiftId);
  }

  @Post('shifts/:shiftId/close')
  @RequirePermissions('shift.close')
  @HttpCode(200)
  closeShift(@Param('shiftId') shiftId: string, @Body({ schema: shiftCloseSchema }) body: z.infer<typeof shiftCloseSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.closeShift(shiftId, body.closingCashCounted, staff, body.notes);
  }

  @Post('shifts/:shiftId/cash-movements')
  @RequirePermissions('shift.cash', 'shift.open')
  cash(@Param('shiftId') shiftId: string, @Body({ schema: cashMovementSchema }) body: z.infer<typeof cashMovementSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.billing.addCashMovement(shiftId, body, staff);
  }
}
