import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  branchItemOverrideSchema,
  categorySchema,
  menuItemSchema,
  menuItemUpdateSchema,
  menuSchema,
  menuPatchSchema,
  categoryPatchSchema,
  modifierGroupSchema,
  soldOutSchema,
  type CategoryInput,
  type MenuInput,
  type MenuItemInput,
  type ModifierGroupInput,
} from '@dalan/contracts';
import type { z } from 'zod';
import { AllowGuest, CurrentPrincipal, CurrentStaff, Public, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { Principal, StaffPrincipal } from '../../common/auth/principal.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { MenuService } from './menu.service.js';

@ApiTags('menu')
@Controller()
export class MenuController {
  constructor(
    private readonly menu: MenuService,
    private readonly prisma: PrismaService,
  ) {}

  /** Thực đơn công khai theo mã cơ sở (website, QR tĩnh). */
  @Public()
  @Get('public/branches/:branchCode/menu')
  async publicMenu(@Param('branchCode') branchCode: string) {
    const branch = await this.prisma.branch.findFirst({ where: { code: branchCode.toUpperCase(), isActive: true } });
    if (!branch) throw Errors.notFound('cơ sở');
    return this.menu.branchMenu(branch.id);
  }

  /** Thực đơn cho POS và khách QR (đã áp dụng ghi đè theo cơ sở). */
  @ApiBearerAuth()
  @AllowGuest()
  @Get('branches/:branchId/menu')
  branchMenu(@Param('branchId') branchId: string, @CurrentPrincipal() principal: Principal | undefined) {
    if (principal?.kind === 'guest' && principal.branchId !== branchId) throw Errors.forbidden();
    return this.menu.branchMenu(branchId);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.read', 'menu.manage')
  @Get('menus')
  listMenus(@CurrentStaff() staff: StaffPrincipal) {
    return this.menu.listMenus(staff.orgId);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.manage')
  @Post('menus')
  createMenu(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: menuSchema }) body: MenuInput) {
    return this.menu.createMenu(staff.orgId, body);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.manage')
  @Patch('menus/:menuId')
  updateMenu(@CurrentStaff() staff: StaffPrincipal, @Param('menuId') menuId: string, @Body({ schema: menuPatchSchema }) body: Partial<MenuInput>) {
    return this.menu.updateMenu(staff.orgId, menuId, body);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.manage')
  @Post('menu-categories')
  createCategory(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: categorySchema }) body: CategoryInput) {
    return this.menu.createCategory(staff.orgId, body);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.manage')
  @Patch('menu-categories/:categoryId')
  updateCategory(@CurrentStaff() staff: StaffPrincipal, @Param('categoryId') categoryId: string, @Body({ schema: categoryPatchSchema }) body: Partial<CategoryInput>) {
    return this.menu.updateCategory(staff.orgId, categoryId, body);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.read', 'menu.manage')
  @Get('menu-items')
  listItems(@CurrentStaff() staff: StaffPrincipal, @Query('categoryId') categoryId?: string, @Query('menuId') menuId?: string, @Query('search') search?: string, @Query('status') status?: string) {
    return this.menu.listItems(staff.orgId, { categoryId, menuId, search, status });
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.read', 'menu.manage')
  @Get('menu-items/:itemId')
  getItem(@CurrentStaff() staff: StaffPrincipal, @Param('itemId') itemId: string) {
    return this.menu.getItem(staff.orgId, itemId);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.manage')
  @Post('menu-items')
  createItem(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: menuItemSchema }) body: MenuItemInput) {
    return this.menu.createItem(staff.orgId, body, staff.staffId);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.manage')
  @Patch('menu-items/:itemId')
  updateItem(@CurrentStaff() staff: StaffPrincipal, @Param('itemId') itemId: string, @Body({ schema: menuItemUpdateSchema }) body: z.infer<typeof menuItemUpdateSchema>) {
    return this.menu.updateItem(staff.orgId, itemId, body, staff.staffId);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.read', 'menu.manage')
  @Get('modifier-groups')
  listModifierGroups(@CurrentStaff() staff: StaffPrincipal) {
    return this.menu.listModifierGroups(staff.orgId);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.manage')
  @Post('modifier-groups')
  createModifierGroup(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: modifierGroupSchema }) body: ModifierGroupInput) {
    return this.menu.upsertModifierGroup(staff.orgId, body);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.manage')
  @Put('modifier-groups/:groupId')
  updateModifierGroup(@CurrentStaff() staff: StaffPrincipal, @Param('groupId') groupId: string, @Body({ schema: modifierGroupSchema }) body: ModifierGroupInput) {
    return this.menu.upsertModifierGroup(staff.orgId, body, groupId);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.manage')
  @Put('branches/:branchId/menu-items/:itemId/override')
  setOverride(@Param('branchId') branchId: string, @Param('itemId') itemId: string, @Body({ schema: branchItemOverrideSchema }) body: z.infer<typeof branchItemOverrideSchema>) {
    return this.menu.setOverride(branchId, itemId, body);
  }

  @ApiBearerAuth()
  @RequirePermissions('menu.soldout', 'menu.manage', 'kitchen.bump')
  @Post('branches/:branchId/menu-items/:itemId/sold-out')
  setSoldOut(@CurrentStaff() staff: StaffPrincipal, @Param('branchId') branchId: string, @Param('itemId') itemId: string, @Body({ schema: soldOutSchema }) body: z.infer<typeof soldOutSchema>) {
    return this.menu.setSoldOut(branchId, itemId, body.mode, staff.staffId);
  }
}
