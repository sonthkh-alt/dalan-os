import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  goodsReceiptSchema,
  manualAdjustSchema,
  movementsQuerySchema,
  purchaseOrderSchema,
  recipeSchema,
  stockItemSchema,
  stockTransferReceiveSchema,
  stockTransferSchema,
  stocktakeCountSchema,
  stocktakeCreateSchema,
  supplierSchema,
  warehouseSchema,
  warehousePatchSchema,
  stockItemPatchSchema,
  supplierPatchSchema,
  wasteSchema,
  type GoodsReceiptInput,
  type PurchaseOrderInput,
  type RecipeInput,
  type StockItemInput,
  type WarehouseInput,
} from '@dalan/contracts';
import { z } from 'zod';
import { CurrentStaff, RequirePermissions } from '../../common/auth/auth.guard.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { InventoryService } from './inventory.service.js';

const rangeQuery = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

@ApiTags('inventory')
@ApiBearerAuth()
@Controller()
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  // Kho
  @Get('warehouses')
  @RequirePermissions('inventory.read', 'inventory.manage')
  listWarehouses(@CurrentStaff() staff: StaffPrincipal, @Query('branchId') branchId?: string) {
    return this.inv.listWarehouses(staff.orgId, branchId);
  }
  @Post('warehouses')
  @RequirePermissions('inventory.manage')
  createWarehouse(@Body({ schema: warehouseSchema }) body: WarehouseInput) {
    return this.inv.createWarehouse(body);
  }
  @Patch('warehouses/:id')
  @RequirePermissions('inventory.manage')
  updateWarehouse(@Param('id') id: string, @Body({ schema: warehousePatchSchema }) body: Partial<WarehouseInput>) {
    return this.inv.updateWarehouse(id, body);
  }
  @Get('warehouses/:id/levels')
  @RequirePermissions('inventory.read', 'inventory.manage')
  levels(@Param('id') id: string) {
    return this.inv.levels(id);
  }
  @Get('warehouses/:id/movements')
  @RequirePermissions('inventory.read', 'inventory.manage')
  movements(@Param('id') id: string, @Query({ schema: movementsQuerySchema }) q: z.infer<typeof movementsQuerySchema>) {
    return this.inv.movements(id, q);
  }

  // Nguyên liệu
  @Get('stock-items')
  @RequirePermissions('inventory.read', 'inventory.manage', 'menu.manage')
  listStockItems(@CurrentStaff() staff: StaffPrincipal, @Query('search') search?: string, @Query('category') category?: string, @Query('warehouseId') warehouseId?: string) {
    return this.inv.listStockItems(staff.orgId, { search, category, warehouseId });
  }
  @Get('stock-items/:id')
  @RequirePermissions('inventory.read', 'inventory.manage')
  getStockItem(@CurrentStaff() staff: StaffPrincipal, @Param('id') id: string) {
    return this.inv.getStockItem(staff.orgId, id);
  }
  @Post('stock-items')
  @RequirePermissions('inventory.manage')
  createStockItem(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: stockItemSchema }) body: StockItemInput) {
    return this.inv.createStockItem(staff.orgId, body);
  }
  @Patch('stock-items/:id')
  @RequirePermissions('inventory.manage')
  updateStockItem(@CurrentStaff() staff: StaffPrincipal, @Param('id') id: string, @Body({ schema: stockItemPatchSchema }) body: Partial<StockItemInput>) {
    return this.inv.updateStockItem(staff.orgId, id, body);
  }

  // Nhà cung cấp
  @Get('suppliers')
  @RequirePermissions('inventory.read', 'inventory.manage')
  listSuppliers(@CurrentStaff() staff: StaffPrincipal) {
    return this.inv.listSuppliers(staff.orgId);
  }
  @Post('suppliers')
  @RequirePermissions('inventory.manage')
  createSupplier(@CurrentStaff() staff: StaffPrincipal, @Body({ schema: supplierSchema }) body: z.infer<typeof supplierSchema>) {
    return this.inv.createSupplier(staff.orgId, body);
  }
  @Patch('suppliers/:id')
  @RequirePermissions('inventory.manage')
  updateSupplier(@CurrentStaff() staff: StaffPrincipal, @Param('id') id: string, @Body({ schema: supplierPatchSchema }) body: Partial<z.infer<typeof supplierSchema>>) {
    return this.inv.updateSupplier(staff.orgId, id, body);
  }

  // Định lượng
  @Get('menu-items/:itemId/recipes')
  @RequirePermissions('inventory.read', 'inventory.manage', 'menu.manage')
  recipes(@Param('itemId') itemId: string) {
    return this.inv.getRecipes(itemId);
  }
  @Put('menu-items/:itemId/recipe')
  @RequirePermissions('inventory.manage', 'menu.manage')
  upsertRecipe(@CurrentStaff() staff: StaffPrincipal, @Param('itemId') itemId: string, @Body({ schema: recipeSchema }) body: RecipeInput) {
    return this.inv.upsertRecipe(staff.orgId, itemId, body);
  }

  // Đơn đặt hàng và nhập kho
  @Post('purchase-orders')
  @RequirePermissions('inventory.manage')
  createPo(@Body({ schema: purchaseOrderSchema }) body: PurchaseOrderInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.inv.createPurchaseOrder(body, staff);
  }
  @Get('branches/:branchId/purchase-orders')
  @RequirePermissions('inventory.read', 'inventory.manage')
  listPo(@Param('branchId') branchId: string, @Query('status') status?: string) {
    return this.inv.listPurchaseOrders(branchId, status);
  }
  @Get('purchase-orders/:id')
  @RequirePermissions('inventory.read', 'inventory.manage')
  getPo(@Param('id') id: string) {
    return this.inv.getPurchaseOrder(id);
  }
  @Post('purchase-orders/:id/send')
  @RequirePermissions('inventory.manage')
  @HttpCode(200)
  sendPo(@Param('id') id: string) {
    return this.inv.setPurchaseOrderStatus(id, 'SENT');
  }
  @Post('purchase-orders/:id/cancel')
  @RequirePermissions('inventory.manage')
  @HttpCode(200)
  cancelPo(@Param('id') id: string) {
    return this.inv.setPurchaseOrderStatus(id, 'CANCELLED');
  }
  @Post('goods-receipts')
  @RequirePermissions('inventory.manage')
  createReceipt(@Body({ schema: goodsReceiptSchema }) body: GoodsReceiptInput, @CurrentStaff() staff: StaffPrincipal) {
    return this.inv.createGoodsReceipt(body, staff);
  }
  @Get('branches/:branchId/goods-receipts')
  @RequirePermissions('inventory.read', 'inventory.manage')
  listReceipts(@Param('branchId') branchId: string) {
    return this.inv.listGoodsReceipts(branchId);
  }

  // Chuyển kho
  @Post('stock-transfers')
  @RequirePermissions('inventory.manage')
  createTransfer(@Body({ schema: stockTransferSchema }) body: z.infer<typeof stockTransferSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.inv.createTransfer(body, staff);
  }
  @Get('stock-transfers')
  @RequirePermissions('inventory.read', 'inventory.manage')
  listTransfers(@Query('warehouseId') warehouseId?: string) {
    return this.inv.listTransfers(warehouseId);
  }
  @Get('stock-transfers/:id')
  @RequirePermissions('inventory.read', 'inventory.manage')
  getTransfer(@Param('id') id: string) {
    return this.inv.getTransfer(id);
  }
  @Post('stock-transfers/:id/send')
  @RequirePermissions('inventory.manage')
  @HttpCode(200)
  sendTransfer(@Param('id') id: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.inv.sendTransfer(id, staff);
  }
  @Post('stock-transfers/:id/receive')
  @RequirePermissions('inventory.manage')
  @HttpCode(200)
  receiveTransfer(@Param('id') id: string, @Body({ schema: stockTransferReceiveSchema }) body: z.infer<typeof stockTransferReceiveSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.inv.receiveTransfer(id, body, staff);
  }

  // Kiểm kê
  @Post('stocktakes')
  @RequirePermissions('inventory.manage')
  createStocktake(@Body({ schema: stocktakeCreateSchema }) body: z.infer<typeof stocktakeCreateSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.inv.createStocktake(body, staff);
  }
  @Get('stocktakes')
  @RequirePermissions('inventory.read', 'inventory.manage', 'inventory.approve')
  listStocktakes(@Query('warehouseId') warehouseId?: string, @Query('status') status?: string) {
    return this.inv.listStocktakes({ warehouseId, status });
  }
  @Get('stocktakes/:id')
  @RequirePermissions('inventory.read', 'inventory.manage', 'inventory.approve')
  getStocktake(@Param('id') id: string) {
    return this.inv.getStocktake(id);
  }
  @Post('stocktakes/:id/count')
  @RequirePermissions('inventory.manage')
  @HttpCode(200)
  countStocktake(@Param('id') id: string, @Body({ schema: stocktakeCountSchema }) body: z.infer<typeof stocktakeCountSchema>) {
    return this.inv.countStocktake(id, body);
  }
  @Post('stocktakes/:id/approve')
  @RequirePermissions('inventory.approve')
  @HttpCode(200)
  approveStocktake(@Param('id') id: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.inv.approveStocktake(id, staff);
  }
  @Post('stocktakes/:id/cancel')
  @RequirePermissions('inventory.manage')
  @HttpCode(200)
  cancelStocktake(@Param('id') id: string) {
    return this.inv.cancelStocktake(id);
  }

  // Hao hụt, điều chỉnh, cảnh báo, giá vốn
  @Post('inventory/waste')
  @RequirePermissions('inventory.manage')
  waste(@Body({ schema: wasteSchema }) body: z.infer<typeof wasteSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.inv.waste(body, staff);
  }
  @Post('inventory/adjust')
  @RequirePermissions('inventory.approve')
  adjust(@Body({ schema: manualAdjustSchema }) body: z.infer<typeof manualAdjustSchema>, @CurrentStaff() staff: StaffPrincipal) {
    return this.inv.manualAdjust(body, staff);
  }
  /** Bảo trì: phát lại trừ kho/hoàn kho cho một đơn (khi relay lỗi hoặc định lượng vừa được thêm). */
  @Post('inventory/replay-order/:orderId')
  @RequirePermissions('inventory.manage', 'inventory.approve')
  @HttpCode(200)
  replayOrder(@Param('orderId') orderId: string, @CurrentStaff() staff: StaffPrincipal) {
    return this.inv.replayOrder(orderId, staff.staffId);
  }
  @Get('branches/:branchId/inventory/alerts')
  @RequirePermissions('inventory.read', 'inventory.manage')
  alerts(@Param('branchId') branchId: string) {
    return this.inv.alerts(branchId);
  }
  @Get('branches/:branchId/inventory/cogs')
  @RequirePermissions('inventory.read', 'inventory.manage', 'report.branch', 'report.all')
  cogs(@Param('branchId') branchId: string, @Query({ schema: rangeQuery }) q: z.infer<typeof rangeQuery>) {
    return this.inv.cogs(branchId, q.from, q.to);
  }
}
