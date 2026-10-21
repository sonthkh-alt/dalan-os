import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentStaff, Public, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { Errors } from '../../common/errors.js';
import { PrintingService } from './printing.service.js';

const ackSchema = z.object({ status: z.enum(['PRINTED', 'FAILED']), error: z.string().max(500).optional() });

@ApiTags('printing')
@Controller()
export class PrintingController {
  constructor(private readonly printing: PrintingService) {}

  @ApiBearerAuth()
  @Get('branches/:branchId/print-jobs')
  @RequirePermissions('print.manage', 'print.bill', 'print.kitchen')
  list(@Param('branchId') branchId: string, @Query('status') status?: string) {
    return this.printing.listJobs(branchId, status);
  }

  @ApiBearerAuth()
  @Post('print-jobs/:jobId/retry')
  @RequirePermissions('print.manage', 'print.bill', 'print.kitchen')
  @HttpCode(200)
  retry(@Param('jobId') jobId: string) {
    return this.printing.retry(jobId);
  }

  @ApiBearerAuth()
  @Post('branches/:branchId/printers/:printerId/test')
  @RequirePermissions('print.manage')
  test(@Param('branchId') branchId: string, @Param('printerId') printerId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.printing.testPrint(branchId, printerId, staff.fullName);
  }

  // ───────── Cầu in (xác thực bằng token thiết bị PRINT_BRIDGE) ─────────

  @Public()
  @Get('print-bridge/jobs')
  pull(@Headers('x-device-token') deviceToken?: string) {
    if (!deviceToken) throw Errors.unauthorized('Thiếu token thiết bị');
    return this.printing.bridgePull(deviceToken);
  }

  @Public()
  @Post('print-bridge/jobs/:jobId/ack')
  @HttpCode(200)
  ack(@Param('jobId') jobId: string, @Body({ schema: ackSchema }) body: z.infer<typeof ackSchema>, @Headers('x-device-token') deviceToken?: string) {
    if (!deviceToken) throw Errors.unauthorized('Thiếu token thiết bị');
    return this.printing.bridgeAck(deviceToken, jobId, body);
  }

  @Public()
  @Get('print-bridge/printers')
  printers(@Headers('x-device-token') deviceToken?: string) {
    if (!deviceToken) throw Errors.unauthorized('Thiếu token thiết bị');
    return this.printing.bridgePrinters(deviceToken);
  }
}
