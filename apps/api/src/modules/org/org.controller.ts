import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  areaSchema,
  branchUpdateSchema,
  printerSchema,
  roleSchema,
  staffCreateSchema,
  staffUpdateSchema,
  stationSchema,
  tableLayoutBatchSchema,
  tableSchema,
  areaPatchSchema,
  tablePatchSchema,
  stationPatchSchema,
  printerPatchSchema,
  rolePatchSchema,
  type AreaInput,
  type BranchUpdateInput,
  type TableInput,
} from '@dalan/contracts';
import type { z } from 'zod';
import { CurrentStaff, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { OrgService } from './org.service.js';

@ApiTags('org')
@ApiBearerAuth()
@Controller()
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('branches')
  listBranches(@CurrentStaff() staff: StaffPrincipal) {
    return this.org.listBranches(staff);
  }

  @Get('branches/:branchId')
  @RequirePermissions('branch.read', 'dining.read')
  getBranch(@Param('branchId') branchId: string) {
    return this.org.getBranch(branchId);
  }

  @Patch('branches/:branchId')
  @RequirePermissions('branch.update')
  updateBranch(@Param('branchId') branchId: string, @Body({ schema: branchUpdateSchema }) body: BranchUpdateInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.org.updateBranch(branchId, body, staff);
  }

  @Get('branches/:branchId/areas')
  @RequirePermissions('dining.read', 'branch.read')
  listAreas(@Param('branchId') branchId: string) {
    return this.org.listAreas(branchId);
  }

  @Post('branches/:branchId/areas')
  @RequirePermissions('branch.update')
  createArea(@Param('branchId') branchId: string, @Body({ schema: areaSchema }) body: AreaInput) {
    return this.org.createArea(branchId, body);
  }

  @Patch('branches/:branchId/areas/:areaId')
  @RequirePermissions('branch.update')
  updateArea(@Param('branchId') branchId: string, @Param('areaId') areaId: string, @Body({ schema: areaPatchSchema }) body: Partial<AreaInput>) {
    return this.org.updateArea(branchId, areaId, body);
  }

  @Post('branches/:branchId/tables')
  @RequirePermissions('branch.update')
  createTable(@Param('branchId') branchId: string, @Body({ schema: tableSchema }) body: TableInput) {
    return this.org.createTable(branchId, body);
  }

  @Patch('branches/:branchId/tables/:tableId')
  @RequirePermissions('branch.update')
  updateTable(@Param('branchId') branchId: string, @Param('tableId') tableId: string, @Body({ schema: tablePatchSchema }) body: Partial<TableInput>) {
    return this.org.updateTable(branchId, tableId, body);
  }

  @Put('branches/:branchId/tables/layout')
  @RequirePermissions('branch.update')
  updateLayout(@Param('branchId') branchId: string, @Body({ schema: tableLayoutBatchSchema }) body: z.infer<typeof tableLayoutBatchSchema>) {
    return this.org.updateTableLayout(branchId, body.tables);
  }

  @Post('branches/:branchId/tables/:tableId/rotate-qr')
  @RequirePermissions('branch.update')
  rotateQr(@Param('branchId') branchId: string, @Param('tableId') tableId: string) {
    return this.org.rotateTableQr(branchId, tableId);
  }

  @Get('branches/:branchId/stations')
  @RequirePermissions('kitchen.read', 'branch.read', 'dining.read')
  listStations(@Param('branchId') branchId: string) {
    return this.org.listStations(branchId);
  }

  @Post('branches/:branchId/stations')
  @RequirePermissions('branch.update')
  createStation(@Param('branchId') branchId: string, @Body({ schema: stationSchema }) body: z.infer<typeof stationSchema>) {
    return this.org.createStation(branchId, body);
  }

  @Patch('branches/:branchId/stations/:stationId')
  @RequirePermissions('branch.update')
  updateStation(@Param('branchId') branchId: string, @Param('stationId') stationId: string, @Body({ schema: stationPatchSchema }) body: Partial<z.infer<typeof stationSchema>>) {
    return this.org.updateStation(branchId, stationId, body);
  }

  @Get('branches/:branchId/printers')
  @RequirePermissions('print.manage', 'branch.read')
  listPrinters(@Param('branchId') branchId: string) {
    return this.org.listPrinters(branchId);
  }

  @Post('branches/:branchId/printers')
  @RequirePermissions('print.manage', 'branch.update')
  createPrinter(@Param('branchId') branchId: string, @Body({ schema: printerSchema }) body: z.infer<typeof printerSchema>) {
    return this.org.createPrinter(branchId, body);
  }

  @Patch('branches/:branchId/printers/:printerId')
  @RequirePermissions('print.manage', 'branch.update')
  updatePrinter(@Param('branchId') branchId: string, @Param('printerId') printerId: string, @Body({ schema: printerPatchSchema }) body: Partial<z.infer<typeof printerSchema>>) {
    return this.org.updatePrinter(branchId, printerId, body);
  }

  @Get('branches/:branchId/devices')
  @RequirePermissions('staff.device', 'staff.manage')
  listDevices(@Param('branchId') branchId: string) {
    return this.org.listDevices(branchId);
  }

  @Get('roles')
  @RequirePermissions('staff.read', 'staff.manage')
  listRoles(@CurrentStaff() staff: StaffPrincipal) {
    return this.org.listRoles(staff.orgId);
  }

  @Post('roles')
  @RequirePermissions('staff.manage')
  createRole(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: roleSchema }) body: z.infer<typeof roleSchema>) {
    return this.org.createRole(staff.orgId, body);
  }

  @Patch('roles/:roleId')
  @RequirePermissions('staff.manage')
  updateRole(@CurrentStaff() staff: StaffPrincipal, @Param('roleId') roleId: string, @Body({ schema: rolePatchSchema }) body: Partial<z.infer<typeof roleSchema>>) {
    return this.org.updateRole(staff.orgId, roleId, body);
  }

  @Get('staff')
  @RequirePermissions('staff.read', 'staff.manage')
  listStaff(@CurrentStaff() staff: StaffPrincipal, @Query('branchId') branchId?: string) {
    return this.org.listStaff(staff, branchId);
  }

  @Post('staff')
  @RequirePermissions('staff.manage')
  createStaff(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: staffCreateSchema }) body: z.infer<typeof staffCreateSchema>) {
    return this.org.createStaff(staff, body);
  }

  @Patch('staff/:staffId')
  @RequirePermissions('staff.manage')
  updateStaff(@CurrentStaff() staff: StaffPrincipal, @Param('staffId') staffId: string, @Body({ schema: staffUpdateSchema }) body: z.infer<typeof staffUpdateSchema>) {
    return this.org.updateStaff(staff, staffId, body);
  }
}
