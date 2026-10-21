import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Redis } from 'ioredis';
import QRCode from 'qrcode';
import { Prisma } from '@dalan/db';
import {
  allocateProportional,
  billTransferPurpose,
  buildVietQrPayload,
  businessDate,
  cashChange,
  computeBill,
  documentCode,
  earnPoints,
  reconcileEmpties,
  redeemablePoints,
  settlement,
  type BillDiscountInput as DomainDiscount,
} from '@dalan/domain';
import { DomainEvents, type AddPaymentInput, type BillDiscountInput, type CreateBillInput, type TaxInvoiceInfo } from '@dalan/contracts';
import type { z } from 'zod';
import type { cashMovementSchema, refundSchema } from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { Errors } from '../../common/errors.js';
import { hasPermission, type StaffPrincipal } from '../../common/auth/principal.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { AuthService } from '../auth/auth.service.js';
import { DiningService } from '../dining/dining.service.js';
import { PrintingService } from '../printing/printing.service.js';
import { BILLABLE_STATUSES } from '../dining/totals.js';

type Tx = Prisma.TransactionClient;
const DEFAULT_DISCOUNT_LIMIT_BPS = 1000;

/** Token để lấy PaymentsService qua ModuleRef (tránh import vòng giữa billing và payments). */
export const PAYMENTS_GATEWAY = 'PAYMENTS_GATEWAY';
const GATEWAY_METHODS = new Set(['VNPAY', 'MOMO', 'ZALOPAY', 'APPLE_PAY', 'GOOGLE_PAY']);
interface PaymentsGateway {
  createIntentForBill(billId: string, input: { method: 'VNPAY' | 'MOMO' | 'ZALOPAY' | 'APPLE_PAY' | 'GOOGLE_PAY'; amount?: number; channel: 'web' | 'mini_app' | 'pos' }, actor: StaffPrincipal, clientIp: string): Promise<{ bill: unknown; payment: unknown; intent: { redirectUrl: string | null; qrCode: string | null; deeplink: string | null; id: string } }>;
  refundIntent(intentId: string, amount: number, reason: string): Promise<{ externalRef: string | null }>;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly auth: AuthService,
    private readonly dining: DiningService,
    private readonly printing: PrintingService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly moduleRef: ModuleRef,
  ) {}

  // ───────────────── Tạo bill ─────────────────

  async createBill(sessionId: string, input: CreateBillInput, staff: StaffPrincipal) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: { branch: true, tables: { where: { releasedAt: null }, include: { table: { include: { area: true } } } }, orderLines: { include: { billLines: { include: { bill: { select: { status: true } } } } } }, customer: true },
    });
    if (!session) throw Errors.notFound('phiên bàn');
    if (!['OPEN', 'BILL_REQUESTED'].includes(session.status)) throw Errors.state('Phiên bàn không ở trạng thái có thể thanh toán');
    const branch = session.branch;
    const area = session.tables[0]?.table.area;
    const serviceChargeBps = area?.serviceChargeBps ?? branch.serviceChargeBps;

    // Dòng còn phần chưa nằm trong bill hợp lệ
    const remainingShare = (l: (typeof session.orderLines)[number]) => 1 - l.billLines.filter((b) => b.bill.status !== 'VOID').reduce((s, b) => s + Number(b.quantityShare), 0);
    let candidates = session.orderLines.filter((l) => BILLABLE_STATUSES.has(l.status) && remainingShare(l) > 0.000001);
    if (input.mode === 'BY_ITEM') {
      if (!input.lineIds?.length) throw Errors.invalid('LINES_REQUIRED', 'Chọn ít nhất một món');
      candidates = candidates.filter((l) => input.lineIds!.includes(l.id));
    } else if (input.mode === 'BY_PARTICIPANT') {
      if (!input.participantId) throw Errors.invalid('PARTICIPANT_REQUIRED', 'Chọn khách');
      candidates = candidates.filter((l) => l.participantId === input.participantId);
    }
    if (candidates.length === 0) throw Errors.state('Không còn món nào để thanh toán');
    const draftPending = session.orderLines.some((l) => l.status === 'DRAFT' || l.status === 'HOLD');
    if (input.mode === 'ALL' && draftPending) throw Errors.state('Còn món chưa gửi bếp hoặc đang giữ, hãy gửi hoặc hủy trước khi tính tiền');

    // Phụ thu phòng VIP khi tính cả bàn
    const minSpend = Math.max(Number(session.tables.reduce((m, t) => Math.max(m, Number(t.table.minSpend ?? 0)), 0)), Number(area?.minSpend ?? 0));
    const date = businessDate(new Date(), branch.businessDayCutoff, branch.timezone);
    const shift = await this.currentShift(branch.id);

    const billIds = await this.prisma.$transaction(async (tx) => {
      let lines = candidates.map((l) => ({ id: l.id, lineTotal: Number(l.lineTotal), vatRateBps: l.vatRateBps, share: remainingShare(l) }));
      if (input.mode === 'ALL' && minSpend > 0) {
        const subtotal = lines.reduce((s, l) => s + Math.round(l.lineTotal * l.share), 0);
        if (subtotal < minSpend) {
          const surcharge = await this.createAdjustmentLine(tx, session.id, branch.id, 'Phụ thu mức chi tiêu tối thiểu', minSpend - subtotal, branch.vatRateBps, staff.staffId);
          lines = [...lines, { id: surcharge.id, lineTotal: Number(surcharge.lineTotal), vatRateBps: surcharge.vatRateBps, share: 1 }];
        }
      }
      const parts = input.mode === 'EQUAL' ? (input.parts ?? 2) : 1;
      const ids: string[] = [];
      for (let p = 0; p < parts; p++) {
        const seq = await this.nextSeq(`B:${branch.code}:${date}`);
        const code = documentCode(`B${branch.code.slice(0, 1)}`, date, seq);
        const bill = await tx.bill.create({
          data: {
            sessionId,
            branchId: branch.id,
            shiftId: shift?.id ?? null,
            code,
            splitType: input.mode === 'ALL' ? 'NONE' : input.mode,
            serviceChargeBps,
            customerId: input.customerId ?? session.customerId ?? null,
            lines: {
              create: lines.map((l) => {
                const shareAmount = allocateProportional(Math.round(l.lineTotal * l.share), Array.from({ length: parts }, () => 1))[p] ?? 0;
                return { orderLineId: l.id, quantityShare: l.share / parts, amount: BigInt(shareAmount), vatRateBps: l.vatRateBps };
              }),
            },
          },
        });
        await this.recompute(tx, bill.id);
        await this.outbox.append(tx, { type: DomainEvents.billCreated, aggregateType: 'session', aggregateId: sessionId, branchId: branch.id, payload: { sessionId, billId: bill.id, code }, actorStaffId: staff.staffId });
        ids.push(bill.id);
      }
      if (session.status === 'OPEN') await tx.tableSession.update({ where: { id: sessionId }, data: { status: 'BILL_REQUESTED' } });
      return ids;
    });
    return Promise.all(billIds.map((id) => this.getBill(id)));
  }

  private async createAdjustmentLine(tx: Tx, sessionId: string, branchId: string, name: string, amount: number, vatRateBps: number, staffId: string) {
    let order = await tx.order.findFirst({ where: { sessionId, source: 'SYSTEM' } });
    if (!order) {
      const seq = (await tx.order.count({ where: { sessionId } })) + 1;
      order = await tx.order.create({ data: { sessionId, branchId, seq, source: 'SYSTEM', status: 'SENT', placedById: staffId, sentAt: new Date(), notes: 'Dòng điều chỉnh hệ thống' } });
    }
    return tx.orderLine.create({
      data: { orderId: order.id, sessionId, branchId, nameSnapshot: name, unitSnapshot: 'lần', unitPrice: BigInt(amount), quantity: 1, lineTotal: BigInt(amount), vatRateBps, status: 'SERVED', isAdjustment: true, sentAt: new Date(), servedAt: new Date() },
    });
  }

  /** Chi tiết bill. Truyền `client` là giao dịch đang mở để thấy các thay đổi chưa commit. */
  async getBill(billId: string, client: Tx | PrismaService = this.prisma) {
    const bill = await client.bill.findUnique({
      where: { id: billId },
      include: {
        branch: { select: { id: true, code: true, name: true, address: true, phone: true, taxCode: true, bankBin: true, bankAccountNo: true, bankAccountName: true, receiptHeader: true, receiptFooter: true, priceIncludesVat: true } },
        session: { select: { id: true, code: true, guestCount: true, openedAt: true, tables: { where: { releasedAt: null }, select: { table: { select: { name: true } } } }, participants: { select: { id: true, nickname: true } } } },
        lines: { include: { orderLine: { select: { id: true, nameSnapshot: true, unitSnapshot: true, quantity: true, unitPrice: true, modifiersSnapshot: true, lineTotal: true, participantId: true, isAdjustment: true } } } },
        discounts: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' }, include: { refunds: true } },
        customer: { select: { id: true, fullName: true, phone: true, pointsBalance: true, tierId: true, companyName: true, taxCode: true } },
        eInvoice: { select: { id: true, status: true, invoiceNo: true, lookupUrl: true, lookupCode: true } },
      },
    });
    if (!bill) throw Errors.notFound('bill');
    const due = Number(bill.total) - Number(bill.paidTotal);
    // Kèm ảnh QR cho thanh toán chuyển khoản đang chờ, để app mở lại trang vẫn hiển thị được
    const payments = await Promise.all(
      bill.payments.map(async (p) => ({
        ...p,
        qrDataUrl: p.status === 'PENDING' && p.qrPayload ? await QRCode.toDataURL(p.qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 360 }) : null,
      })),
    );
    return { ...bill, payments, due: Math.max(0, due) };
  }

  /** Tính lại toàn bộ số liệu bill từ dòng và giảm giá. */
  private async recompute(tx: Tx, billId: string) {
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId }, include: { lines: true, discounts: true, branch: true } });
    const discounts: DomainDiscount[] = bill.discounts.map((d) =>
      d.kind === 'PERCENT' ? { kind: 'PERCENT', valueBps: d.valueBps ?? 0, reason: d.reason ?? undefined } : { kind: d.kind, amount: Number(d.amount), reason: d.reason ?? undefined },
    );
    const totals = computeBill({
      lines: bill.lines.map((l) => ({ id: l.id, amount: Number(l.amount), vatRateBps: l.vatRateBps })),
      discounts,
      serviceChargeBps: bill.serviceChargeBps,
      defaultVatBps: bill.branch.vatRateBps,
      priceIncludesVat: bill.branch.priceIncludesVat,
      rounding: bill.branch.rounding,
    });
    for (const alloc of totals.lineAllocations) {
      await tx.billLine.update({ where: { id: alloc.id }, data: { discountAmount: BigInt(alloc.discountAmount), vatAmount: BigInt(alloc.vatAmount) } });
    }
    for (const [i, d] of bill.discounts.entries()) {
      const applied = totals.appliedDiscounts[i];
      if (applied && Number(d.amount) !== applied.amount) await tx.billDiscount.update({ where: { id: d.id }, data: { amount: BigInt(applied.amount) } });
    }
    const paid = settlement(totals.total, await this.paymentsFor(tx, billId));
    return tx.bill.update({
      where: { id: billId },
      data: {
        subtotal: BigInt(totals.subtotal),
        lineDiscountTotal: BigInt(totals.lineDiscountTotal),
        billDiscountTotal: BigInt(totals.billDiscountTotal),
        serviceChargeAmount: BigInt(totals.serviceChargeAmount),
        vatAmount: BigInt(totals.vatAmount),
        taxBreakdown: totals.taxBreakdown as unknown as Prisma.InputJsonValue,
        roundingAdjustment: BigInt(totals.roundingAdjustment),
        total: BigInt(totals.total),
        paidTotal: BigInt(paid.paid),
      },
    });
  }

  private async paymentsFor(tx: Tx, billId: string) {
    const payments = await tx.payment.findMany({ where: { billId }, include: { refunds: true } });
    return payments.map((p) => ({ amount: Number(p.amount), status: p.status, refundedAmount: p.refunds.filter((r) => r.status === 'SUCCEEDED').reduce((s, r) => s + Number(r.amount), 0) }));
  }

  // ───────────────── Giảm giá ─────────────────

  async addDiscount(billId: string, input: BillDiscountInput, staff: StaffPrincipal) {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId }, include: { branch: true, session: { select: { customerId: true } } } });
    if (!bill) throw Errors.notFound('bill');
    if (bill.status !== 'OPEN') throw Errors.state('Chỉ giảm giá được trên bill chưa thanh toán');
    const settings = bill.branch.settings as { discountLimitBps?: number; pointsRedeemValue?: number; pointsMaxShareBps?: number };
    let approvedById: string | null = null;
    const data: Prisma.BillDiscountUncheckedCreateInput = { billId, kind: input.kind, amount: BigInt(0), reason: input.reason ?? null, appliedById: staff.staffId };

    if (input.kind === 'PERCENT' || input.kind === 'AMOUNT' || input.kind === 'GOODWILL') {
      const limitBps = settings.discountLimitBps ?? DEFAULT_DISCOUNT_LIMIT_BPS;
      const effectiveBps = input.kind === 'PERCENT' ? (input.valueBps ?? 0) : Math.round(((input.amount ?? 0) * 10_000) / Math.max(1, Number(bill.subtotal)));
      if (effectiveBps > limitBps && !hasPermission(staff.permissions, 'billing.discount.over_limit')) {
        if (!input.managerPin) throw Errors.invalid('APPROVAL_REQUIRED', `Giảm trên ${limitBps / 100}% cần PIN quản lý`);
        approvedById = (await this.auth.verifyManagerPin(bill.branchId, input.managerPin, 'billing.discount.over_limit')).staffId;
      }
      if (!input.reason) throw Errors.invalid('REASON_REQUIRED', 'Cần ghi lý do giảm giá');
      data.valueBps = input.kind === 'PERCENT' ? input.valueBps : null;
      data.amount = BigInt(input.kind === 'PERCENT' ? 0 : (input.amount ?? 0));
    } else if (input.kind === 'VOUCHER') {
      if (!input.voucherCode) throw Errors.invalid('VOUCHER_REQUIRED', 'Nhập mã voucher');
      const voucher = await this.prisma.voucher.findUnique({ where: { code: input.voucherCode.toUpperCase() } });
      const now = new Date();
      if (!voucher || voucher.status !== 'ACTIVE' || (voucher.validFrom && voucher.validFrom > now) || (voucher.validTo && voucher.validTo < now) || voucher.usedCount >= voucher.usageLimit) {
        throw Errors.invalid('VOUCHER_INVALID', 'Voucher không hợp lệ hoặc đã hết hạn');
      }
      if (voucher.branchIds.length && !voucher.branchIds.includes(bill.branchId)) throw Errors.invalid('VOUCHER_INVALID', 'Voucher không áp dụng tại cơ sở này');
      if (voucher.minBill && Number(bill.subtotal) < Number(voucher.minBill)) throw Errors.invalid('VOUCHER_MIN', `Voucher cần bill từ ${Number(voucher.minBill).toLocaleString('vi-VN')}đ`);
      const base = Number(bill.subtotal) - Number(bill.lineDiscountTotal);
      let amount = voucher.kind === 'PERCENT' ? Math.round((base * Number(voucher.value)) / 10_000) : Number(voucher.value);
      if (voucher.maxDiscount) amount = Math.min(amount, Number(voucher.maxDiscount));
      data.amount = BigInt(amount);
      data.voucherId = voucher.id;
      data.reason = `Voucher ${voucher.code}`;
    } else if (input.kind === 'POINTS') {
      const customerId = bill.customerId ?? bill.session.customerId;
      if (!customerId) throw Errors.invalid('CUSTOMER_REQUIRED', 'Gắn khách thành viên trước khi dùng điểm');
      const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
      const wanted = input.points ?? customer.pointsBalance;
      const r = redeemablePoints(Math.min(wanted, customer.pointsBalance), Number(bill.total), { vndPerPoint: settings.pointsRedeemValue ?? 1000, maxBillShareBps: settings.pointsMaxShareBps ?? 5000 });
      if (r.points <= 0) throw Errors.invalid('POINTS_INSUFFICIENT', 'Không đủ điểm để đổi');
      data.amount = BigInt(r.amount);
      data.valueBps = r.points;
      data.reason = `Đổi ${r.points} điểm`;
    } else {
      throw Errors.invalid('UNSUPPORTED', 'Loại giảm giá chưa hỗ trợ');
    }
    data.approvedById = approvedById;

    await this.prisma.$transaction(async (tx) => {
      await tx.billDiscount.create({ data });
      await this.recompute(tx, billId);
      await tx.auditLog.create({ data: { branchId: bill.branchId, actorStaffId: staff.staffId, action: 'bill.discount', entityType: 'Bill', entityId: billId, reason: data.reason ?? null, after: { kind: input.kind, valueBps: input.valueBps, amount: Number(data.amount), approvedById } } });
      await this.outbox.append(tx, { type: DomainEvents.billUpdated, aggregateType: 'session', aggregateId: bill.sessionId, branchId: bill.branchId, payload: { sessionId: bill.sessionId, billId }, actorStaffId: staff.staffId });
    });
    return this.getBill(billId);
  }

  async removeDiscount(billId: string, discountId: string, staff: StaffPrincipal) {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) throw Errors.notFound('bill');
    if (bill.status !== 'OPEN') throw Errors.state('Bill đã có thanh toán');
    await this.prisma.$transaction(async (tx) => {
      await tx.billDiscount.delete({ where: { id: discountId } });
      await this.recompute(tx, billId);
      await this.outbox.append(tx, { type: DomainEvents.billUpdated, aggregateType: 'session', aggregateId: bill.sessionId, branchId: bill.branchId, payload: { sessionId: bill.sessionId, billId }, actorStaffId: staff.staffId });
    });
    return this.getBill(billId);
  }

  // ───────────────── Đếm vỏ ─────────────────

  /** Đối chiếu số vỏ đếm được với số đã gọi; thêm dòng hoặc giảm số lượng. Gọi trước khi tạo bill. */
  async countEmpties(sessionId: string, counts: { itemId: string; countedQty: number }[], staff: StaffPrincipal) {
    const session = await this.prisma.tableSession.findUnique({ where: { id: sessionId }, include: { branch: true, orderLines: { where: { isCountedEmpties: true, status: { in: ['SENT', 'PREPARING', 'READY', 'SERVED'] } }, orderBy: { createdAt: 'desc' }, include: { billLines: { include: { bill: { select: { status: true } } } } } } } });
    if (!session) throw Errors.notFound('phiên bàn');
    if (!['OPEN', 'BILL_REQUESTED'].includes(session.status)) throw Errors.state('Phiên bàn không ở trạng thái phục vụ');
    const ordered = new Map<string, number>();
    for (const l of session.orderLines) if (l.itemId) ordered.set(l.itemId, (ordered.get(l.itemId) ?? 0) + Number(l.quantity));
    const adjustments = reconcileEmpties(counts.map((c) => ({ itemId: c.itemId, orderedQty: ordered.get(c.itemId) ?? 0, countedQty: c.countedQty })));
    if (adjustments.length === 0) return { adjustments: [] };
    const items = await this.prisma.menuItem.findMany({ where: { id: { in: adjustments.map((a) => a.itemId) } }, include: { overrides: { where: { branchId: session.branchId } } } });
    await this.prisma.$transaction(async (tx) => {
      for (const adj of adjustments) {
        const item = items.find((i) => i.id === adj.itemId);
        if (!item) continue;
        if (adj.delta > 0) {
          const price = Number(item.overrides[0]?.price ?? item.basePrice ?? 0);
          const line = await this.createAdjustmentLine(tx, sessionId, session.branchId, `${item.name} (đếm vỏ)`, price * adj.delta, item.vatRateBps ?? session.branch.vatRateBps, staff.staffId);
          await tx.orderLine.update({ where: { id: line.id }, data: { itemId: item.id, unitPrice: BigInt(price), quantity: adj.delta, unitSnapshot: item.unit, isCountedEmpties: true } });
        } else {
          let remaining = -adj.delta;
          for (const l of session.orderLines.filter((x) => x.itemId === adj.itemId)) {
            if (remaining <= 0) break;
            if (l.billLines.some((b) => b.bill.status !== 'VOID')) continue;
            const qty = Number(l.quantity);
            const take = Math.min(qty, remaining);
            remaining -= take;
            if (take >= qty) {
              await tx.orderLine.update({ where: { id: l.id }, data: { status: 'VOIDED', voidedAt: new Date(), voidReason: 'EMPTIES_COUNT: không dùng', voidedById: staff.staffId } });
            } else {
              const newQty = qty - take;
              await tx.orderLine.update({ where: { id: l.id }, data: { quantity: newQty, lineTotal: BigInt(Math.round(Number(l.unitPrice) * newQty) + Math.round((Number(l.modifiersTotal) / qty) * newQty)), note: `${l.note ?? ''} [đếm vỏ: -${take}]`.trim() } });
            }
          }
          if (remaining > 0) throw Errors.state(`Không giảm được ${remaining} ${item.unit} ${item.name}: đã nằm trong bill thanh toán`);
        }
      }
      await tx.auditLog.create({ data: { branchId: session.branchId, actorStaffId: staff.staffId, action: 'session.empties', entityType: 'TableSession', entityId: sessionId, after: { counts, adjustments } as unknown as Prisma.InputJsonValue } });
      await this.outbox.append(tx, { type: DomainEvents.sessionUpdated, aggregateType: 'session', aggregateId: sessionId, branchId: session.branchId, payload: { sessionId, empties: adjustments }, actorStaffId: staff.staffId });
    });
    return { adjustments };
  }

  // ───────────────── Thanh toán ─────────────────

  async addPayment(billId: string, input: AddPaymentInput, staff: StaffPrincipal) {
    const bill = await this.getBill(billId);
    if (bill.status !== 'OPEN' && bill.status !== 'PARTIALLY_PAID') throw Errors.state('Bill không ở trạng thái chờ thanh toán');
    const due = bill.due;
    const amount = input.amount ?? due;
    if (amount <= 0) throw Errors.invalid('AMOUNT_INVALID', 'Số tiền phải lớn hơn 0');
    if (amount > due && input.method !== 'CASH') throw Errors.invalid('AMOUNT_EXCEEDS', 'Số tiền vượt quá số còn phải thu');
    const shift = await this.currentShift(bill.branchId);
    if (['VOUCHER', 'POINTS'].includes(input.method)) throw Errors.invalid('USE_DISCOUNT', 'Voucher và điểm được áp dụng như giảm giá, không phải thanh toán');
    if (GATEWAY_METHODS.has(input.method)) {
      // Ví và cổng: mô-đun payments tạo PaymentIntent (redirect/QR/deeplink) và nhận webhook
      const gateway = this.moduleRef.get<PaymentsGateway>(PAYMENTS_GATEWAY, { strict: false });
      const r = await gateway.createIntentForBill(billId, { method: input.method as 'VNPAY', amount: input.amount, channel: 'pos' }, staff, '127.0.0.1');
      const qrDataUrl = r.intent.qrCode ? await QRCode.toDataURL(r.intent.qrCode, { errorCorrectionLevel: 'M', margin: 1, width: 360 }) : null;
      return { bill: r.bill, payment: { ...(r.payment as object), qrDataUrl, bank: null, intent: r.intent } };
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const base: Prisma.PaymentUncheckedCreateInput = {
        billId,
        branchId: bill.branchId,
        shiftId: shift?.id ?? null,
        method: input.method,
        subMethod: input.subMethod ?? null,
        amount: BigInt(Math.min(amount, due)),
        externalRef: input.externalRef ?? null,
        cardLast4: input.cardLast4 ?? null,
        approvalCode: input.approvalCode ?? null,
        note: input.note ?? null,
        status: 'PENDING',
      };
      if (input.method === 'CASH') {
        const tendered = input.tenderedAmount ?? amount;
        const change = cashChange(Math.min(amount, due), tendered);
        base.tenderedAmount = BigInt(tendered);
        base.changeAmount = BigInt(change);
        base.status = 'SUCCEEDED';
        base.paidAt = new Date();
        base.confirmedById = staff.staffId;
      } else if (input.method === 'CARD_TERMINAL') {
        base.status = 'SUCCEEDED';
        base.paidAt = new Date();
        base.confirmedById = staff.staffId;
        base.provider = 'BANK_POS';
      } else if (input.method === 'BANK_TRANSFER') {
        if (!bill.branch.bankBin || !bill.branch.bankAccountNo) throw Errors.state('Cơ sở chưa cấu hình tài khoản nhận VietQR');
        base.provider = 'VIETQR';
        base.qrPayload = buildVietQrPayload({ bankBin: bill.branch.bankBin, accountNo: bill.branch.bankAccountNo, amount: Math.min(amount, due), purpose: billTransferPurpose(bill.code) });
      } else {
        // DEPOSIT, CREDIT: ghi nhận chờ thu ngân xác nhận
        base.provider = input.method;
      }
      const created = await tx.payment.create({ data: base });
      await this.outbox.append(tx, { type: DomainEvents.paymentCreated, aggregateType: 'session', aggregateId: bill.sessionId, branchId: bill.branchId, payload: { sessionId: bill.sessionId, billId, paymentId: created.id, method: input.method, amount: Number(created.amount), status: created.status }, actorStaffId: staff.staffId });
      if (created.status === 'SUCCEEDED') await this.applyPaymentSuccess(tx, billId, created.id, staff.staffId);
      return created;
    });

    const result = await this.getBill(billId);
    const qrDataUrl = payment.qrPayload ? await QRCode.toDataURL(payment.qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 360 }) : null;
    return { bill: result, payment: { ...payment, qrDataUrl, bank: payment.qrPayload ? { bin: bill.branch.bankBin, accountNo: bill.branch.bankAccountNo, accountName: bill.branch.bankAccountName, purpose: billTransferPurpose(bill.code) } : null } };
  }

  async confirmPayment(paymentId: string, input: { externalRef?: string; note?: string }, staff: StaffPrincipal) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { bill: true } });
    if (!payment) throw Errors.notFound('thanh toán');
    if (payment.status !== 'PENDING') throw Errors.state('Thanh toán không ở trạng thái chờ');
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'SUCCEEDED', paidAt: new Date(), confirmedById: staff.staffId, externalRef: input.externalRef ?? payment.externalRef, note: input.note ?? payment.note } });
      await this.applyPaymentSuccess(tx, payment.billId, paymentId, staff.staffId);
    });
    return this.getBill(payment.billId);
  }

  async cancelPayment(paymentId: string, staff: StaffPrincipal) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw Errors.notFound('thanh toán');
    if (payment.status !== 'PENDING') throw Errors.state('Chỉ hủy được thanh toán đang chờ');
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'CANCELLED', confirmedById: staff.staffId } });
      await this.recompute(tx, payment.billId);
    });
    return this.getBill(payment.billId);
  }

  /**
   * Ghi nhận thanh toán thành công từ cổng/webhook (payments) trong giao dịch có sẵn:
   * Payment PENDING → SUCCEEDED kèm mã tham chiếu và payload nhà cung cấp, rồi áp dụng lên bill.
   */
  async markPaymentSucceededTx(tx: Tx, paymentId: string, externalRef: string | null, payload?: unknown): Promise<void> {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw Errors.notFound('thanh toán');
    if (payment.status === 'SUCCEEDED') return;
    if (payment.status !== 'PENDING') throw Errors.state(`Thanh toán đang ở trạng thái ${payment.status}`);
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'SUCCEEDED', paidAt: new Date(), externalRef: externalRef ?? payment.externalRef, providerPayload: payload === undefined ? undefined : (JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue) },
    });
    await this.applyPaymentSuccess(tx, payment.billId, paymentId, payment.confirmedById);
  }

  async markPaymentSucceeded(paymentId: string, externalRef: string | null, payload?: unknown) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, select: { billId: true } });
    if (!payment) throw Errors.notFound('thanh toán');
    await this.prisma.$transaction((tx) => this.markPaymentSucceededTx(tx, paymentId, externalRef, payload));
    return this.getBill(payment.billId);
  }

  /** Khi một thanh toán thành công: cập nhật bill, điểm, voucher, khách hàng, đóng phiên nếu xong. */
  private async applyPaymentSuccess(tx: Tx, billId: string, paymentId: string, staffId: string | null) {
    const bill = await this.recompute(tx, billId);
    const payments = await this.paymentsFor(tx, billId);
    const s = settlement(Number(bill.total), payments);
    await this.outbox.append(tx, { type: DomainEvents.paymentSucceeded, aggregateType: 'session', aggregateId: bill.sessionId, branchId: bill.branchId, payload: { sessionId: bill.sessionId, billId, paymentId, paid: s.paid, due: s.due }, actorStaffId: staffId });
    if (!s.isPaid) {
      await tx.bill.update({ where: { id: billId }, data: { status: 'PARTIALLY_PAID', paidTotal: BigInt(s.paid) } });
      return;
    }
    await tx.bill.update({ where: { id: billId }, data: { status: 'PAID', paidTotal: BigInt(s.paid), closedAt: new Date(), closedById: staffId } });
    const discounts = await tx.billDiscount.findMany({ where: { billId } });
    for (const d of discounts) {
      if (d.kind === 'VOUCHER' && d.voucherId) await tx.voucher.update({ where: { id: d.voucherId }, data: { usedCount: { increment: 1 } } });
    }
    const customerId = bill.customerId ?? (await tx.tableSession.findUnique({ where: { id: bill.sessionId }, select: { customerId: true } }))?.customerId;
    if (customerId) {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, include: { tier: true } });
      if (customer) {
        const branch = await tx.branch.findUniqueOrThrow({ where: { id: bill.branchId } });
        const settings = branch.settings as { pointsEarnVnd?: number; pointsRedeemValue?: number };
        let balance = customer.pointsBalance;
        const redeem = discounts.find((d) => d.kind === 'POINTS');
        if (redeem && redeem.valueBps) {
          balance -= redeem.valueBps;
          await tx.pointsTransaction.create({ data: { customerId, kind: 'REDEEM', points: -redeem.valueBps, balanceAfter: balance, billId, reason: `Đổi điểm bill ${bill.code}` } });
        }
        const earned = earnPoints(Number(bill.total), { vndPerPoint: settings.pointsEarnVnd ?? 10_000, multiplierBps: customer.tier?.earnMultiplierBps ?? 10_000 });
        if (earned > 0) {
          balance += earned;
          await tx.pointsTransaction.create({ data: { customerId, kind: 'EARN', points: earned, balanceAfter: balance, billId, reason: `Tích điểm bill ${bill.code}`, expiresAt: new Date(Date.now() + 365 * 24 * 3600_000) } });
        }
        await tx.customer.update({ where: { id: customerId }, data: { pointsBalance: balance, lifetimeSpend: { increment: bill.total }, visitCount: { increment: 1 }, lastVisitAt: new Date(), firstVisitAt: customer.firstVisitAt ?? new Date() } });
        await this.outbox.append(tx, { type: DomainEvents.customerPointsChanged, aggregateType: 'customer', aggregateId: customerId, branchId: bill.branchId, payload: { customerId, balance, earned, billId }, actorStaffId: staffId });
      }
    }
    await this.outbox.append(tx, { type: DomainEvents.billPaid, aggregateType: 'session', aggregateId: bill.sessionId, branchId: bill.branchId, payload: { sessionId: bill.sessionId, billId, code: bill.code, total: Number(bill.total), customerId: customerId ?? null }, actorStaffId: staffId });
    await this.dining.closeIfSettled(tx, bill.sessionId, staffId);
    const branchSettings = (await tx.branch.findUniqueOrThrow({ where: { id: bill.branchId }, select: { settings: true } })).settings as { autoPrintFinalBill?: boolean };
    if (branchSettings.autoPrintFinalBill !== false) await this.enqueueBillPrint(tx, billId, 'BILL_FINAL');
  }

  async refund(paymentId: string, input: z.infer<typeof refundSchema>, staff: StaffPrincipal) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { refunds: true, bill: true } });
    if (!payment) throw Errors.notFound('thanh toán');
    if (!['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status)) throw Errors.state('Thanh toán chưa thành công');
    const refunded = payment.refunds.filter((r) => r.status === 'SUCCEEDED').reduce((s, r) => s + Number(r.amount), 0);
    if (input.amount > Number(payment.amount) - refunded) throw Errors.invalid('AMOUNT_EXCEEDS', 'Số tiền hoàn vượt số đã thu');
    let approvedById: string | null = null;
    if (!hasPermission(staff.permissions, 'billing.refund')) {
      if (!input.managerPin) throw Errors.invalid('APPROVAL_REQUIRED', 'Hoàn tiền cần PIN quản lý');
      approvedById = (await this.auth.verifyManagerPin(payment.branchId, input.managerPin, 'billing.refund')).staffId;
    }
    // Thanh toán qua cổng: hoàn qua API của cổng trước khi ghi nhận
    let gatewayRef: string | null = null;
    if (payment.intentId) {
      const gateway = this.moduleRef.get<PaymentsGateway>(PAYMENTS_GATEWAY, { strict: false });
      gatewayRef = (await gateway.refundIntent(payment.intentId, input.amount, input.reason)).externalRef;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.refund.create({ data: { paymentId, amount: BigInt(input.amount), reason: input.reason, status: 'SUCCEEDED', externalRef: gatewayRef, createdById: staff.staffId, approvedById } });
      const total = refunded + input.amount;
      await tx.payment.update({ where: { id: paymentId }, data: { status: total >= Number(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
      await this.recompute(tx, payment.billId);
      await tx.auditLog.create({ data: { branchId: payment.branchId, actorStaffId: staff.staffId, action: 'payment.refund', entityType: 'Payment', entityId: paymentId, reason: input.reason, after: { amount: input.amount, approvedById } } });
      await this.outbox.append(tx, { type: DomainEvents.paymentRefunded, aggregateType: 'session', aggregateId: payment.bill.sessionId, branchId: payment.branchId, payload: { sessionId: payment.bill.sessionId, billId: payment.billId, paymentId, amount: input.amount }, actorStaffId: staff.staffId });
    });
    return this.getBill(payment.billId);
  }

  async voidBill(billId: string, reason: string, staff: StaffPrincipal) {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId }, include: { payments: true } });
    if (!bill) throw Errors.notFound('bill');
    if (bill.payments.some((p) => p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED')) throw Errors.state('Bill đã có thanh toán thành công, hãy hoàn tiền trước');
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({ where: { billId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      await tx.bill.update({ where: { id: billId }, data: { status: 'VOID', notes: reason } });
      await tx.tableSession.updateMany({ where: { id: bill.sessionId, status: 'BILL_REQUESTED' }, data: { status: 'OPEN' } });
      await tx.auditLog.create({ data: { branchId: bill.branchId, actorStaffId: staff.staffId, action: 'bill.void', entityType: 'Bill', entityId: billId, reason } });
      await this.outbox.append(tx, { type: DomainEvents.billVoided, aggregateType: 'session', aggregateId: bill.sessionId, branchId: bill.branchId, payload: { sessionId: bill.sessionId, billId, reason }, actorStaffId: staff.staffId });
    });
    return { id: billId, status: 'VOID' };
  }

  async setTaxInvoiceInfo(billId: string, info: TaxInvoiceInfo | null) {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) throw Errors.notFound('bill');
    await this.prisma.bill.update({ where: { id: billId }, data: { taxInvoiceInfo: info === null ? Prisma.DbNull : (info as Prisma.InputJsonValue) } });
    return this.getBill(billId);
  }

  // ───────────────── In bill ─────────────────

  async printProvisional(billId: string, staff: StaffPrincipal) {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) throw Errors.notFound('bill');
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.bill.update({ where: { id: billId }, data: { printedCount: { increment: 1 } } });
      return this.enqueueBillPrint(tx, billId, 'BILL_PROVISIONAL', staff.fullName);
    });
    return { job };
  }

  private async enqueueBillPrint(tx: Tx, billId: string, kind: 'BILL_PROVISIONAL' | 'BILL_FINAL', printedBy?: string) {
    const printer = await tx.printer.findFirst({ where: { branchId: (await tx.bill.findUniqueOrThrow({ where: { id: billId }, select: { branchId: true } })).branchId, kind: 'RECEIPT', isActive: true } });
    if (!printer) return null;
    const bill = await this.getBill(billId, tx);
    const pendingTransfer = bill.payments.find((p) => p.method === 'BANK_TRANSFER' && p.status === 'PENDING');
    const qrPayload = kind === 'BILL_PROVISIONAL' && bill.branch.bankBin && bill.branch.bankAccountNo ? buildVietQrPayload({ bankBin: bill.branch.bankBin, accountNo: bill.branch.bankAccountNo, amount: bill.due, purpose: billTransferPurpose(bill.code) }) : (pendingTransfer?.qrPayload ?? null);
    return this.printing.enqueue(tx, {
      branchId: bill.branchId,
      printerId: printer.id,
      kind,
      refType: 'Bill',
      refId: billId,
      idempotencyKey: kind === 'BILL_FINAL' ? `bill-final:${billId}` : undefined,
      payload: {
        kind,
        branch: { name: bill.branch.name, address: bill.branch.address, phone: bill.branch.phone, taxCode: bill.branch.taxCode, header: bill.branch.receiptHeader, footer: bill.branch.receiptFooter },
        bill: { code: bill.code, createdAt: bill.createdAt, closedAt: bill.closedAt, printedCount: bill.printedCount + 1, printedBy, sessionCode: bill.session.code, tableNames: bill.session.tables.map((t) => t.table.name).join(' + '), guestCount: bill.session.guestCount, openedAt: bill.session.openedAt },
        lines: bill.lines.map((l) => ({ name: l.orderLine.nameSnapshot, unit: l.orderLine.unitSnapshot, quantity: Number(l.orderLine.quantity) * Number(l.quantityShare), unitPrice: Number(l.orderLine.unitPrice), modifiers: l.orderLine.modifiersSnapshot, amount: Number(l.amount), discount: Number(l.discountAmount) })),
        totals: { subtotal: Number(bill.subtotal), lineDiscount: Number(bill.lineDiscountTotal), billDiscount: Number(bill.billDiscountTotal), serviceChargeBps: bill.serviceChargeBps, serviceCharge: Number(bill.serviceChargeAmount), vat: Number(bill.vatAmount), taxBreakdown: bill.taxBreakdown, rounding: Number(bill.roundingAdjustment), total: Number(bill.total), paid: Number(bill.paidTotal), due: bill.due, priceIncludesVat: bill.branch.priceIncludesVat },
        discounts: bill.discounts.map((d) => ({ kind: d.kind, amount: Number(d.amount), reason: d.reason })),
        payments: bill.payments.filter((p) => p.status === 'SUCCEEDED').map((p) => ({ method: p.method, subMethod: p.subMethod, amount: Number(p.amount), tendered: p.tenderedAmount ? Number(p.tenderedAmount) : null, change: Number(p.changeAmount) })),
        vietqr: qrPayload ? { payload: qrPayload, bankBin: bill.branch.bankBin, accountNo: bill.branch.bankAccountNo, accountName: bill.branch.bankAccountName, purpose: billTransferPurpose(bill.code), amount: bill.due } : null,
        eInvoice: bill.eInvoice ? { lookupUrl: bill.eInvoice.lookupUrl, lookupCode: bill.eInvoice.lookupCode, invoiceNo: bill.eInvoice.invoiceNo } : null,
      },
    });
  }

  // ───────────────── Ca và két tiền ─────────────────

  async currentShift(branchId: string) {
    return this.prisma.shift.findFirst({ where: { branchId, status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
  }

  async openShift(branchId: string, openingCash: number, staff: StaffPrincipal, notes?: string) {
    const existing = await this.currentShift(branchId);
    if (existing) throw Errors.conflict('SHIFT_OPEN', 'Đã có ca đang mở, hãy kết ca trước');
    const shift = await this.prisma.$transaction(async (tx) => {
      const s = await tx.shift.create({ data: { branchId, deviceId: staff.deviceId, openedById: staff.staffId, openingCash: BigInt(openingCash), notes: notes ?? null } });
      await this.outbox.append(tx, { type: DomainEvents.shiftOpened, aggregateType: 'shift', aggregateId: s.id, branchId, payload: { shiftId: s.id, openingCash }, actorStaffId: staff.staffId });
      return s;
    });
    return shift;
  }

  async shiftSummary(shiftId: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId }, include: { cashMovements: true } });
    if (!shift) throw Errors.notFound('ca');
    const payments = await this.prisma.payment.findMany({ where: { shiftId, status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, include: { refunds: true } });
    const byMethod: Record<string, { count: number; amount: number; refunded: number }> = {};
    for (const p of payments) {
      const m = byMethod[p.method] ?? { count: 0, amount: 0, refunded: 0 };
      m.count += 1;
      m.amount += Number(p.amount);
      m.refunded += p.refunds.filter((r) => r.status === 'SUCCEEDED').reduce((s, r) => s + Number(r.amount), 0);
      byMethod[p.method] = m;
    }
    const cashIn = shift.cashMovements.filter((m) => m.kind === 'IN').reduce((s, m) => s + Number(m.amount), 0);
    const cashOut = shift.cashMovements.filter((m) => m.kind === 'OUT').reduce((s, m) => s + Number(m.amount), 0);
    const cash = byMethod.CASH ?? { count: 0, amount: 0, refunded: 0 };
    const bills = await this.prisma.bill.findMany({ where: { shiftId, status: 'PAID' }, select: { total: true, billDiscountTotal: true, lineDiscountTotal: true } });
    const voids = await this.prisma.orderLine.aggregate({ where: { status: 'VOIDED', voidedAt: { gte: shift.openedAt, lte: shift.closedAt ?? new Date() }, branchId: shift.branchId }, _sum: { lineTotal: true }, _count: true });
    const expectedCash = Number(shift.openingCash) + cash.amount - cash.refunded + cashIn - cashOut;
    return {
      shift,
      expectedCash,
      revenue: bills.reduce((s, b) => s + Number(b.total), 0),
      billCount: bills.length,
      discounts: bills.reduce((s, b) => s + Number(b.billDiscountTotal) + Number(b.lineDiscountTotal), 0),
      voids: { count: voids._count, amount: Number(voids._sum.lineTotal ?? 0) },
      byMethod,
      cashIn,
      cashOut,
    };
  }

  async closeShift(shiftId: string, closingCashCounted: number, staff: StaffPrincipal, notes?: string) {
    const summary = await this.shiftSummary(shiftId);
    if (summary.shift.status !== 'OPEN') throw Errors.state('Ca đã kết');
    const shift = await this.prisma.$transaction(async (tx) => {
      const s = await tx.shift.update({ where: { id: shiftId }, data: { status: 'CLOSED', closedAt: new Date(), closedById: staff.staffId, expectedCash: BigInt(summary.expectedCash), closingCashCounted: BigInt(closingCashCounted), variance: BigInt(closingCashCounted - summary.expectedCash), notes: notes ?? summary.shift.notes } });
      await this.outbox.append(tx, { type: DomainEvents.shiftClosed, aggregateType: 'shift', aggregateId: shiftId, branchId: s.branchId, payload: { shiftId, expectedCash: summary.expectedCash, counted: closingCashCounted, variance: closingCashCounted - summary.expectedCash }, actorStaffId: staff.staffId });
      const printer = await tx.printer.findFirst({ where: { branchId: s.branchId, kind: 'RECEIPT', isActive: true } });
      if (printer) await this.printing.enqueue(tx, { branchId: s.branchId, printerId: printer.id, kind: 'SHIFT_REPORT', refType: 'Shift', refId: shiftId, payload: { ...summary, shift: { ...s, openingCash: Number(s.openingCash) }, closedBy: staff.fullName } });
      return s;
    });
    return { ...(await this.shiftSummary(shiftId)), shift };
  }

  async addCashMovement(shiftId: string, input: z.infer<typeof cashMovementSchema>, staff: StaffPrincipal) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.status !== 'OPEN') throw Errors.state('Ca không mở');
    return this.prisma.cashMovement.create({ data: { shiftId, kind: input.kind, amount: BigInt(input.amount), reason: input.reason, note: input.note ?? null, attachmentUrl: input.attachmentUrl ?? null, createdById: staff.staffId } });
  }

  listBills(branchId: string, query: { businessDate?: string; status?: string; sessionId?: string }) {
    return this.prisma.bill.findMany({
      where: { branchId, ...(query.status ? { status: query.status as 'PAID' } : {}), ...(query.sessionId ? { sessionId: query.sessionId } : {}), ...(query.businessDate ? { session: { businessDate: new Date(`${query.businessDate}T00:00:00Z`) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { session: { select: { code: true, tables: { where: { releasedAt: null }, select: { table: { select: { name: true } } } } } }, payments: { select: { method: true, amount: true, status: true } } },
    });
  }

  private async nextSeq(key: string): Promise<number> {
    const full = `seq:${key}`;
    const n = await this.redis.incr(full);
    if (n === 1) await this.redis.expire(full, 3 * 24 * 3600);
    return n;
  }
}
