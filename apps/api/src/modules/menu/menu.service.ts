import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { Prisma } from '@dalan/db';
import { businessDate, isWithinSchedule, type Schedule } from '@dalan/domain';
import { DomainEvents, type BranchMenuItemView, type BranchMenuView, type CategoryInput, type MenuInput, type MenuItemInput, type ModifierGroupInput } from '@dalan/contracts';
import type { z } from 'zod';
import type { branchItemOverrideSchema, menuItemUpdateSchema } from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { Errors } from '../../common/errors.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { serializeDbValues } from '../../common/interceptors/bigint.interceptor.js';

type OverrideInput = z.infer<typeof branchItemOverrideSchema>;
type MenuItemUpdateInput = z.infer<typeof menuItemUpdateSchema>;

const CACHE_TTL_SECONDS = 60;

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // ───────── Thực đơn theo cơ sở (POS và app khách) ─────────

  async branchMenu(branchId: string, now = new Date()): Promise<BranchMenuView> {
    const cacheKey = `menu:branch:${branchId}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      const view = JSON.parse(cached) as BranchMenuView;
      return this.applyOpenNow(view, now);
    }
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw Errors.notFound('cơ sở');
    const menus = await this.prisma.menu.findMany({
      where: { isActive: true, branches: { some: { branchId } } },
      orderBy: { sortOrder: 'asc' },
      include: {
        categories: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            items: {
              where: { status: 'ACTIVE' },
              orderBy: { sortOrder: 'asc' },
              include: {
                variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
                modifierGroups: { orderBy: { sortOrder: 'asc' }, include: { group: { include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } } } },
                overrides: { where: { branchId } },
              },
            },
          },
        },
      },
    });
    const view: BranchMenuView = {
      branch: { id: branch.id, code: branch.code, name: branch.name, qrOrderMode: branch.qrOrderMode, priceIncludesVat: branch.priceIncludesVat, vatRateBps: branch.vatRateBps, serviceChargeBps: branch.serviceChargeBps },
      generatedAt: now.toISOString(),
      menus: menus.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        nameEn: m.nameEn,
        kind: m.kind,
        schedule: m.schedule as Schedule,
        isOpenNow: true,
        categories: m.categories
          .map((c) => ({
            id: c.id,
            code: c.code,
            name: c.name,
            nameEn: c.nameEn,
            imageUrl: c.imageUrl,
            schedule: c.schedule as Schedule,
            isOpenNow: true,
            items: c.items
              .map((it) => {
                const ov = it.overrides[0];
                if (ov && !ov.isAvailable) return null;
                const soldOut = !!ov?.soldOutUntil && ov.soldOutUntil > now;
                const price = ov?.price ?? it.basePrice;
                const item: BranchMenuItemView = {
                  id: it.id,
                  code: it.code,
                  name: it.name,
                  nameEn: it.nameEn,
                  description: it.description,
                  descriptionEn: it.descriptionEn,
                  unit: it.unit,
                  pricingMode: it.pricingMode,
                  price: price === null ? null : Number(price),
                  vatRateBps: it.vatRateBps ?? branch.vatRateBps,
                  imageUrl: it.imageUrl,
                  isVegetarian: it.isVegetarian,
                  isSignature: it.isSignature,
                  isSpicy: it.isSpicy,
                  countEmpties: it.countEmpties,
                  tags: it.tags,
                  allergens: it.allergens,
                  stationCode: ov?.stationCode ?? it.defaultStationCode ?? c.defaultStationCode,
                  isAvailable: true,
                  soldOut: soldOut || (ov?.stockLeft !== null && ov?.stockLeft !== undefined && ov.stockLeft <= 0),
                  stockLeft: ov?.stockLeft ?? null,
                  variants: it.variants.map((v) => ({ id: v.id, code: v.code, name: v.name, nameEn: v.nameEn, price: Number(v.price), isDefault: v.isDefault })),
                  modifierGroups: it.modifierGroups.map(({ group }) => ({
                    id: group.id,
                    code: group.code,
                    name: group.name,
                    nameEn: group.nameEn,
                    minSelect: group.minSelect,
                    maxSelect: group.maxSelect,
                    isRequired: group.isRequired,
                    options: group.options.map((o) => ({ id: o.id, code: o.code, name: o.name, nameEn: o.nameEn, priceDelta: Number(o.priceDelta), isDefault: o.isDefault })),
                  })),
                };
                return item;
              })
              .filter((x): x is BranchMenuItemView => x !== null),
          }))
          .filter((c) => c.items.length > 0),
      })),
    };
    await this.redis.set(cacheKey, JSON.stringify(view), 'EX', CACHE_TTL_SECONDS).catch(() => undefined);
    return this.applyOpenNow(view, now);
  }

  private applyOpenNow(view: BranchMenuView, now: Date): BranchMenuView {
    for (const m of view.menus) {
      m.isOpenNow = isWithinSchedule(m.schedule, now);
      for (const c of m.categories) c.isOpenNow = m.isOpenNow && isWithinSchedule(c.schedule, now);
    }
    return view;
  }

  async invalidateBranchMenus(branchIds?: string[]): Promise<void> {
    const ids = branchIds ?? (await this.prisma.branch.findMany({ select: { id: true } })).map((b) => b.id);
    if (ids.length) await this.redis.del(...ids.map((id) => `menu:branch:${id}`)).catch(() => undefined);
  }

  /** Tải một món kèm biến thể, tùy chọn và ghi đè theo cơ sở để tính giá khi gọi món. */
  async loadItemsForOrdering(branchId: string, itemIds: string[]) {
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: itemIds } },
      include: {
        category: { select: { defaultStationCode: true, schedule: true, menu: { select: { schedule: true, branches: { where: { branchId } } } } } },
        variants: true,
        modifierGroups: { include: { group: { include: { options: true } } } },
        overrides: { where: { branchId } },
      },
    });
    return new Map(items.map((i) => [i.id, i]));
  }

  // ───────── Quản trị ─────────

  listMenus(orgId: string) {
    return this.prisma.menu.findMany({ where: { orgId }, orderBy: { sortOrder: 'asc' }, include: { branches: true, categories: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { items: true } } } } } });
  }

  async createMenu(orgId: string, input: MenuInput) {
    const { branchIds, ...rest } = input;
    const menu = await this.prisma.menu.create({ data: { ...rest, orgId, branches: branchIds ? { create: branchIds.map((branchId) => ({ branchId })) } : undefined } });
    await this.invalidateBranchMenus();
    return menu;
  }

  async updateMenu(orgId: string, menuId: string, input: Partial<MenuInput>) {
    const { branchIds, ...rest } = input;
    const menu = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.menu.findFirst({ where: { id: menuId, orgId } });
      if (!existing) throw Errors.notFound('thực đơn');
      if (branchIds) {
        await tx.menuBranch.deleteMany({ where: { menuId } });
        await tx.menuBranch.createMany({ data: branchIds.map((branchId) => ({ menuId, branchId })) });
      }
      return tx.menu.update({ where: { id: menuId }, data: rest, include: { branches: true } });
    });
    await this.invalidateBranchMenus();
    return menu;
  }

  async createCategory(orgId: string, input: CategoryInput) {
    const menu = await this.prisma.menu.findFirst({ where: { id: input.menuId, orgId } });
    if (!menu) throw Errors.notFound('thực đơn');
    const category = await this.prisma.menuCategory.create({ data: input });
    await this.invalidateBranchMenus();
    return category;
  }

  async updateCategory(orgId: string, categoryId: string, input: Partial<CategoryInput>) {
    const cat = await this.prisma.menuCategory.findFirst({ where: { id: categoryId, menu: { orgId } } });
    if (!cat) throw Errors.notFound('danh mục');
    const updated = await this.prisma.menuCategory.update({ where: { id: categoryId }, data: input });
    await this.invalidateBranchMenus();
    return updated;
  }

  listItems(orgId: string, query: { categoryId?: string; menuId?: string; search?: string; status?: string }) {
    return this.prisma.menuItem.findMany({
      where: {
        orgId,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.menuId ? { category: { menuId: query.menuId } } : {}),
        ...(query.status ? { status: query.status as 'ACTIVE' | 'HIDDEN' | 'DISCONTINUED' } : {}),
        ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { code: { contains: query.search.toUpperCase() } }] } : {}),
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { category: { select: { id: true, code: true, name: true, menuId: true } }, variants: { orderBy: { sortOrder: 'asc' } }, modifierGroups: { include: { group: { include: { options: true } } } }, overrides: true },
    });
  }

  async getItem(orgId: string, itemId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: itemId, orgId },
      include: { category: true, variants: { orderBy: { sortOrder: 'asc' } }, modifierGroups: { include: { group: { include: { options: true } } } }, overrides: true, priceHistory: { orderBy: { changedAt: 'desc' }, take: 20 } },
    });
    if (!item) throw Errors.notFound('món');
    return item;
  }

  async createItem(orgId: string, input: MenuItemInput, by: string) {
    const { variants, modifierGroupIds, ...rest } = input;
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({
        data: {
          ...rest,
          orgId,
          code: rest.code.toUpperCase(),
          basePrice: rest.basePrice === null || rest.basePrice === undefined ? null : BigInt(rest.basePrice),
          variants: variants ? { create: variants.map((v) => ({ ...v, price: BigInt(v.price) })) } : undefined,
          modifierGroups: modifierGroupIds ? { create: modifierGroupIds.map((groupId, i) => ({ groupId, sortOrder: i })) } : undefined,
        },
      });
      await tx.priceHistory.create({ data: { itemId: created.id, newPrice: created.basePrice, changedById: by, reason: 'Tạo món' } });
      await this.outbox.append(tx, { type: DomainEvents.menuChanged, aggregateType: 'menuItem', aggregateId: created.id, payload: { action: 'created' }, actorStaffId: by });
      return created;
    });
    await this.invalidateBranchMenus();
    return item;
  }

  async updateItem(orgId: string, itemId: string, input: MenuItemUpdateInput, by: string) {
    const { variants, modifierGroupIds, priceChangeReason, basePrice, ...rest } = input;
    const item = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.menuItem.findFirst({ where: { id: itemId, orgId } });
      if (!existing) throw Errors.notFound('món');
      const data: Prisma.MenuItemUpdateInput = { ...rest, code: rest.code?.toUpperCase() };
      if (basePrice !== undefined) {
        const next = basePrice === null ? null : BigInt(basePrice);
        data.basePrice = next;
        if (next !== existing.basePrice) {
          await tx.priceHistory.create({ data: { itemId, oldPrice: existing.basePrice, newPrice: next, changedById: by, reason: priceChangeReason ?? null } });
        }
      }
      if (variants) {
        await tx.menuItemVariant.deleteMany({ where: { itemId, code: { notIn: variants.map((v) => v.code) } } });
        for (const v of variants) {
          await tx.menuItemVariant.upsert({ where: { itemId_code: { itemId, code: v.code } }, update: { ...v, price: BigInt(v.price) }, create: { ...v, itemId, price: BigInt(v.price) } });
        }
      }
      if (modifierGroupIds) {
        await tx.menuItemModifierGroup.deleteMany({ where: { itemId } });
        await tx.menuItemModifierGroup.createMany({ data: modifierGroupIds.map((groupId, i) => ({ itemId, groupId, sortOrder: i })) });
      }
      const updated = await tx.menuItem.update({ where: { id: itemId }, data });
      await this.outbox.append(tx, { type: DomainEvents.menuChanged, aggregateType: 'menuItem', aggregateId: itemId, payload: { action: 'updated', fields: Object.keys(rest) }, actorStaffId: by });
      return updated;
    });
    await this.invalidateBranchMenus();
    return item;
  }

  listModifierGroups(orgId: string) {
    return this.prisma.modifierGroup.findMany({ where: { orgId }, orderBy: { code: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } }, _count: { select: { items: true } } } });
  }

  async upsertModifierGroup(orgId: string, input: ModifierGroupInput, groupId?: string) {
    const { options, ...rest } = input;
    const group = await this.prisma.$transaction(async (tx) => {
      const g = groupId
        ? await tx.modifierGroup.update({ where: { id: groupId }, data: rest })
        : await tx.modifierGroup.create({ data: { ...rest, orgId } });
      if (g.orgId !== orgId) throw Errors.notFound('nhóm tùy chọn');
      await tx.modifierOption.deleteMany({ where: { groupId: g.id, code: { notIn: options.map((o) => o.code) } } });
      for (const o of options) {
        await tx.modifierOption.upsert({ where: { groupId_code: { groupId: g.id, code: o.code } }, update: { ...o, priceDelta: BigInt(o.priceDelta) }, create: { ...o, groupId: g.id, priceDelta: BigInt(o.priceDelta) } });
      }
      return tx.modifierGroup.findUniqueOrThrow({ where: { id: g.id }, include: { options: { orderBy: { sortOrder: 'asc' } } } });
    });
    await this.invalidateBranchMenus();
    return group;
  }

  async setOverride(branchId: string, itemId: string, input: OverrideInput) {
    const override = await this.prisma.branchItemOverride.upsert({
      where: { branchId_itemId: { branchId, itemId } },
      update: { ...input, price: input.price === undefined ? undefined : input.price === null ? null : BigInt(input.price), stockLeft: input.stockLimit ?? undefined },
      create: { branchId, itemId, ...input, price: input.price === null || input.price === undefined ? null : BigInt(input.price), stockLeft: input.stockLimit ?? null },
    });
    await this.invalidateBranchMenus([branchId]);
    return override;
  }

  /** Đánh dấu hết món theo ngày kinh doanh hoặc vô thời hạn; `clear` mở bán lại. */
  async setSoldOut(branchId: string, itemId: string, mode: 'today' | 'indefinite' | 'clear', by: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw Errors.notFound('cơ sở');
    let soldOutUntil: Date | null = null;
    if (mode === 'today') {
      const today = businessDate(new Date(), branch.businessDayCutoff, branch.timezone);
      const [h, m] = branch.businessDayCutoff.split(':').map(Number);
      const next = new Date(`${today}T00:00:00+07:00`);
      next.setUTCDate(next.getUTCDate() + 1);
      next.setUTCHours((next.getUTCHours() + (h ?? 4)) % 24, m ?? 0);
      soldOutUntil = next;
    } else if (mode === 'indefinite') {
      soldOutUntil = new Date('2099-12-31T00:00:00Z');
    }
    const override = await this.prisma.$transaction(async (tx) => {
      const ov = await tx.branchItemOverride.upsert({
        where: { branchId_itemId: { branchId, itemId } },
        update: { soldOutUntil },
        create: { branchId, itemId, soldOutUntil },
      });
      await this.outbox.append(tx, { type: DomainEvents.itemSoldOut, aggregateType: 'menuItem', aggregateId: itemId, branchId, payload: { itemId, soldOut: soldOutUntil !== null, soldOutUntil }, actorStaffId: by });
      return ov;
    });
    await this.invalidateBranchMenus([branchId]);
    return serializeDbValues(override);
  }
}
