import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@dalan/db';
import { DEFAULT_PROVIDER_FOR_METHOD, DomainEvents, type CreatePaymentIntentInput, type GatewayMethod, type PaymentIntentView, type PaymentProviderCode } from '@dalan/contracts';
import { ENV, type Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Errors } from '../../common/errors.js';
import type { Principal } from '../../common/auth/principal.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { BillingService } from '../billing/billing.service.js';
import { MockPaymentProvider } from './providers/mock.provider.js';
import { VnPayProvider } from './providers/vnpay.provider.js';
import { MoMoProvider } from './providers/momo.provider.js';
import { ZaloPayProvider } from './providers/zalopay.provider.js';
import { OnePayProvider } from './providers/onepay.provider.js';
import type { AckCode, AckResponse, PaymentProvider, ProviderConfig, WebhookContext, WebhookResult } from './provider.js';

interface ResolvedProvider {
  provider: PaymentProvider;
  config: ProviderConfig;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');
  private readonly providers: Map<PaymentProviderCode, PaymentProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly billing: BillingService,
    @Inject(ENV) private readonly env: Env,
    mock: MockPaymentProvider,
    vnpay: VnPayProvider,
    momo: MoMoProvider,
    zalopay: ZaloPayProvider,
    onepay: OnePayProvider,
  ) {
    this.providers = new Map<PaymentProviderCode, PaymentProvider>([
      ['mock', mock],
      ['vnpay', vnpay],
      ['momo', momo],
      ['zalopay', zalopay],
      ['onepay', onepay],
    ]);
  }

  // ───────────────── Cấu hình ─────────────────

  private enabledProviders(): Set<string> {
    return new Set(this.env.PAYMENT_PROVIDERS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  }

  /** Cấu hình cổng theo cơ sở: IntegrationConfig cơ sở → IntegrationConfig toàn công ty → biến môi trường. */
  async loadConfig(branchId: string | null, code: PaymentProviderCode): Promise<ProviderConfig | null> {
    const rows = await this.prisma.integrationConfig.findMany({ where: { kind: 'PAYMENT', provider: code, isActive: true, OR: [{ branchId }, { branchId: null }] } });
    const row = rows.find((r) => r.branchId === branchId) ?? rows.find((r) => r.branchId === null);
    if (row) return row.config as ProviderConfig;
    return this.configFromEnv(code);
  }

  private configFromEnv(code: PaymentProviderCode): ProviderConfig | null {
    const e = process.env;
    switch (code) {
      case 'mock':
        return this.enabledProviders().has('mock') ? { secret: e.MOCK_PAYMENT_SECRET ?? 'dalan-mock-secret', autoSucceedMs: Number(e.MOCK_PAYMENT_DELAY_MS ?? 2000) } : null;
      case 'vnpay':
        return e.VNPAY_TMN_CODE && e.VNPAY_HASH_SECRET ? { tmnCode: e.VNPAY_TMN_CODE, hashSecret: e.VNPAY_HASH_SECRET, payUrl: e.VNPAY_PAY_URL, apiUrl: e.VNPAY_API_URL, bankCode: e.VNPAY_BANK_CODE } : null;
      case 'momo':
        return e.MOMO_PARTNER_CODE && e.MOMO_ACCESS_KEY && e.MOMO_SECRET_KEY ? { partnerCode: e.MOMO_PARTNER_CODE, accessKey: e.MOMO_ACCESS_KEY, secretKey: e.MOMO_SECRET_KEY, endpoint: e.MOMO_ENDPOINT } : null;
      case 'zalopay':
        return e.ZALOPAY_APP_ID && e.ZALOPAY_KEY1 && e.ZALOPAY_KEY2 ? { appId: Number(e.ZALOPAY_APP_ID), key1: e.ZALOPAY_KEY1, key2: e.ZALOPAY_KEY2, endpoint: e.ZALOPAY_ENDPOINT } : null;
      case 'onepay':
        return e.ONEPAY_MERCHANT && e.ONEPAY_ACCESS_CODE && e.ONEPAY_SECURE_SECRET ? { merchant: e.ONEPAY_MERCHANT, accessCode: e.ONEPAY_ACCESS_CODE, secureSecret: e.ONEPAY_SECURE_SECRET, payUrl: e.ONEPAY_PAY_URL, queryUrl: e.ONEPAY_QUERY_URL, apiUser: e.ONEPAY_API_USER, apiPassword: e.ONEPAY_API_PASSWORD } : null;
    }
  }

  /** Chọn cổng cho phương thức; nếu cổng thật chưa cấu hình và mock được bật thì dùng mock (dev/demo). */
  async resolve(branchId: string, method: GatewayMethod, requested?: PaymentProviderCode): Promise<ResolvedProvider> {
    const code = requested ?? DEFAULT_PROVIDER_FOR_METHOD[method];
    const provider = this.providers.get(code);
    if (!provider) throw Errors.invalid('PROVIDER_UNKNOWN', `Cổng ${code} không được hỗ trợ`);
    const config = await this.loadConfig(branchId, code);
    if (config && provider.supportsMethod(method)) return { provider, config };
    const mock = this.providers.get('mock')!;
    const mockConfig = await this.loadConfig(branchId, 'mock');
    if (mockConfig) {
      this.logger.warn(`Cổng ${code} chưa cấu hình cho cơ sở ${branchId}; dùng cổng giả lập`);
      return { provider: mock, config: mockConfig };
    }
    throw Errors.state(`Cổng ${provider.displayName} chưa được cấu hình cho cơ sở này`);
  }

  /** Danh sách cổng khả dụng cho cơ sở (để app hiển thị nút thanh toán). */
  async availableMethods(branchId: string) {
    const out: { method: GatewayMethod; provider: PaymentProviderCode; displayName: string; simulated: boolean }[] = [];
    for (const method of Object.keys(DEFAULT_PROVIDER_FOR_METHOD) as GatewayMethod[]) {
      try {
        const r = await this.resolve(branchId, method);
        out.push({ method, provider: r.provider.code, displayName: r.provider.displayName, simulated: r.provider.code === 'mock' });
      } catch {
        /* không khả dụng */
      }
    }
    return out;
  }

  // ───────────────── Tạo intent cho bill ─────────────────

  async createIntentForBill(billId: string, input: CreatePaymentIntentInput, actor: Principal, clientIp: string) {
    const bill = await this.billing.getBill(billId);
    if (actor.kind === 'guest' && bill.sessionId !== actor.sessionId) throw Errors.forbidden();
    if (bill.status !== 'OPEN' && bill.status !== 'PARTIALLY_PAID') throw Errors.state('Bill không ở trạng thái chờ thanh toán');
    const amount = input.amount ?? bill.due;
    if (amount <= 0 || amount > bill.due) throw Errors.invalid('AMOUNT_INVALID', 'Số tiền không hợp lệ');
    const { provider, config } = await this.resolve(bill.branchId, input.method, input.provider);
    const shift = await this.billing.currentShift(bill.branchId);
    const staffId = actor.kind === 'staff' ? actor.staffId : null;

    const { payment, intent } = await this.prisma.$transaction(async (tx) => {
      const createdIntent = await tx.paymentIntent.create({
        data: { branchId: bill.branchId, billId, provider: provider.code, method: input.method, amount: BigInt(amount), status: 'CREATED' },
      });
      const createdPayment = await tx.payment.create({
        data: { billId, branchId: bill.branchId, shiftId: shift?.id ?? null, intentId: createdIntent.id, method: input.method, provider: provider.code, amount: BigInt(amount), status: 'PENDING', confirmedById: staffId },
      });
      await this.outbox.append(tx, { type: DomainEvents.paymentCreated, aggregateType: 'session', aggregateId: bill.sessionId, branchId: bill.branchId, payload: { sessionId: bill.sessionId, billId, paymentId: createdPayment.id, intentId: createdIntent.id, method: input.method, provider: provider.code, amount, status: 'PENDING' }, actorStaffId: staffId, actorParticipantId: actor.kind === 'guest' ? actor.participantId : null });
      return { payment: createdPayment, intent: createdIntent };
    });

    const returnUrl = input.returnUrl ?? `${this.env.GUEST_APP_URL}/pay/result?intent=${intent.id}`;
    const ipnUrl = `${this.env.API_PUBLIC_URL}/api/v1/webhooks/payments/${provider.code}`;
    try {
      const result = await provider.createIntent(
        { intentId: intent.id, amount, currency: 'VND', method: input.method, description: `Thanh toan bill ${bill.code} ${bill.branch.name}`, returnUrl, ipnUrl, clientIp, channel: input.channel, billId },
        config,
      );
      const updated = await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PENDING', providerIntentId: result.providerIntentId, redirectUrl: result.redirectUrl ?? null, qrCode: result.qrCode ?? null, deeplink: result.deeplink ?? null, expiresAt: result.expiresAt ?? null, webhookPayload: (result.raw ?? null) as Prisma.InputJsonValue },
      });
      if (provider.code === 'mock') this.scheduleMockWebhook(result.providerIntentId, amount, config);
      return { bill: await this.billing.getBill(billId), payment: { ...payment, intentId: intent.id }, intent: this.toView(updated, payment.externalRef) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Tạo intent ${provider.code} thất bại: ${message}`);
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'FAILED', webhookPayload: { error: message } } });
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', note: message.slice(0, 200) } });
        await this.outbox.append(tx, { type: DomainEvents.paymentFailed, aggregateType: 'session', aggregateId: bill.sessionId, branchId: bill.branchId, payload: { sessionId: bill.sessionId, billId, paymentId: payment.id, intentId: intent.id, reason: message }, actorStaffId: staffId });
      });
      throw Errors.conflict('GATEWAY_ERROR', `Không tạo được giao dịch với ${provider.displayName}`, { message });
    }
  }

  private scheduleMockWebhook(providerIntentId: string, amount: number, config: ProviderConfig): void {
    const delay = Number(config.autoSucceedMs ?? 2000);
    if (!(delay > 0)) return;
    const mock = this.providers.get('mock') as MockPaymentProvider;
    setTimeout(() => {
      void this.handleWebhook('mock', mock.buildWebhook(providerIntentId, amount, 'SUCCEEDED', config)).catch((err) => this.logger.error(`Webhook giả lập lỗi: ${String(err)}`));
    }, delay).unref();
  }

  // ───────────────── Webhook / IPN ─────────────────

  async handleWebhook(code: string, ctx: WebhookContext): Promise<AckResponse> {
    const provider = this.providers.get(code as PaymentProviderCode);
    if (!provider) return { status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'unknown provider' }) };
    const respond = (ackCode: AckCode, result?: WebhookResult | null) => provider.ack(ackCode, result);
    try {
      const providerIntentId = provider.extractIntentId(ctx);
      if (!providerIntentId) return respond('NOT_FOUND');
      const intent = await this.prisma.paymentIntent.findFirst({ where: { provider: provider.code, providerIntentId }, include: { payment: true } });
      if (!intent) {
        this.logger.warn(`Webhook ${code}: không tìm thấy intent ${providerIntentId}`);
        return respond('NOT_FOUND');
      }
      const config = await this.loadConfig(intent.branchId, provider.code);
      if (!config) return respond('ERROR');
      const result = await provider.verifyWebhook(ctx, config);
      if (!result.ok) {
        this.logger.warn(`Webhook ${code} chữ ký sai cho ${providerIntentId}: ${result.reason}`);
        await this.prisma.auditLog.create({ data: { branchId: intent.branchId, action: 'payment.webhook.rejected', entityType: 'PaymentIntent', entityId: intent.id, reason: result.reason ?? 'invalid signature', after: result.raw as Prisma.InputJsonValue } });
        return respond('INVALID_SIGNATURE', result);
      }
      if (result.amount !== null && result.amount !== undefined && Math.round(result.amount) !== Number(intent.amount)) {
        this.logger.warn(`Webhook ${code}: lệch số tiền ${result.amount} ≠ ${intent.amount}`);
        return respond('AMOUNT_MISMATCH', result);
      }
      if (intent.status === 'SUCCEEDED') return respond('ALREADY_PROCESSED', result);

      if (result.status === 'SUCCEEDED') {
        await this.prisma.$transaction(async (tx) => {
          await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: 'SUCCEEDED', webhookPayload: result.raw as Prisma.InputJsonValue } });
          if (intent.payment) await this.billing.markPaymentSucceededTx(tx, intent.payment.id, result.externalRef ?? null, result.raw);
        });
        return respond('OK', result);
      }
      if (result.status === 'FAILED' || result.status === 'CANCELLED') {
        if (intent.status === 'FAILED' || intent.status === 'CANCELLED') return respond('ALREADY_PROCESSED', result);
        await this.prisma.$transaction(async (tx) => {
          await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: result.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED', webhookPayload: result.raw as Prisma.InputJsonValue } });
          if (intent.payment && intent.payment.status === 'PENDING') {
            await tx.payment.update({ where: { id: intent.payment.id }, data: { status: result.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED', providerPayload: result.raw as Prisma.InputJsonValue, externalRef: result.externalRef ?? null } });
            const bill = await tx.bill.findUniqueOrThrow({ where: { id: intent.payment.billId }, select: { sessionId: true } });
            await this.outbox.append(tx, { type: DomainEvents.paymentFailed, aggregateType: 'session', aggregateId: bill.sessionId, branchId: intent.branchId, payload: { sessionId: bill.sessionId, billId: intent.payment.billId, paymentId: intent.payment.id, intentId: intent.id, status: result.status } });
          }
        });
        return respond('OK', result);
      }
      await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { webhookPayload: result.raw as Prisma.InputJsonValue } });
      return respond('OK', result);
    } catch (err) {
      this.logger.error(`Webhook ${code} lỗi`, err instanceof Error ? err.stack : String(err));
      return respond('ERROR');
    }
  }

  // ───────────────── Truy vấn, hủy, hoàn ─────────────────

  async getIntent(intentId: string, actor: Principal, sync = true): Promise<PaymentIntentView> {
    let intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId }, include: { payment: { select: { externalRef: true, billId: true, bill: { select: { sessionId: true } } } } } });
    if (!intent) throw Errors.notFound('giao dịch');
    if (actor.kind === 'guest' && intent.payment?.bill.sessionId !== actor.sessionId) throw Errors.forbidden();
    if (sync && intent.status === 'PENDING' && intent.providerIntentId && intent.provider !== 'mock') {
      // Chủ động hỏi cổng khi webhook chưa về (mạng chập chờn hoặc cổng không gọi được localhost)
      try {
        const provider = this.providers.get(intent.provider as PaymentProviderCode);
        const config = await this.loadConfig(intent.branchId, intent.provider as PaymentProviderCode);
        if (provider && config) {
          const q = await provider.query(intent.providerIntentId, config, { createdAt: intent.createdAt, amount: Number(intent.amount) });
          if (q.status === 'SUCCEEDED' && (q.amount === null || q.amount === undefined || Math.round(q.amount) === Number(intent.amount))) {
            await this.prisma.$transaction(async (tx) => {
              await tx.paymentIntent.update({ where: { id: intent!.id }, data: { status: 'SUCCEEDED', webhookPayload: q.raw as Prisma.InputJsonValue } });
              const payment = await tx.payment.findFirst({ where: { intentId: intent!.id } });
              if (payment) await this.billing.markPaymentSucceededTx(tx, payment.id, q.externalRef ?? null, q.raw);
            });
            intent = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId }, include: { payment: { select: { externalRef: true, billId: true, bill: { select: { sessionId: true } } } } } });
          }
        }
      } catch (err) {
        this.logger.warn(`Truy vấn cổng cho intent ${intentId} lỗi: ${String(err)}`);
      }
    }
    if (intent.status === 'PENDING' && intent.expiresAt && intent.expiresAt < new Date()) {
      intent = await this.prisma.paymentIntent.update({ where: { id: intentId }, data: { status: 'EXPIRED' }, include: { payment: { select: { externalRef: true, billId: true, bill: { select: { sessionId: true } } } } } });
      await this.prisma.payment.updateMany({ where: { intentId, status: 'PENDING' }, data: { status: 'CANCELLED', note: 'Hết hạn thanh toán' } });
    }
    return this.toView(intent, intent.payment?.externalRef ?? null);
  }

  async cancelIntent(intentId: string, actor: Principal) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId }, include: { payment: { include: { bill: { select: { sessionId: true } } } } } });
    if (!intent) throw Errors.notFound('giao dịch');
    if (actor.kind === 'guest' && intent.payment?.bill.sessionId !== actor.sessionId) throw Errors.forbidden();
    if (intent.status !== 'CREATED' && intent.status !== 'PENDING') throw Errors.state('Giao dịch không còn hủy được');
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentIntent.update({ where: { id: intentId }, data: { status: 'CANCELLED' } });
      if (intent.payment && intent.payment.status === 'PENDING') await tx.payment.update({ where: { id: intent.payment.id }, data: { status: 'CANCELLED' } });
    });
    return this.getIntent(intentId, actor, false);
  }

  /** Hoàn tiền qua cổng cho một PaymentIntent đã thành công (BillingService.refund gọi trước khi ghi Refund). */
  async refundIntent(intentId: string, amount: number, reason: string): Promise<{ externalRef: string | null }> {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId }, include: { payment: { select: { externalRef: true } } } });
    if (!intent || intent.status !== 'SUCCEEDED' || !intent.providerIntentId) throw Errors.state('Giao dịch cổng chưa thành công, không hoàn qua cổng được');
    const provider = this.providers.get(intent.provider as PaymentProviderCode);
    const config = await this.loadConfig(intent.branchId, intent.provider as PaymentProviderCode);
    if (!provider || !config) throw Errors.state(`Cổng ${intent.provider} không khả dụng để hoàn tiền`);
    const r = await provider.refund(intent.providerIntentId, amount, reason, config, { createdAt: intent.createdAt, amount: Number(intent.amount), externalRef: intent.payment?.externalRef ?? null });
    if (!r.ok) throw Errors.conflict('GATEWAY_REFUND_FAILED', `${provider.displayName} từ chối hoàn tiền: ${r.message ?? 'không rõ'}`, r.raw);
    return { externalRef: r.externalRef ?? null };
  }

  private toView(intent: { id: string; billId: string | null; provider: string; method: string; amount: bigint; currency: string; status: string; providerIntentId: string | null; redirectUrl: string | null; qrCode: string | null; deeplink: string | null; expiresAt: Date | null; createdAt: Date; updatedAt: Date; payment?: { billId?: string } | null }, externalRef: string | null): PaymentIntentView {
    return {
      id: intent.id,
      billId: intent.billId,
      paymentId: null,
      provider: intent.provider,
      method: intent.method,
      amount: Number(intent.amount),
      currency: intent.currency,
      status: intent.status as PaymentIntentView['status'],
      providerIntentId: intent.providerIntentId,
      redirectUrl: intent.redirectUrl,
      qrCode: intent.qrCode,
      deeplink: intent.deeplink,
      expiresAt: intent.expiresAt?.toISOString() ?? null,
      externalRef,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
    };
  }
}
