import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { auditLogQuerySchema } from '@dalan/contracts';
import type { z } from 'zod';
import type { Prisma } from '@dalan/db';
import { CurrentStaff, RequirePermissions } from '../../common/auth/auth.guard.js';
import { canAccessBranch, type StaffPrincipal } from '../../common/auth/principal.js';
import { Errors } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/** Nhật ký thao tác nhạy cảm (giá, giảm giá, hủy món, hoàn tiền, phân quyền...). */
@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.read')
  async list(@CurrentStaff() staff: StaffPrincipal, @Query({ schema: auditLogQuerySchema }) query: z.infer<typeof auditLogQuerySchema>) {
    if (query.branchId && !canAccessBranch(staff, query.branchId)) throw Errors.forbidden('Bạn không thuộc cơ sở này');
    const where: Prisma.AuditLogWhereInput = {
      ...(query.branchId ? { branchId: query.branchId } : staff.permissions.includes('*') ? {} : { OR: [{ branchId: { in: staff.branchIds } }, { branchId: null }] }),
      ...(query.actorStaffId ? { actorStaffId: query.actorStaffId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.auditLog.count({ where }),
    ]);
    const staffIds = [...new Set(rows.map((r) => r.actorStaffId).filter((x): x is string => !!x))];
    const staffRows = staffIds.length ? await this.prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, code: true, fullName: true } }) : [];
    const staffMap = new Map(staffRows.map((s) => [s.id, s]));
    return { items: rows.map((r) => ({ ...r, actor: r.actorStaffId ? (staffMap.get(r.actorStaffId) ?? null) : null })), page: query.page, pageSize: query.pageSize, total };
  }
}
