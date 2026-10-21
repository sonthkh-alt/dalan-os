import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Prisma } from '@dalan/db';
import { maskPhone, normalizeVnPhone, resolveTier, toLocal } from '@dalan/domain';
import {
  DomainEvents,
  NotificationTemplates,
  type CustomerCreateInput,
  type CustomerUpdateInput,
  type FeedbackInput,
  type VoucherCreateInput,
} from '@dalan/contracts';
import type { z } from 'zod';
import type { campaignSchema, loyaltyTierSchema } from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { Errors } from '../../common/errors.js';
import { hasPermission, type StaffPrincipal } from '../../common/auth/principal.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { MessagingService } from '../notifications/messaging.service.js';

type TierInput = z.infer<typeof loyaltyTierSchema>;
type CampaignInput = z.infer<typeof campaignSchema>;

@Injectable()
export class CustomersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Customers');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly messaging: MessagingService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    if (process.env.CUSTOMER_WORKER === 'off') return;
    this.timer = setInterval(() => void this.dailyTick(), 10 * 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ───────────────── Hồ sơ ─────────────────

  /** Che số điện thoại nếu người xem không có quyền customer.phone.view_full. */
  private present<T extends { phone: string }>(customer: T, viewer: StaffPrincipal): T & { phoneMasked: boolean } {
    const full = hasPermission(viewer.permissions, 'customer.phone.view_full');
    return { ...customer, phone: full ? customer.phone : maskPhone(customer.phone), phoneMasked: !full };
  }

  async search(viewer: StaffPrincipal, query: { page: number; pageSize: number; q?: string; tag?: string; tierId?: string; birthdayMonth?: number }) {
    const q = query.q?.trim();
    const phoneLike = q ? normalizeVnPhone(q) ?? (q.replace(/\D/g, '').length >= 4 ? q.replace(/\D/g, '') : null) : null;
    const where: Prisma.CustomerWhereInput = {
      orgId: viewer.orgId,
      deletedAt: null,
      ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { companyName: { contains: q, mode: 'insensitive' } }, ...(phoneLike ? [{ phone: { contains: phoneLike.replace(/^\+84/, '') } }] : []), { email: { contains: q, mode: 'insensitive' } }] } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.tierId ? { tierId: query.tierId } : {}),
    };
    let [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { tier: { select: { code: true, name: true } } } }),
      this.prisma.customer.count({ where }),
    ]);
    if (query.birthdayMonth) {
      items = items.filter((c) => c.birthday && c.birthday.getUTCMonth() + 1 === query.birthdayMonth);
      total = items.length;
    }
    return { items: items.map((c) => this.present(c, viewer)), page: query.page, pageSize: query.pageSize, total };
  }

  async get(viewer: StaffPrincipal, customerId: string) {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, orgId: viewer.orgId },
      include: {
        tier: true,
        bills: { where: { status: 'PAID' }, orderBy: { closedAt: 'desc' }, take: 20, select: { id: true, code: true, total: true, closedAt: true, branchId: true, session: { select: { code: true, guestCount: true } } } },
        reservations: { orderBy: { reservedAt: 'desc' }, take: 20, select: { id: true, code: true, status: true, reservedAt: true, partySize: true, branchId: true } },
        pointsTx: { orderBy: { createdAt: 'desc' }, take: 50 },
        vouchers: { orderBy: { createdAt: 'desc' }, take: 20 },
        feedback: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!c) throw Errors.notFound('khách hàng');
    const spend12m = await this.spend12m(c.id);
    return { ...this.present(c, viewer), spend12m };
  }

  async create(viewer: StaffPrincipal, input: CustomerCreateInput) {
    const phone = normalizeVnPhone(input.phone);
    if (!phone) throw Errors.invalid('INVALID_PHONE', 'Số điện thoại không hợp lệ');
    const existing = await this.prisma.customer.findUnique({ where: { orgId_phone: { orgId: viewer.orgId, phone } } });
    if (existing) throw Errors.conflict('CUSTOMER_EXISTS', 'Số điện thoại đã có hồ sơ', { customerId: existing.id });
    const { birthday, ...rest } = input;
    const c = await this.prisma.customer.create({ data: { ...rest, phone, orgId: viewer.orgId, birthday: birthday ? new Date(`${birthday}T00:00:00Z`) : null, consentAt: input.marketingConsent ? new Date() : null, source: 'staff' } });
    return this.present(c, viewer);
  }

  async update(viewer: StaffPrincipal, customerId: string, input: CustomerUpdateInput) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, orgId: viewer.orgId } });
    if (!c) throw Errors.notFound('khách hàng');
    const { birthday, phone, ...rest } = input;
    const data: Prisma.CustomerUncheckedUpdateInput = { ...rest };
    if (phone !== undefined) {
      const normalized = normalizeVnPhone(phone);
      if (!normalized) throw Errors.invalid('INVALID_PHONE', 'Số điện thoại không hợp lệ');
      data.phone = normalized;
    }
    if (birthday !== undefined) data.birthday = birthday ? new Date(`${birthday}T00:00:00Z`) : null;
    if (input.marketingConsent === true && !c.marketingConsent) data.consentAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.customer.update({ where: { id: customerId }, data });
      await tx.auditLog.create({ data: { orgId: viewer.orgId, actorStaffId: viewer.staffId, action: 'customer.update', entityType: 'Customer', entityId: customerId, after: input as Prisma.InputJsonValue } });
      return u;
    });
    return this.present(updated, viewer);
  }

  /** Gộp hồ sơ trùng: chuyển toàn bộ lịch sử sang hồ sơ giữ lại, ẩn danh hồ sơ nguồn. */
  async merge(viewer: StaffPrincipal, sourceId: string, targetId: string) {
    if (sourceId === targetId) throw Errors.invalid('SAME_CUSTOMER', 'Hai hồ sơ phải khác nhau');
    const [source, target] = await Promise.all([this.prisma.customer.findFirst({ where: { id: sourceId, orgId: viewer.orgId, deletedAt: null } }), this.prisma.customer.findFirst({ where: { id: targetId, orgId: viewer.orgId, deletedAt: null } })]);
    if (!source || !target) throw Errors.notFound('hồ sơ khách');
    await this.prisma.$transaction(async (tx) => {
      const move = { where: { customerId: sourceId }, data: { customerId: targetId } };
      await tx.tableSession.updateMany(move);
      await tx.guestParticipant.updateMany(move);
      await tx.bill.updateMany(move);
      await tx.reservation.updateMany(move);
      await tx.voucher.updateMany(move);
      await tx.pointsTransaction.updateMany(move);
      await tx.feedback.updateMany(move);
      await tx.notificationLog.updateMany(move);
      await tx.eventBooking.updateMany(move);
      await tx.refreshToken.updateMany({ where: { customerId: sourceId }, data: { revokedAt: new Date() } });
      const balance = target.pointsBalance + source.pointsBalance;
      if (source.pointsBalance !== 0) {
        await tx.pointsTransaction.create({ data: { customerId: targetId, kind: 'ADJUST', points: source.pointsBalance, balanceAfter: balance, reason: `Gộp hồ sơ ${source.phone}`, createdById: viewer.staffId } });
      }
      await tx.customer.update({
        where: { id: targetId },
        data: {
          pointsBalance: balance,
          lifetimeSpend: { increment: source.lifetimeSpend },
          visitCount: { increment: source.visitCount },
          fullName: target.fullName ?? source.fullName,
          email: target.email ?? source.email,
          birthday: target.birthday ?? source.birthday,
          companyName: target.companyName ?? source.companyName,
          taxCode: target.taxCode ?? source.taxCode,
          tags: [...new Set([...target.tags, ...source.tags])],
          notes: [target.notes, source.notes].filter(Boolean).join('\n') || null,
          firstVisitAt: minDate(target.firstVisitAt, source.firstVisitAt),
          lastVisitAt: maxDate(target.lastVisitAt, source.lastVisitAt),
          marketingConsent: target.marketingConsent || source.marketingConsent,
        },
      });
      await tx.customer.update({ where: { id: sourceId }, data: { phone: `merged:${sourceId}`, fullName: null, email: null, zaloUserId: null, notes: `Đã gộp vào ${targetId}`, isAnonymized: true, deletedAt: new Date(), pointsBalance: 0 } });
      await tx.auditLog.create({ data: { orgId: viewer.orgId, actorStaffId: viewer.staffId, action: 'customer.merge', entityType: 'Customer', entityId: targetId, before: { sourceId, sourcePhone: source.phone }, after: { pointsBalance: balance } } });
    });
    return this.get(viewer, targetId);
  }

  /** Gắn khách vào phiên bàn (tạo hồ sơ mới theo số điện thoại nếu chưa có). */
  async attachToSession(viewer: StaffPrincipal, sessionId: string, input: { customerId?: string; phone?: string; fullName?: string }) {
    const session = await this.prisma.tableSession.findUnique({ where: { id: sessionId } });
    if (!session) throw Errors.notFound('phiên bàn');
    let customer = input.customerId ? await this.prisma.customer.findFirst({ where: { id: input.customerId, orgId: viewer.orgId, deletedAt: null } }) : null;
    if (!customer && input.phone) {
      const phone = normalizeVnPhone(input.phone);
      if (!phone) throw Errors.invalid('INVALID_PHONE', 'Số điện thoại không hợp lệ');
      customer = (await this.prisma.customer.findUnique({ where: { orgId_phone: { orgId: viewer.orgId, phone } } })) ?? (await this.prisma.customer.create({ data: { orgId: viewer.orgId, phone, fullName: input.fullName ?? null, source: 'pos' } }));
    }
    if (!customer) throw Errors.notFound('khách hàng');
    await this.prisma.$transaction(async (tx) => {
      await tx.tableSession.update({ where: { id: sessionId }, data: { customerId: customer!.id } });
      await tx.bill.updateMany({ where: { sessionId, status: 'OPEN', customerId: null }, data: { customerId: customer!.id } });
      await this.outbox.append(tx, { type: DomainEvents.sessionUpdated, aggregateType: 'session', aggregateId: sessionId, branchId: session.branchId, payload: { sessionId, customerId: customer!.id }, actorStaffId: viewer.staffId });
    });
    return this.present(customer, viewer);
  }

  async anonymize(viewer: StaffPrincipal, customerId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, orgId: viewer.orgId } });
    if (!c) throw Errors.notFound('khách hàng');
    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customerId }, data: { phone: `deleted:${customerId}`, fullName: null, email: null, birthday: null, zaloUserId: null, avatarUrl: null, companyName: null, taxCode: null, companyAddress: null, notes: null, allergies: null, preferences: null, tags: [], marketingConsent: false, isAnonymized: true, deletedAt: new Date() } });
      await tx.refreshToken.updateMany({ where: { customerId }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { orgId: viewer.orgId, actorStaffId: viewer.staffId, action: 'customer.anonymize', entityType: 'Customer', entityId: customerId, reason: 'Yêu cầu xóa dữ liệu cá nhân' } });
    });
    return { id: customerId, isAnonymized: true };
  }

  // ───────────────── Hạng thành viên ─────────────────

  listTiers(orgId: string) {
    return this.prisma.loyaltyTier.findMany({ where: { orgId }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { customers: true } } } });
  }

  upsertTier(orgId: string, input: TierInput, tierId?: string) {
    const data = { ...input, minSpend12m: BigInt(input.minSpend12m), benefits: input.benefits as Prisma.InputJsonValue };
    return tierId ? this.prisma.loyaltyTier.update({ where: { id: tierId }, data }) : this.prisma.loyaltyTier.create({ data: { ...data, orgId } });
  }

  private async spend12m(customerId: string): Promise<number> {
    const agg = await this.prisma.bill.aggregate({ where: { customerId, status: 'PAID', closedAt: { gte: new Date(Date.now() - 365 * 24 * 3600_000) } }, _sum: { total: true } });
    return Number(agg._sum.total ?? 0);
  }

  /** Tính lại hạng theo chi tiêu 12 tháng cho một khách hoặc toàn bộ. */
  async recalcTiers(orgId: string, customerId?: string) {
    const tiers = await this.prisma.loyaltyTier.findMany({ where: { orgId } });
    if (tiers.length === 0) return { updated: 0 };
    const rules = tiers.map((t) => ({ code: t.code, minSpend12m: Number(t.minSpend12m) }));
    const customers = await this.prisma.customer.findMany({ where: { orgId, deletedAt: null, ...(customerId ? { id: customerId } : {}) }, select: { id: true, tierId: true } });
    let updated = 0;
    for (const c of customers) {
      const code = resolveTier(await this.spend12m(c.id), rules);
      const tier = tiers.find((t) => t.code === code);
      if (tier && tier.id !== c.tierId) {
        await this.prisma.customer.update({ where: { id: c.id }, data: { tierId: tier.id } });
        updated++;
      }
    }
    return { updated, total: customers.length };
  }

  // ───────────────── Điểm ─────────────────

  async adjustPoints(viewer: StaffPrincipal, customerId: string, points: number, reason: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, orgId: viewer.orgId, deletedAt: null } });
    if (!c) throw Errors.notFound('khách hàng');
    if (c.pointsBalance + points < 0) throw Errors.invalid('POINTS_NEGATIVE', 'Số dư điểm không được âm');
    const balance = c.pointsBalance + points;
    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customerId }, data: { pointsBalance: balance } });
      await tx.pointsTransaction.create({ data: { customerId, kind: 'ADJUST', points, balanceAfter: balance, reason, createdById: viewer.staffId } });
      await tx.auditLog.create({ data: { orgId: viewer.orgId, actorStaffId: viewer.staffId, action: 'customer.points.adjust', entityType: 'Customer', entityId: customerId, reason, after: { points, balance } } });
      await this.outbox.append(tx, { type: DomainEvents.customerPointsChanged, aggregateType: 'customer', aggregateId: customerId, payload: { customerId, balance, adjusted: points }, actorStaffId: viewer.staffId });
    });
    return { customerId, pointsBalance: balance };
  }

  pointsHistory(customerId: string) {
    return this.prisma.pointsTransaction.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 200, include: { bill: { select: { code: true, total: true } } } });
  }

  // ───────────────── Voucher ─────────────────

  async createVouchers(orgId: string, input: VoucherCreateInput) {
    const quantity = input.code ? 1 : input.quantity;
    const rows: Prisma.VoucherCreateManyInput[] = [];
    for (let i = 0; i < quantity; i++) {
      rows.push({
        orgId,
        code: (input.code ?? this.voucherCode()).toUpperCase(),
        kind: input.kind,
        value: BigInt(input.value),
        minBill: input.minBill !== undefined ? BigInt(input.minBill) : null,
        maxDiscount: input.maxDiscount !== undefined ? BigInt(input.maxDiscount) : null,
        branchIds: input.branchIds,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validTo: input.validTo ? new Date(input.validTo) : null,
        usageLimit: input.usageLimit,
        customerId: input.customerId ?? null,
        campaignId: input.campaignId ?? null,
      });
    }
    await this.prisma.voucher.createMany({ data: rows });
    return this.prisma.voucher.findMany({ where: { code: { in: rows.map((r) => r.code) } }, orderBy: { createdAt: 'desc' } });
  }

  listVouchers(orgId: string, query: { customerId?: string; code?: string; status?: string; campaignId?: string }) {
    return this.prisma.voucher.findMany({
      where: { orgId, ...(query.customerId ? { customerId: query.customerId } : {}), ...(query.code ? { code: { contains: query.code.toUpperCase() } } : {}), ...(query.status ? { status: query.status as 'ACTIVE' } : {}), ...(query.campaignId ? { campaignId: query.campaignId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { customer: { select: { id: true, fullName: true } }, campaign: { select: { code: true, name: true } } },
    });
  }

  async revokeVoucher(orgId: string, voucherId: string) {
    const v = await this.prisma.voucher.findFirst({ where: { id: voucherId, orgId } });
    if (!v) throw Errors.notFound('voucher');
    return this.prisma.voucher.update({ where: { id: voucherId }, data: { status: 'REVOKED' } });
  }

  /** Voucher còn hiệu lực của khách (cho app khách và POS). */
  async vouchersForCustomer(customerId: string) {
    const now = new Date();
    return this.prisma.voucher.findMany({ where: { customerId, status: 'ACTIVE', OR: [{ validTo: null }, { validTo: { gte: now } }] }, orderBy: { validTo: 'asc' } });
  }

  private voucherCode(): string {
    return `DL${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  // ───────────────── Chiến dịch ─────────────────

  listCampaigns(orgId: string) {
    return this.prisma.campaign.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { vouchers: true } } } });
  }

  upsertCampaign(orgId: string, input: CampaignInput, campaignId?: string) {
    const data = { ...input, rules: input.rules as Prisma.InputJsonValue, voucherTemplate: input.voucherTemplate === undefined ? undefined : (input.voucherTemplate as unknown as Prisma.InputJsonValue) };
    return campaignId ? this.prisma.campaign.update({ where: { id: campaignId }, data }) : this.prisma.campaign.create({ data: { ...data, orgId } });
  }

  /** Mỗi ngày một lần (sau 08:00 giờ VN): tặng voucher và gửi ZNS cho khách có sinh nhật trong 3 ngày tới. */
  async dailyTick(now = new Date()): Promise<{ birthdays: number }> {
    const local = toLocal(now);
    if (local.hour < 8) return { birthdays: 0 };
    const dateKey = `${local.year}-${local.month}-${local.day}`;
    const first = await this.redis.set(`dalan:customers:birthday:${dateKey}`, '1', 'EX', 36 * 3600, 'NX').catch(() => null);
    if (first !== 'OK') return { birthdays: 0 };
    return this.runBirthdayCampaign(now);
  }

  async runBirthdayCampaign(now = new Date()): Promise<{ birthdays: number }> {
    const campaigns = await this.prisma.campaign.findMany({ where: { kind: 'BIRTHDAY', isActive: true } });
    let birthdays = 0;
    for (const campaign of campaigns) {
      const daysAhead = Number((campaign.rules as { daysAhead?: number }).daysAhead ?? 3);
      const targets = new Set<string>();
      for (let d = 0; d <= daysAhead; d++) {
        const t = toLocal(new Date(now.getTime() + d * 24 * 3600_000));
        targets.add(`${t.month}-${t.day}`);
      }
      const customers = await this.prisma.customer.findMany({ where: { orgId: campaign.orgId, deletedAt: null, marketingConsent: true, birthday: { not: null } }, select: { id: true, fullName: true, phone: true, birthday: true } });
      for (const c of customers) {
        const b = c.birthday!;
        if (!targets.has(`${b.getUTCMonth() + 1}-${b.getUTCDate()}`)) continue;
        const yearKey = `${campaign.id}:${c.id}:${toLocal(now).year}`;
        const sentThisYear = await this.prisma.notificationLog.findFirst({ where: { customerId: c.id, templateCode: NotificationTemplates.birthday, refType: 'Campaign', refId: yearKey } });
        if (sentThisYear) continue;
        let voucherCode: string | null = null;
        const tpl = campaign.voucherTemplate as (Omit<VoucherCreateInput, 'code' | 'customerId' | 'campaignId' | 'quantity'> & { validDays?: number }) | null;
        if (tpl) {
          const [v] = await this.createVouchers(campaign.orgId, {
            ...tpl,
            branchIds: tpl.branchIds ?? [],
            usageLimit: tpl.usageLimit ?? 1,
            quantity: 1,
            customerId: c.id,
            campaignId: campaign.id,
            validFrom: now.toISOString(),
            validTo: new Date(now.getTime() + (tpl.validDays ?? 30) * 24 * 3600_000).toISOString(),
          });
          voucherCode = v?.code ?? null;
        }
        await this.messaging.notify({
          templateCode: campaign.templateCode ?? NotificationTemplates.birthday,
          recipient: c.phone,
          customerId: c.id,
          refType: 'Campaign',
          refId: yearKey,
          params: { name: c.fullName ?? 'Quý khách', voucher: voucherCode ?? '', campaign: campaign.name },
          fallbackText: `Da Lan chuc mung sinh nhat ${c.fullName ?? 'quy khach'}! ${voucherCode ? `Ma uu dai: ${voucherCode}.` : ''}`,
        });
        birthdays++;
      }
    }
    if (birthdays) this.logger.log(`Đã gửi ${birthdays} lời chúc sinh nhật`);
    return { birthdays };
  }

  // ───────────────── Đánh giá ─────────────────

  async createFeedback(input: FeedbackInput & { branchId?: string; sessionId?: string; customerId?: string | null; participantId?: string | null }) {
    let branchId = input.branchId;
    let sessionId = input.sessionId;
    let customerId = input.customerId ?? null;
    if (input.billId) {
      const bill = await this.prisma.bill.findUnique({ where: { id: input.billId }, select: { branchId: true, sessionId: true, customerId: true, status: true } });
      if (!bill) throw Errors.notFound('bill');
      if (sessionId && bill.sessionId !== sessionId) throw Errors.forbidden('Bill không thuộc phiên của bạn');
      branchId = bill.branchId;
      sessionId = bill.sessionId;
      customerId = customerId ?? bill.customerId;
    } else if (sessionId) {
      const session = await this.prisma.tableSession.findUnique({ where: { id: sessionId }, select: { branchId: true, customerId: true } });
      if (!session) throw Errors.notFound('phiên bàn');
      branchId = session.branchId;
      customerId = customerId ?? session.customerId;
    }
    if (!branchId) throw Errors.invalid('BRANCH_REQUIRED', 'Thiếu cơ sở');
    if (input.participantId) {
      const dup = await this.prisma.feedback.findFirst({ where: { participantId: input.participantId } });
      if (dup) throw Errors.conflict('FEEDBACK_EXISTS', 'Bạn đã gửi đánh giá cho bữa ăn này');
    }
    const feedback = await this.prisma.$transaction(async (tx) => {
      const f = await tx.feedback.create({ data: { branchId: branchId!, sessionId: sessionId ?? null, billId: input.billId ?? null, customerId, participantId: input.participantId ?? null, rating: input.rating, comment: input.comment ?? null, likedItemIds: input.likedItemIds, tags: input.tags } });
      await this.outbox.append(tx, { type: 'customer.feedback.created', aggregateType: 'feedback', aggregateId: f.id, branchId: branchId!, payload: { feedbackId: f.id, sessionId, rating: input.rating, lowRating: input.rating <= 2, comment: input.comment ?? null }, actorParticipantId: input.participantId ?? null });
      if (input.rating <= 2) {
        await this.outbox.append(tx, { type: 'customer.feedback.alert', aggregateType: 'feedback', aggregateId: f.id, branchId: branchId!, payload: { feedbackId: f.id, sessionId, rating: input.rating, comment: input.comment ?? null } });
      }
      return f;
    });
    return feedback;
  }

  listFeedback(branchId: string | undefined, query: { from?: string; to?: string; maxRating?: number; unhandled?: boolean }) {
    return this.prisma.feedback.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(query.from ? { createdAt: { gte: new Date(query.from) } } : {}),
        ...(query.to ? { createdAt: { lte: new Date(query.to) } } : {}),
        ...(query.maxRating ? { rating: { lte: query.maxRating } } : {}),
        ...(query.unhandled ? { handledAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { customer: { select: { id: true, fullName: true } }, session: { select: { code: true } }, bill: { select: { code: true, total: true } } },
    });
  }

  async respondFeedback(viewer: StaffPrincipal, feedbackId: string, response: string) {
    const f = await this.prisma.feedback.findUnique({ where: { id: feedbackId } });
    if (!f) throw Errors.notFound('đánh giá');
    return this.prisma.feedback.update({ where: { id: feedbackId }, data: { response, handledAt: new Date(), handledById: viewer.staffId } });
  }

  async feedbackStats(branchId: string | undefined, days = 30) {
    const since = new Date(Date.now() - days * 24 * 3600_000);
    const rows = await this.prisma.feedback.groupBy({ by: ['rating'], where: { ...(branchId ? { branchId } : {}), createdAt: { gte: since } }, _count: { _all: true } });
    const total = rows.reduce((s, r) => s + r._count._all, 0);
    const avg = total ? rows.reduce((s, r) => s + r.rating * r._count._all, 0) / total : null;
    return { days, total, average: avg === null ? null : Math.round(avg * 100) / 100, byRating: Object.fromEntries(rows.map((r) => [r.rating, r._count._all])) };
  }

  /** Hồ sơ của chính khách thành viên (app khách, Mini App). */
  async me(customerId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null }, include: { tier: { select: { code: true, name: true, benefits: true, earnMultiplierBps: true } } } });
    if (!c) throw Errors.notFound('khách hàng');
    const [vouchers, pointsTx, bills] = await Promise.all([
      this.vouchersForCustomer(customerId),
      this.prisma.pointsTransaction.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.bill.findMany({ where: { customerId, status: 'PAID' }, orderBy: { closedAt: 'desc' }, take: 20, select: { id: true, code: true, total: true, closedAt: true, branch: { select: { name: true } } } }),
    ]);
    return { id: c.id, phone: c.phone, fullName: c.fullName, email: c.email, birthday: c.birthday, tier: c.tier, pointsBalance: c.pointsBalance, lifetimeSpend: c.lifetimeSpend, visitCount: c.visitCount, marketingConsent: c.marketingConsent, vouchers, pointsTx, bills };
  }

  async updateMe(customerId: string, input: { fullName?: string; email?: string | null; birthday?: string | null; marketingConsent?: boolean }) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!c) throw Errors.notFound('khách hàng');
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { fullName: input.fullName, email: input.email, birthday: input.birthday === undefined ? undefined : input.birthday ? new Date(`${input.birthday}T00:00:00Z`) : null, marketingConsent: input.marketingConsent, consentAt: input.marketingConsent && !c.marketingConsent ? new Date() : undefined },
    });
    return this.me(customerId);
  }
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
