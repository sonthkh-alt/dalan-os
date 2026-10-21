import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@dalan/db';
import { vatIncludedIn, vatOn } from '@dalan/domain';
import { DomainEvents, PAYMENT_METHOD_LABELS, type EInvoiceDraft, type EInvoiceProviderCode, type IssueEInvoiceInput, type TaxInvoiceInfo } from '@dalan/contracts';
import type { z } from 'zod';
import type { adjustEInvoiceSchema, eInvoiceListQuerySchema, replaceEInvoiceSchema } from '@dalan/contracts';
import { ENV, type Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { OutboxService, type PublishedEvent } from '../outbox/outbox.service.js';
import { PrintingService } from '../printing/printing.service.js';
import { EInvoiceProviderError, type EInvoiceConfig, type EInvoiceProvider, type IssueResult } from './provider.js';
import { MockEInvoiceProvider } from './providers/mock.provider.js';
import { MisaMeInvoiceProvider } from './providers/misa.provider.js';
import { ViettelSInvoiceProvider } from './providers/viettel.provider.js';
import { VnptInvoiceProvider } from './providers/vnpt.provider.js';
import { EINVOICE_MAX_ATTEMPTS, EINVOICE_QUEUE, type IssueJobData } from './queue.js';

type Tx = Prisma.TransactionClient;
const WALK_IN_BUYER = 'Người mua không lấy hóa đơn';

@Injectable()
export class InvoicingService implements OnModuleInit {
  private readonly logger = new Logger('Invoicing');
  private readonly providers: Map<EInvoiceProviderCode, EInvoiceProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly printing: PrintingService,
    @InjectQueue(EINVOICE_QUEUE) private readonly queue: Queue<IssueJobData>,
    @Inject(ENV) private readonly env: Env,
    mock: MockEInvoiceProvider,
    misa: MisaMeInvoiceProvider,
    viettel: ViettelSInvoiceProvider,
    vnpt: VnptInvoiceProvider,
  ) {
    this.providers = new Map<EInvoiceProviderCode, EInvoiceProvider>([
      ['MOCK', mock],
      ['MISA', misa],
      ['VIETTEL', viettel],
      ['VNPT', vnpt],
    ]);
  }

  onModuleInit(): void {
    this.outbox.on(DomainEvents.billPaid, (e) => this.onBillPaid(e));
  }

  // ───────────────── Cấu hình nhà cung cấp ─────────────────

  async resolveProvider(branchId: string | null): Promise<{ provider: EInvoiceProvider; config: EInvoiceConfig }> {
    const rows = await this.prisma.integrationConfig.findMany({ where: { kind: 'EINVOICE', isActive: true, OR: [{ branchId }, { branchId: null }] } });
    const row = rows.find((r) => r.branchId === branchId) ?? rows.find((r) => r.branchId === null);
    if (row) {
      const code = row.provider.toUpperCase() as EInvoiceProviderCode;
      const provider = this.providers.get(code);
      if (provider) return { provider, config: row.config as EInvoiceConfig };
    }
    const code = this.env.EINVOICE_PROVIDER.toUpperCase() as EInvoiceProviderCode;
    const provider = this.providers.get(code) ?? this.providers.get('MOCK')!;
    return { provider, config: this.configFromEnv(provider.code) };
  }

  private configFromEnv(code: EInvoiceProviderCode): EInvoiceConfig {
    const e = process.env;
    switch (code) {
      case 'MISA':
        return { baseUrl: e.MISA_BASE_URL, appId: e.MISA_APP_ID, taxCode: e.MISA_TAX_CODE, username: e.MISA_USERNAME, password: e.MISA_PASSWORD, invSeries: e.MISA_INV_SERIES, templateCode: e.MISA_TEMPLATE_CODE };
      case 'VIETTEL':
        return { baseUrl: e.VIETTEL_BASE_URL, username: e.VIETTEL_USERNAME, password: e.VIETTEL_PASSWORD, supplierTaxCode: e.VIETTEL_SUPPLIER_TAX_CODE, templateCode: e.VIETTEL_TEMPLATE_CODE, invoiceSeries: e.VIETTEL_INVOICE_SERIES };
      case 'VNPT':
        return { baseUrl: e.VNPT_BASE_URL, account: e.VNPT_ACCOUNT, acPass: e.VNPT_AC_PASS, username: e.VNPT_USERNAME, password: e.VNPT_PASSWORD, pattern: e.VNPT_PATTERN, serial: e.VNPT_SERIAL };
      default:
        return {};
    }
  }

  // ───────────────── Bản nháp từ bill ─────────────────

  async buildDraft(billId: string, buyerOverride?: TaxInvoiceInfo | null, reference?: EInvoiceDraft['reference']): Promise<EInvoiceDraft> {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: {
        branch: true,
        session: { select: { code: true, tables: { where: { releasedAt: null }, select: { table: { select: { name: true } } } } } },
        lines: { include: { orderLine: { select: { nameSnapshot: true, unitSnapshot: true, quantity: true } } } },
        payments: { where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }, select: { method: true } },
        customer: { select: { fullName: true, companyName: true, taxCode: true, companyAddress: true, email: true, phone: true } },
      },
    });
    if (!bill) throw Errors.notFound('bill');
    if (bill.status !== 'PAID') throw Errors.state('Chỉ phát hành hóa đơn cho bill đã thanh toán đủ');
    const branch = bill.branch;
    const inclusive = branch.priceIncludesVat;
    const info = buyerOverride ?? (bill.taxInvoiceInfo as TaxInvoiceInfo | null);
    const buyer: EInvoiceDraft['buyer'] = info
      ? { name: info.buyerName, taxCode: info.buyerTaxCode ?? null, address: info.buyerAddress ?? null, email: info.buyerEmail ?? null, phone: info.buyerPhone ?? null, isWalkIn: false }
      : bill.customer?.taxCode || bill.customer?.companyName
        ? { name: bill.customer.companyName ?? bill.customer.fullName ?? WALK_IN_BUYER, taxCode: bill.customer.taxCode ?? null, address: bill.customer.companyAddress ?? null, email: bill.customer.email ?? null, phone: bill.customer.phone ?? null, isWalkIn: false }
        : { name: WALK_IN_BUYER, taxCode: null, address: null, email: null, phone: null, isWalkIn: true };

    const lines: EInvoiceDraft['lines'] = bill.lines.map((l) => {
      const quantity = Math.round(Number(l.orderLine.quantity) * Number(l.quantityShare) * 1000) / 1000;
      const amount = Number(l.amount) - Number(l.discountAmount);
      const vatAmount = Number(l.vatAmount);
      const amountBeforeVat = inclusive ? amount - vatAmount : amount;
      return {
        name: l.orderLine.nameSnapshot,
        unit: l.orderLine.unitSnapshot,
        quantity,
        unitPriceBeforeVat: quantity > 0 ? Math.round(amountBeforeVat / quantity) : amountBeforeVat,
        amountBeforeVat,
        vatRateBps: l.vatRateBps,
        vatAmount,
        discount: Number(l.discountAmount),
        amount: inclusive ? amount : amount + vatAmount,
      };
    });
    const serviceCharge = Number(bill.serviceChargeAmount);
    if (serviceCharge > 0) {
      const scVat = inclusive ? vatIncludedIn(serviceCharge, branch.vatRateBps) : vatOn(serviceCharge, branch.vatRateBps);
      lines.push({ name: `Phí phục vụ ${bill.serviceChargeBps / 100}%`, unit: 'lần', quantity: 1, unitPriceBeforeVat: inclusive ? serviceCharge - scVat : serviceCharge, amountBeforeVat: inclusive ? serviceCharge - scVat : serviceCharge, vatRateBps: branch.vatRateBps, vatAmount: scVat, discount: 0, amount: inclusive ? serviceCharge : serviceCharge + scVat });
    }
    const settings = (branch.settings as { eInvoice?: { templateCode?: string; serial?: string } }).eInvoice ?? {};
    const methods = [...new Set(bill.payments.map((p) => PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] ?? p.method))];
    const beforeVat = lines.reduce((s, l) => s + l.amountBeforeVat, 0);
    return {
      seller: { name: branch.name, taxCode: branch.taxCode, address: branch.address, phone: branch.phone, branchCode: branch.code },
      buyer,
      bill: { id: bill.id, code: bill.code, closedAt: bill.closedAt?.toISOString() ?? null, sessionCode: bill.session.code, tableNames: bill.session.tables.map((t) => t.table.name).join(' + ') },
      lines,
      taxBreakdown: (bill.taxBreakdown as { rateBps: number; taxable: number; vat: number }[]).map((t) => ({ rateBps: t.rateBps, taxable: inclusive ? t.taxable - t.vat : t.taxable, vat: t.vat })),
      totals: { beforeVat, vat: Number(bill.vatAmount), discount: Number(bill.lineDiscountTotal) + Number(bill.billDiscountTotal), serviceCharge, total: Number(bill.total) },
      paymentMethods: methods,
      currency: 'VND',
      templateCode: settings.templateCode ?? null,
      serial: settings.serial ?? null,
      reference: reference ?? null,
    };
  }

  // ───────────────── Tạo và phát hành ─────────────────

  async createForBill(billId: string, input: IssueEInvoiceInput, createdById: string | null) {
    const existing = await this.prisma.eInvoice.findUnique({ where: { billId } });
    if (existing) {
      if (existing.status === 'ISSUED' || existing.status === 'ADJUSTED' || existing.status === 'REPLACED') return existing;
      if (existing.status === 'QUEUED' || existing.status === 'DRAFT' || existing.status === 'FAILED') {
        if (input.issueNow) return this.issueNow(existing.id);
        await this.prisma.eInvoice.update({ where: { id: existing.id }, data: { status: 'QUEUED', errorMessage: null } });
        await this.enqueue(existing.id);
        return this.get(existing.id);
      }
      throw Errors.state(`Bill đã có hóa đơn ở trạng thái ${existing.status}`);
    }
    const draft = await this.buildDraft(billId, input.buyer ?? null);
    const bill = await this.prisma.bill.findUniqueOrThrow({ where: { id: billId }, select: { branchId: true } });
    const { provider } = await this.resolveProvider(bill.branchId);
    const inv = await this.prisma.eInvoice.create({
      data: {
        branchId: bill.branchId,
        billId,
        provider: provider.code,
        status: 'QUEUED',
        templateCode: draft.templateCode,
        serial: draft.serial,
        buyerName: draft.buyer.name,
        buyerTaxCode: draft.buyer.taxCode,
        buyerAddress: draft.buyer.address,
        buyerEmail: draft.buyer.email,
        buyerPhone: draft.buyer.phone,
        totalBeforeVat: BigInt(draft.totals.beforeVat),
        vatAmount: BigInt(draft.totals.vat),
        total: BigInt(draft.totals.total),
        providerPayload: { draft } as unknown as Prisma.InputJsonValue,
        createdById,
      },
    });
    if (input.issueNow) return this.issueNow(inv.id);
    await this.enqueue(inv.id);
    return this.get(inv.id);
  }

  async enqueue(eInvoiceId: string): Promise<void> {
    await this.queue.add('issue', { eInvoiceId }, { jobId: `issue:${eInvoiceId}:${Date.now()}`, attempts: EINVOICE_MAX_ATTEMPTS, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 200, removeOnFail: 1000 });
  }

  /** Gọi nhà cung cấp phát hành; dùng cả bởi worker BullMQ và chế độ issueNow. */
  async issueNow(eInvoiceId: string, attemptNo?: number) {
    const inv = await this.prisma.eInvoice.findUnique({ where: { id: eInvoiceId } });
    if (!inv) throw Errors.notFound('hóa đơn');
    if (inv.status === 'ISSUED') return inv;
    if (inv.status === 'CANCELLED' || inv.status === 'REPLACED' || inv.status === 'ADJUSTED') throw Errors.state(`Hóa đơn đang ở trạng thái ${inv.status}`);
    const payload = (inv.providerPayload ?? {}) as { draft?: EInvoiceDraft };
    const draft = payload.draft ?? (inv.billId ? await this.buildDraft(inv.billId) : null);
    if (!draft) throw Errors.state('Thiếu dữ liệu hóa đơn');
    const { provider, config } = await this.resolveProvider(inv.branchId);
    const attempts = attemptNo ?? inv.attempts + 1;
    try {
      const result = await provider.issue(draft, config);
      return await this.recordIssued(inv.id, provider.code, draft, result, attempts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = err instanceof EInvoiceProviderError ? err.retryable : true;
      const exhausted = attempts >= EINVOICE_MAX_ATTEMPTS || !retryable;
      await this.prisma.eInvoice.update({ where: { id: inv.id }, data: { attempts, errorMessage: message.slice(0, 500), status: exhausted ? 'FAILED' : 'QUEUED' } });
      this.logger.error(`Phát hành HĐĐT ${inv.id} lần ${attempts} lỗi (${exhausted ? 'dừng' : 'thử lại'}): ${message}`);
      if (!exhausted) throw err;
      return this.get(inv.id);
    }
  }

  private async recordIssued(eInvoiceId: string, providerCode: EInvoiceProviderCode, draft: EInvoiceDraft, result: IssueResult, attempts: number) {
    const inv = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.eInvoice.update({
        where: { id: eInvoiceId },
        data: {
          status: 'ISSUED',
          provider: providerCode,
          serial: result.serial ?? draft.serial,
          templateCode: result.templateCode ?? draft.templateCode,
          invoiceNo: result.invoiceNo,
          taxAuthorityCode: result.taxAuthorityCode,
          lookupUrl: result.lookupUrl,
          lookupCode: result.lookupCode,
          pdfUrl: result.pdfUrl,
          xmlUrl: result.xmlUrl,
          issuedAt: result.issuedAt,
          attempts,
          errorMessage: null,
          providerPayload: { draft, providerRef: result.providerRef, raw: result.raw } as unknown as Prisma.InputJsonValue,
        },
      });
      const bill = updated.billId ? await tx.bill.findUnique({ where: { id: updated.billId }, select: { id: true, code: true, sessionId: true, customerId: true } }) : null;
      await this.outbox.append(tx, {
        type: DomainEvents.invoiceIssued,
        aggregateType: bill ? 'session' : 'eInvoice',
        aggregateId: bill?.sessionId ?? updated.id,
        branchId: updated.branchId,
        payload: { sessionId: bill?.sessionId, billId: bill?.id, billCode: bill?.code, eInvoiceId: updated.id, invoiceNo: updated.invoiceNo, serial: updated.serial, lookupUrl: updated.lookupUrl, lookupCode: updated.lookupCode, customerId: bill?.customerId ?? null, buyerEmail: updated.buyerEmail },
      });
      if (bill) await this.enqueueBillPrint(tx, bill.id, updated);
      return updated;
    });
    return inv;
  }

  /** In lại bill cuối kèm mã tra cứu hóa đơn điện tử (máy in hóa đơn của cơ sở). */
  private async enqueueBillPrint(tx: Tx, billId: string, inv: { id: string; invoiceNo: string | null; serial: string | null; lookupUrl: string | null; lookupCode: string | null; taxAuthorityCode: string | null; buyerName: string | null; buyerTaxCode: string | null }) {
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      include: {
        branch: { select: { id: true, name: true, address: true, phone: true, taxCode: true, receiptHeader: true, receiptFooter: true, priceIncludesVat: true } },
        session: { select: { code: true, guestCount: true, openedAt: true, tables: { where: { releasedAt: null }, select: { table: { select: { name: true } } } } } },
        lines: { include: { orderLine: { select: { nameSnapshot: true, unitSnapshot: true, quantity: true, unitPrice: true, modifiersSnapshot: true } } } },
        discounts: true,
        payments: { where: { status: 'SUCCEEDED' } },
      },
    });
    if (!bill) return;
    const printer = await tx.printer.findFirst({ where: { branchId: bill.branchId, kind: 'RECEIPT', isActive: true } });
    if (!printer) return;
    await this.printing.enqueue(tx, {
      branchId: bill.branchId,
      printerId: printer.id,
      kind: 'BILL_FINAL',
      refType: 'Bill',
      refId: billId,
      idempotencyKey: `bill-final-einvoice:${inv.id}`,
      payload: {
        kind: 'BILL_FINAL',
        branch: { name: bill.branch.name, address: bill.branch.address, phone: bill.branch.phone, taxCode: bill.branch.taxCode, header: bill.branch.receiptHeader, footer: bill.branch.receiptFooter },
        bill: { code: bill.code, createdAt: bill.createdAt, closedAt: bill.closedAt, printedCount: bill.printedCount, sessionCode: bill.session.code, tableNames: bill.session.tables.map((t) => t.table.name).join(' + '), guestCount: bill.session.guestCount, openedAt: bill.session.openedAt },
        lines: bill.lines.map((l) => ({ name: l.orderLine.nameSnapshot, unit: l.orderLine.unitSnapshot, quantity: Number(l.orderLine.quantity) * Number(l.quantityShare), unitPrice: Number(l.orderLine.unitPrice), modifiers: l.orderLine.modifiersSnapshot, amount: Number(l.amount), discount: Number(l.discountAmount) })),
        totals: { subtotal: Number(bill.subtotal), lineDiscount: Number(bill.lineDiscountTotal), billDiscount: Number(bill.billDiscountTotal), serviceChargeBps: bill.serviceChargeBps, serviceCharge: Number(bill.serviceChargeAmount), vat: Number(bill.vatAmount), taxBreakdown: bill.taxBreakdown, rounding: Number(bill.roundingAdjustment), total: Number(bill.total), paid: Number(bill.paidTotal), due: 0, priceIncludesVat: bill.branch.priceIncludesVat },
        discounts: bill.discounts.map((d) => ({ kind: d.kind, amount: Number(d.amount), reason: d.reason })),
        payments: bill.payments.map((p) => ({ method: p.method, subMethod: p.subMethod, amount: Number(p.amount), tendered: p.tenderedAmount ? Number(p.tenderedAmount) : null, change: Number(p.changeAmount) })),
        vietqr: null,
        eInvoice: { invoiceNo: inv.invoiceNo, serial: inv.serial, lookupUrl: inv.lookupUrl, lookupCode: inv.lookupCode, taxAuthorityCode: inv.taxAuthorityCode, buyerName: inv.buyerName, buyerTaxCode: inv.buyerTaxCode },
      },
    });
  }

  private async onBillPaid(e: PublishedEvent): Promise<void> {
    const billId = (e.payload as { billId?: string }).billId;
    if (!billId) return;
    const bill = await this.prisma.bill.findUnique({ where: { id: billId }, select: { id: true, taxInvoiceInfo: true, eInvoice: { select: { id: true } }, branch: { select: { settings: true } } } });
    if (!bill || bill.eInvoice) return;
    const settings = (bill.branch.settings as { eInvoice?: { autoIssue?: boolean } }).eInvoice;
    if (!settings?.autoIssue && !bill.taxInvoiceInfo) return;
    try {
      await this.createForBill(billId, { issueNow: false }, e.actorStaffId ?? null);
    } catch (err) {
      this.logger.error(`Tự động phát hành HĐĐT cho bill ${billId} lỗi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ───────────────── Nghiệp vụ sai sót ─────────────────

  private providerRefOf(inv: { providerPayload: Prisma.JsonValue | null }): string | null {
    const p = (inv.providerPayload ?? {}) as { providerRef?: string };
    return p.providerRef ?? null;
  }

  async cancel(eInvoiceId: string, reason: string, staffId: string) {
    const inv = await this.prisma.eInvoice.findUnique({ where: { id: eInvoiceId } });
    if (!inv) throw Errors.notFound('hóa đơn');
    if (inv.status !== 'ISSUED') throw Errors.state('Chỉ hủy được hóa đơn đã phát hành');
    const ref = this.providerRefOf(inv);
    const { provider, config } = await this.resolveProvider(inv.branchId);
    const r = await provider.cancel(ref ?? inv.invoiceNo ?? '', reason, config);
    if (!r.ok) throw Errors.conflict('EINVOICE_CANCEL_FAILED', `${provider.displayName} từ chối hủy hóa đơn`, r.raw);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.eInvoice.update({ where: { id: eInvoiceId }, data: { status: 'CANCELLED', errorMessage: null, providerPayload: { ...((inv.providerPayload as object) ?? {}), cancel: { reason, raw: r.raw, at: new Date().toISOString() } } as unknown as Prisma.InputJsonValue } });
      await tx.auditLog.create({ data: { branchId: inv.branchId, actorStaffId: staffId, action: 'einvoice.cancel', entityType: 'EInvoice', entityId: eInvoiceId, reason } });
      return updated;
    });
  }

  async replace(eInvoiceId: string, input: z.infer<typeof replaceEInvoiceSchema>, staffId: string) {
    return this.supersede(eInvoiceId, 'REPLACE', input.reason, input.buyer ?? null, staffId);
  }

  async adjust(eInvoiceId: string, input: z.infer<typeof adjustEInvoiceSchema>, staffId: string) {
    return this.supersede(eInvoiceId, 'ADJUST', input.reason, input.buyer ?? null, staffId, input.deltaAmount, input.deltaVat);
  }

  private async supersede(eInvoiceId: string, kind: 'REPLACE' | 'ADJUST', reason: string, buyer: TaxInvoiceInfo | null, staffId: string, deltaAmount?: number, deltaVat?: number) {
    const old = await this.prisma.eInvoice.findUnique({ where: { id: eInvoiceId } });
    if (!old) throw Errors.notFound('hóa đơn');
    if (old.status !== 'ISSUED') throw Errors.state('Chỉ thay thế/điều chỉnh hóa đơn đã phát hành');
    if (!old.billId) throw Errors.state('Hóa đơn không gắn với bill');
    const reference = { kind, invoiceNo: old.invoiceNo, serial: old.serial, issuedAt: old.issuedAt?.toISOString() ?? null, reason };
    let draft = await this.buildDraft(old.billId, buyer, reference);
    if (kind === 'ADJUST' && deltaAmount !== undefined) {
      const vat = deltaVat ?? 0;
      draft = { ...draft, lines: [{ name: `Điều chỉnh: ${reason}`, unit: 'lần', quantity: 1, unitPriceBeforeVat: deltaAmount - vat, amountBeforeVat: deltaAmount - vat, vatRateBps: draft.taxBreakdown[0]?.rateBps ?? 0, vatAmount: vat, discount: 0, amount: deltaAmount }], taxBreakdown: [{ rateBps: draft.taxBreakdown[0]?.rateBps ?? 0, taxable: deltaAmount - vat, vat }], totals: { beforeVat: deltaAmount - vat, vat, discount: 0, serviceCharge: 0, total: deltaAmount } };
    }
    const { provider, config } = await this.resolveProvider(old.branchId);
    const ref = this.providerRefOf(old) ?? old.invoiceNo ?? '';
    const result = kind === 'REPLACE' ? await provider.replace(ref, draft, reason, config) : await provider.adjust(ref, draft, reason, config);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.eInvoice.update({ where: { id: old.id }, data: { status: kind === 'REPLACE' ? 'REPLACED' : 'ADJUSTED', billId: null } });
      const inv = await tx.eInvoice.create({
        data: {
          branchId: old.branchId,
          billId: old.billId,
          provider: provider.code,
          status: 'ISSUED',
          templateCode: result.templateCode ?? draft.templateCode,
          serial: result.serial ?? draft.serial,
          invoiceNo: result.invoiceNo,
          taxAuthorityCode: result.taxAuthorityCode,
          buyerName: draft.buyer.name,
          buyerTaxCode: draft.buyer.taxCode,
          buyerAddress: draft.buyer.address,
          buyerEmail: draft.buyer.email,
          buyerPhone: draft.buyer.phone,
          totalBeforeVat: BigInt(draft.totals.beforeVat),
          vatAmount: BigInt(draft.totals.vat),
          total: BigInt(draft.totals.total),
          lookupUrl: result.lookupUrl,
          lookupCode: result.lookupCode,
          pdfUrl: result.pdfUrl,
          xmlUrl: result.xmlUrl,
          issuedAt: result.issuedAt,
          attempts: 1,
          replacesId: kind === 'REPLACE' ? old.id : null,
          adjustsId: kind === 'ADJUST' ? old.id : null,
          providerPayload: { draft, providerRef: result.providerRef, raw: result.raw } as unknown as Prisma.InputJsonValue,
          createdById: staffId,
        },
      });
      await tx.auditLog.create({ data: { branchId: old.branchId, actorStaffId: staffId, action: kind === 'REPLACE' ? 'einvoice.replace' : 'einvoice.adjust', entityType: 'EInvoice', entityId: old.id, reason, after: { newEInvoiceId: inv.id, invoiceNo: inv.invoiceNo } } });
      const bill = await tx.bill.findUnique({ where: { id: old.billId! }, select: { sessionId: true, code: true } });
      await this.outbox.append(tx, { type: DomainEvents.invoiceIssued, aggregateType: 'session', aggregateId: bill?.sessionId ?? inv.id, branchId: old.branchId, payload: { sessionId: bill?.sessionId, billId: old.billId, billCode: bill?.code, eInvoiceId: inv.id, invoiceNo: inv.invoiceNo, serial: inv.serial, lookupUrl: inv.lookupUrl, lookupCode: inv.lookupCode, supersedes: old.id, kind }, actorStaffId: staffId });
      return inv;
    });
    return created;
  }

  async retry(eInvoiceId: string) {
    const inv = await this.prisma.eInvoice.findUnique({ where: { id: eInvoiceId } });
    if (!inv) throw Errors.notFound('hóa đơn');
    if (inv.status !== 'FAILED' && inv.status !== 'QUEUED') throw Errors.state('Chỉ thử lại hóa đơn lỗi hoặc đang chờ');
    await this.prisma.eInvoice.update({ where: { id: eInvoiceId }, data: { status: 'QUEUED', attempts: 0, errorMessage: null } });
    await this.enqueue(eInvoiceId);
    return this.get(eInvoiceId);
  }

  // ───────────────── Truy vấn ─────────────────

  async get(eInvoiceId: string) {
    const inv = await this.prisma.eInvoice.findUnique({ where: { id: eInvoiceId }, include: { bill: { select: { id: true, code: true, sessionId: true, total: true, closedAt: true } } } });
    if (!inv) throw Errors.notFound('hóa đơn');
    const { providerPayload, ...rest } = inv;
    const p = (providerPayload ?? {}) as { providerRef?: string };
    return { ...rest, providerRef: p.providerRef ?? null };
  }

  async list(query: z.infer<typeof eInvoiceListQuerySchema>, branchIds: string[] | null) {
    const where: Prisma.EInvoiceWhereInput = {
      ...(query.branchId ? { branchId: query.branchId } : branchIds ? { branchId: { in: branchIds } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(`${query.from}T00:00:00+07:00`) } : {}), ...(query.to ? { lt: new Date(new Date(`${query.to}T00:00:00+07:00`).getTime() + 86_400_000) } : {}) } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.eInvoice.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { bill: { select: { code: true, total: true } } }, omit: { providerPayload: true } }),
      this.prisma.eInvoice.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async getPdf(eInvoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
    const inv = await this.prisma.eInvoice.findUnique({ where: { id: eInvoiceId } });
    if (!inv) throw Errors.notFound('hóa đơn');
    if (inv.status === 'DRAFT' || inv.status === 'QUEUED' || inv.status === 'FAILED') throw Errors.state('Hóa đơn chưa phát hành');
    const provider = this.providers.get(inv.provider as EInvoiceProviderCode);
    const { config } = await this.resolveProvider(inv.branchId);
    if (!provider) throw Errors.state('Nhà cung cấp không khả dụng');
    const buffer = await provider.getPdf(this.providerRefOf(inv) ?? inv.invoiceNo ?? '', config);
    return { buffer, filename: `hoa-don-${inv.serial ?? ''}-${inv.invoiceNo ?? inv.id}.pdf` };
  }

  async lookupTaxCode(taxCode: string, branchId: string | null) {
    const normalized = taxCode.replace(/\s/g, '');
    if (!/^\d{10}(-?\d{3})?$/.test(normalized)) throw Errors.invalid('TAX_CODE_INVALID', 'Mã số thuế gồm 10 hoặc 13 chữ số');
    const { provider, config } = await this.resolveProvider(branchId);
    const info = await provider.lookupTaxCode(normalized, config);
    return info ?? { taxCode: normalized, name: null, address: null, status: 'unknown' };
  }

  async reconcile(branchId: string, date: string) {
    const businessDate = new Date(`${date}T00:00:00Z`);
    const bills = await this.prisma.bill.findMany({ where: { branchId, status: 'PAID', session: { businessDate } }, select: { id: true, code: true, total: true, closedAt: true, taxInvoiceInfo: true, eInvoice: { select: { id: true, status: true, invoiceNo: true, serial: true, errorMessage: true } } }, orderBy: { closedAt: 'asc' } });
    const issued = bills.filter((b) => b.eInvoice && ['ISSUED', 'ADJUSTED', 'REPLACED'].includes(b.eInvoice.status));
    const pending = bills.filter((b) => b.eInvoice && ['QUEUED', 'DRAFT'].includes(b.eInvoice.status));
    const failed = bills.filter((b) => b.eInvoice?.status === 'FAILED');
    const missing = bills.filter((b) => !b.eInvoice || b.eInvoice.status === 'CANCELLED');
    const sum = (rows: typeof bills) => rows.reduce((s, b) => s + Number(b.total), 0);
    return {
      date,
      paidBills: bills.length,
      paidTotal: sum(bills),
      issued: issued.length,
      issuedTotal: sum(issued),
      pending: pending.length,
      failed: failed.map((b) => ({ billId: b.id, code: b.code, total: Number(b.total), error: b.eInvoice?.errorMessage })),
      missing: missing.map((b) => ({ billId: b.id, code: b.code, total: Number(b.total), closedAt: b.closedAt, hasBuyerInfo: !!b.taxInvoiceInfo })),
    };
  }
}
