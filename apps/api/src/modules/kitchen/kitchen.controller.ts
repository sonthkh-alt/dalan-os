import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentStaff, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { KitchenService } from './kitchen.service.js';

@ApiTags('kitchen')
@ApiBearerAuth()
@Controller()
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('branches/:branchId/kitchen/tickets')
  @RequirePermissions('kitchen.read', 'kitchen.bump', 'dining.read')
  list(@Param('branchId') branchId: string, @Query('stationCode') stationCode?: string, @Query('view') view?: 'active' | 'done') {
    return this.kitchen.listTickets(branchId, { stationCode, view: view === 'done' ? 'done' : 'active' });
  }

  @Get('branches/:branchId/kitchen/aggregate')
  @RequirePermissions('kitchen.read', 'kitchen.bump')
  aggregate(@Param('branchId') branchId: string, @Query('stationCode') stationCode?: string) {
    return this.kitchen.aggregate(branchId, stationCode);
  }

  @Post('kitchen/tickets/:ticketId/start')
  @RequirePermissions('kitchen.bump')
  @HttpCode(200)
  start(@Param('ticketId') ticketId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.kitchen.start(ticketId, staff.staffId);
  }

  @Post('kitchen/tickets/:ticketId/bump')
  @RequirePermissions('kitchen.bump')
  @HttpCode(200)
  bump(@Param('ticketId') ticketId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.kitchen.bump(ticketId, staff.staffId);
  }

  @Post('kitchen/tickets/:ticketId/recall')
  @RequirePermissions('kitchen.bump')
  @HttpCode(200)
  recall(@Param('ticketId') ticketId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.kitchen.recall(ticketId, staff.staffId);
  }

  @Post('kitchen/tickets/:ticketId/lines/:lineId/bump')
  @RequirePermissions('kitchen.bump')
  @HttpCode(200)
  bumpLine(@Param('ticketId') ticketId: string, @Param('lineId') lineId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.kitchen.bumpLine(ticketId, lineId, staff.staffId);
  }
}
