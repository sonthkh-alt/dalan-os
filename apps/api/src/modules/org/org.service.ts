import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hashSecret, type Prisma } from '@dalan/db';
import type { AreaInput, BranchUpdateInput, TableInput } from '@dalan/contracts';
import { z } from 'zod';
import type { printerSchema, roleSchema, staffCreateSchema, staffUpdateSchema, stationSchema } from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Errors } from '../../common/errors.js';
import type { StaffPrincipal } from '../../common/auth/principal.js';
import { OutboxService } from '../outbox/outbox.service.js';

type StationInput = z.infer<typeof stationSchema>;
type PrinterInput = z.infer<typeof printerSchema>;
type StaffCreateInput = z.infer<typeof staffCreateSchema>;
type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
type RoleInput = z.infer<typeof roleSchema>;

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  // ───────── Cơ sở ─────────

  listBranches(principal: StaffPrincipal) {
    const all = principal.permissions.includes('*') || principal.permissions.includes('report.all');
    return this.prisma.branch.findMany({
      where: all ? { orgId: principal.orgId } : { id: { in: principal.branchIds } },
      orderBy: { code: 'asc' },
    });
  }

  async getBranch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { areas: { orderBy: { sortOrder: 'asc' } }, stations: { orderBy: { sortOrder: 'asc' } }, printers: true },
    });
    if (!branch) throw Errors.notFound('cơ sở');
    return branch;
  }

  async updateBranch(branchId: string, input: BranchUpdateInput, by: StaffPrincipal) {
    const before = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!before) throw Errors.notFound('cơ sở');
    const { openingHours, settings, ...rest } = input;
    const after = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id: branchId },
        data: { ...rest, openingHours: openingHours as Prisma.InputJsonValue | undefined, settings: settings as Prisma.InputJsonValue | undefined },
      });
      await tx.auditLog.create({
        data: { orgId: before.orgId, branchId, actorStaffId: by.staffId, action: 'branch.update', entityType: 'Branch', entityId: branchId, before: toJson(before), after: toJson(updated) },
      });
      await this.outbox.append(tx, { type: 'branch.updated', aggregateType: 'branch', aggregateId: branchId, branchId, payload: { fields: Object.keys(rest) }, actorStaffId: by.staffId });
      return updated;
    });
    return after;
  }

  // ───────── Khu vực và bàn ─────────

  listAreas(branchId: string) {
    return this.prisma.area.findMany({ where: { branchId }, orderBy: { sortOrder: 'asc' }, include: { tables: { orderBy: { sortOrder: 'asc' } } } });
  }

  createArea(branchId: string, input: AreaInput) {
    return this.prisma.area.create({ data: { ...input, branchId, minSpend: toBigInt(input.minSpend), layout: (input.layout ?? {}) as Prisma.InputJsonValue } });
  }

  async updateArea(branchId: string, areaId: string, input: Partial<AreaInput>) {
    await this.ensureArea(branchId, areaId);
    return this.prisma.area.update({ where: { id: areaId }, data: { ...input, minSpend: toBigInt(input.minSpend), layout: input.layout as Prisma.InputJsonValue | undefined } });
  }

  async createTable(branchId: string, input: TableInput) {
    await this.ensureArea(branchId, input.areaId);
    return this.prisma.diningTable.create({ data: { ...input, branchId, minSpend: toBigInt(input.minSpend), qrToken: newQrToken() } });
  }

  async updateTable(branchId: string, tableId: string, input: Partial<TableInput>) {
    const table = await this.prisma.diningTable.findFirst({ where: { id: tableId, branchId } });
    if (!table) throw Errors.notFound('bàn');
    if (input.areaId) await this.ensureArea(branchId, input.areaId);
    return this.prisma.diningTable.update({ where: { id: tableId }, data: { ...input, minSpend: toBigInt(input.minSpend) } });
  }

  async updateTableLayout(branchId: string, tables: { id: string; posX: number; posY: number; width?: number; height?: number; rotation?: number }[]) {
    await this.prisma.$transaction(
      tables.map((t) => this.prisma.diningTable.updateMany({ where: { id: t.id, branchId }, data: { posX: t.posX, posY: t.posY, width: t.width, height: t.height, rotation: t.rotation } })),
    );
    return this.listAreas(branchId);
  }

  /** Đổi mã QR của bàn (khi in lại hoặc nghi ngờ lộ). */
  async rotateTableQr(branchId: string, tableId: string) {
    const table = await this.prisma.diningTable.findFirst({ where: { id: tableId, branchId } });
    if (!table) throw Errors.notFound('bàn');
    return this.prisma.diningTable.update({ where: { id: tableId }, data: { qrToken: newQrToken() } });
  }

  private async ensureArea(branchId: string, areaId: string) {
    const area = await this.prisma.area.findFirst({ where: { id: areaId, branchId } });
    if (!area) throw Errors.notFound('khu vực');
    return area;
  }

  // ───────── Trạm và máy in ─────────

  listStations(branchId: string) {
    return this.prisma.station.findMany({ where: { branchId }, orderBy: { sortOrder: 'asc' }, include: { printer: true } });
  }
  createStation(branchId: string, input: StationInput) {
    return this.prisma.station.create({ data: { ...input, branchId } });
  }
  async updateStation(branchId: string, stationId: string, input: Partial<StationInput>) {
    const s = await this.prisma.station.findFirst({ where: { id: stationId, branchId } });
    if (!s) throw Errors.notFound('trạm');
    return this.prisma.station.update({ where: { id: stationId }, data: input });
  }
  listPrinters(branchId: string) {
    return this.prisma.printer.findMany({ where: { branchId }, orderBy: { code: 'asc' } });
  }
  createPrinter(branchId: string, input: PrinterInput) {
    return this.prisma.printer.create({ data: { ...input, branchId } });
  }
  async updatePrinter(branchId: string, printerId: string, input: Partial<PrinterInput>) {
    const p = await this.prisma.printer.findFirst({ where: { id: printerId, branchId } });
    if (!p) throw Errors.notFound('máy in');
    return this.prisma.printer.update({ where: { id: printerId }, data: input });
  }

  // ───────── Nhân sự, vai trò, thiết bị ─────────

  listRoles(orgId: string) {
    return this.prisma.role.findMany({ where: { orgId }, orderBy: { code: 'asc' } });
  }
  createRole(orgId: string, input: RoleInput) {
    return this.prisma.role.create({ data: { ...input, orgId } });
  }
  async updateRole(orgId: string, roleId: string, input: Partial<RoleInput>) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, orgId } });
    if (!role) throw Errors.notFound('vai trò');
    if (role.isSystem && input.code && input.code !== role.code) throw Errors.invalid('SYSTEM_ROLE', 'Không đổi mã vai trò hệ thống');
    return this.prisma.role.update({ where: { id: roleId }, data: input });
  }

  listStaff(principal: StaffPrincipal, branchId?: string) {
    return this.prisma.staff.findMany({
      where: { orgId: principal.orgId, ...(branchId ? { branches: { some: { branchId } } } : {}) },
      select: STAFF_PUBLIC_SELECT,
      orderBy: { fullName: 'asc' },
    });
  }

  async createStaff(principal: StaffPrincipal, input: StaffCreateInput) {
    const { branchIds, pin, password, ...rest } = input;
    return this.prisma.staff.create({
      data: {
        ...rest,
        code: rest.code.toUpperCase(),
        orgId: principal.orgId,
        pinHash: pin ? hashSecret(pin) : null,
        passwordHash: password ? hashSecret(password) : null,
        branches: { create: branchIds.map((branchId, i) => ({ branchId, isDefault: i === 0 })) },
      },
      select: STAFF_PUBLIC_SELECT,
    });
  }

  async updateStaff(principal: StaffPrincipal, staffId: string, input: StaffUpdateInput) {
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, orgId: principal.orgId } });
    if (!staff) throw Errors.notFound('nhân viên');
    const { branchIds, pin, password, ...rest } = input;
    return this.prisma.$transaction(async (tx) => {
      if (branchIds) {
        await tx.staffBranch.deleteMany({ where: { staffId } });
        await tx.staffBranch.createMany({ data: branchIds.map((branchId, i) => ({ staffId, branchId, isDefault: i === 0 })) });
      }
      const updated = await tx.staff.update({
        where: { id: staffId },
        data: {
          ...rest,
          code: rest.code?.toUpperCase(),
          ...(pin ? { pinHash: hashSecret(pin), failedPinAttempts: 0, lockedUntil: null } : {}),
          ...(password ? { passwordHash: hashSecret(password) } : {}),
        },
        select: STAFF_PUBLIC_SELECT,
      });
      await tx.auditLog.create({
        data: { orgId: principal.orgId, actorStaffId: principal.staffId, action: 'staff.update', entityType: 'Staff', entityId: staffId, after: toJson({ ...rest, branchIds, pinChanged: !!pin, passwordChanged: !!password }) },
      });
      return updated;
    });
  }

  listDevices(branchId: string) {
    return this.prisma.device.findMany({ where: { branchId }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, kind: true, isActive: true, lastSeenAt: true, defaultStationId: true, createdAt: true } });
  }
}

/** Trường nhân viên được phép trả về client. Tuyệt đối không có pinHash/passwordHash. */
const STAFF_PUBLIC_SELECT = {
  id: true,
  code: true,
  fullName: true,
  phone: true,
  email: true,
  isActive: true,
  avatarUrl: true,
  lockedUntil: true,
  failedPinAttempts: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, code: true, name: true } },
  branches: { select: { branchId: true, isDefault: true } },
} as const;

function toBigInt(value: number | null | undefined): bigint | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return BigInt(value);
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

function newQrToken(): string {
  return randomBytes(9).toString('base64url');
}
