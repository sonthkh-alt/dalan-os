import { Controller, Get, Header, HttpCode, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { dateOnlySchema, exportQuerySchema, idSchema, realtimeQuerySchema, reportRangeSchema, salesQuerySchema, type SalesQuery } from '@dalan/contracts';
import { z } from 'zod';

const rebuildQuerySchema = z.object({ branchId: idSchema, date: dateOnlySchema });
import { CurrentStaff, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('realtime')
  @RequirePermissions('report.branch', 'report.all')
  realtime(@CurrentStaff() staff: StaffPrincipal, @Query({ schema: realtimeQuerySchema }) q: z.infer<typeof realtimeQuerySchema>) {
    return this.reports.realtime(staff, q.branchId);
  }

  @Get('sales')
  @RequirePermissions('report.branch', 'report.all')
  sales(@CurrentStaff() staff: StaffPrincipal, @Query({ schema: salesQuerySchema }) q: SalesQuery) {
    return this.reports.sales(staff, q);
  }

  @Get('kitchen')
  @RequirePermissions('report.branch', 'report.all')
  kitchen(@CurrentStaff() staff: StaffPrincipal, @Query({ schema: reportRangeSchema }) q: z.infer<typeof reportRangeSchema>) {
    return this.reports.kitchen(staff, q);
  }

  @Get('discounts-voids')
  @RequirePermissions('report.branch', 'report.all')
  discountsVoids(@CurrentStaff() staff: StaffPrincipal, @Query({ schema: reportRangeSchema }) q: z.infer<typeof reportRangeSchema>) {
    return this.reports.discountsVoids(staff, q);
  }

  @Get('shifts')
  @RequirePermissions('report.branch', 'report.all')
  shifts(@CurrentStaff() staff: StaffPrincipal, @Query({ schema: reportRangeSchema }) q: z.infer<typeof reportRangeSchema>) {
    return this.reports.shifts(staff, q);
  }

  @Post('rebuild')
  @RequirePermissions('report.all')
  @HttpCode(200)
  rebuild(@CurrentStaff() staff: StaffPrincipal, @Query({ schema: rebuildQuerySchema }) q: z.infer<typeof rebuildQuerySchema>) {
    return this.reports.rebuildDay(staff, q.branchId, q.date);
  }

  @Get('export.csv')
  @RequirePermissions('report.export', 'report.all')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@CurrentStaff() staff: StaffPrincipal, @Query({ schema: exportQuerySchema }) q: z.infer<typeof exportQuerySchema>, @Res({ passthrough: true }) reply: FastifyReply) {
    const { filename, csv } = await this.reports.exportCsv(staff, q);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
