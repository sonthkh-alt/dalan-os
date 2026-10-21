import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@dalan/db';
import { formatVnd, normalizeVnPhone } from '@dalan/domain';
import { DomainEvents, NotificationTemplates } from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { OutboxService, type PublishedEvent } from '../outbox/outbox.service.js';
import { MESSAGING_PROVIDER, MessagingProviderError, type MessagingChannel, type MessagingProvider } from './messaging.provider.js';

export interface NotifyInput {
  channel?: MessagingChannel;
  templateCode: string;
  /** Số điện thoại bất kỳ định dạng hoặc email; sẽ được chuẩn hóa. */
  recipient: string;
  params?: Record<string, string>;
  customerId?: string | null;
  refType?: string;
  refId?: string;
  fallbackText?: string;
}

/**
 * Dịch vụ gửi thông báo: ghi NotificationLog trước, gọi nhà cung cấp, cập nhật trạng thái.
 * Tự động lắng nghe sự kiện outbox để gửi xác nhận đặt bàn, biên nhận thanh toán.
 */
@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger('Messaging');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    @Inject(MESSAGING_PROVIDER) private readonly provider: MessagingProvider,
  ) {}

  onModuleInit(): void {
    this.outbox.on(DomainEvents.reservationCreated, (e) => this.onReservationEvent(e));
    this.outbox.on(DomainEvents.reservationUpdated, (e) => this.onReservationEvent(e));
    this.outbox.on(DomainEvents.billPaid, (e) => this.onBillPaid(e));
  }

  get providerName(): string {
    return this.provider.name;
  }

  /** Gửi một thông báo; trả về bản ghi NotificationLog đã cập nhật. Không ném lỗi khi nhà cung cấp lỗi (ghi FAILED). */
  async notify(input: NotifyInput) {
    const channel: MessagingChannel = input.channel ?? 'ZNS';
    const recipient = channel === 'EMAIL' ? input.recipient.trim().toLowerCase() : (normalizeVnPhone(input.recipient) ?? input.recipient);
    const log = await this.prisma.notificationLog.create({
      data: {
        channel,
        templateCode: input.templateCode,
        recipient,
        customerId: input.customerId ?? null,
        payload: { params: input.params ?? {}, fallbackText: input.fallbackText ?? null } as Prisma.InputJsonValue,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      },
    });
    return this.deliver(log.id);
  }

  /** Gửi (hoặc gửi lại) một bản ghi NotificationLog; thử kênh dự phòng SMS khi ZNS không khả dụng. */
  async deliver(logId: string) {
    const log = await this.prisma.notificationLog.findUniqueOrThrow({ where: { id: logId } });
    const payload = log.payload as { params?: Record<string, string>; fallbackText?: string | null };
    const channels: MessagingChannel[] = log.channel === 'ZNS' ? ['ZNS', 'SMS'] : [log.channel as MessagingChannel];
    let lastError: string | null = null;
    for (const channel of channels) {
      if (!this.provider.supports(channel)) continue;
      try {
        const result = await this.provider.send(channel, {
          templateCode: log.templateCode,
          recipient: log.recipient,
          params: payload.params ?? {},
          trackingId: log.id,
          fallbackText: payload.fallbackText ?? undefined,
        });
        return this.prisma.notificationLog.update({
          where: { id: logId },
          data: { status: 'SENT', sentAt: new Date(), providerMsgId: result.providerMsgId ?? null, error: null, channel: channel === log.channel ? undefined : channel },
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Gửi ${log.templateCode} qua ${channel} tới ${log.recipient} thất bại: ${lastError}`);
        if (err instanceof MessagingProviderError && !err.retryable && channel === 'ZNS') continue;
      }
    }
    return this.prisma.notificationLog.update({ where: { id: logId }, data: { status: 'FAILED', error: lastError ?? 'Không có kênh phù hợp' } });
  }

  async resend(logId: string) {
    const log = await this.prisma.notificationLog.findUnique({ where: { id: logId } });
    if (!log) throw Errors.notFound('thông báo');
    await this.prisma.notificationLog.update({ where: { id: logId }, data: { status: 'QUEUED', error: null } });
    return this.deliver(logId);
  }

  list(query: { page: number; pageSize: number; channel?: string; status?: string; customerId?: string; templateCode?: string; recipient?: string }) {
    const where: Prisma.NotificationLogWhereInput = {
      ...(query.channel ? { channel: query.channel as 'ZNS' } : {}),
      ...(query.status ? { status: query.status as 'SENT' } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.templateCode ? { templateCode: query.templateCode } : {}),
      ...(query.recipient ? { recipient: { contains: query.recipient } } : {}),
    };
    return Promise.all([
      this.prisma.notificationLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { customer: { select: { id: true, fullName: true } } } }),
      this.prisma.notificationLog.count({ where }),
    ]).then(([items, total]) => ({ items, page: query.page, pageSize: query.pageSize, total }));
  }

  /** OTP đăng nhập/đặt bàn: ưu tiên ZNS, dự phòng SMS. */
  async sendOtp(phone: string, code: string, purpose: string) {
    return this.notify({
      templateCode: NotificationTemplates.otp,
      recipient: phone,
      params: { otp: code, purpose: purpose === 'reservation' ? 'đặt bàn' : 'đăng nhập', minutes: '5' },
      fallbackText: `Da Lan: ma xac thuc cua ban la ${code}, hieu luc 5 phut.`,
      refType: 'Otp',
    });
  }

  // ───────── Handler sự kiện ─────────

  private async onReservationEvent(e: PublishedEvent): Promise<void> {
    const p = e.payload as { reservationId: string; status: string; notify?: boolean };
    if (p.notify === false) return;
    const r = await this.prisma.reservation.findUnique({ where: { id: p.reservationId }, include: { branch: { select: { name: true, address: true, phone: true } }, customer: { select: { id: true, fullName: true } } } });
    if (!r) return;
    const template =
      r.status === 'CONFIRMED' ? NotificationTemplates.reservationConfirmed : r.status === 'PENDING' || r.status === 'WAITLIST' ? NotificationTemplates.reservationReceived : r.status === 'CANCELLED' ? NotificationTemplates.reservationCancelled : null;
    if (!template) return;
    // Chỉ gửi khi trạng thái vừa đổi sang trạng thái tương ứng (payload.status) để tránh gửi lặp
    if (p.status !== r.status) return;
    const already = await this.prisma.notificationLog.findFirst({ where: { refType: 'Reservation', refId: r.id, templateCode: template, status: { in: ['QUEUED', 'SENT', 'DELIVERED'] } } });
    if (already) return;
    const when = formatVnDateTime(r.reservedAt);
    await this.notify({
      templateCode: template,
      recipient: r.customerPhone,
      customerId: r.customerId,
      refType: 'Reservation',
      refId: r.id,
      params: { name: r.customerName, code: r.code, branch: r.branch.name, time: when, party: String(r.partySize), phone: r.branch.phone ?? '', address: r.branch.address ?? '' },
      fallbackText: `Da Lan ${r.branch.name}: dat ban ${r.code} cho ${r.partySize} khach luc ${when} ${r.status === 'CONFIRMED' ? 'da duoc xac nhan' : r.status === 'CANCELLED' ? 'da huy' : 'da tiep nhan'}.`,
    });
  }

  private async onBillPaid(e: PublishedEvent): Promise<void> {
    const p = e.payload as { billId: string; code: string; total: number; customerId: string | null };
    if (!p.customerId) return;
    const customer = await this.prisma.customer.findUnique({ where: { id: p.customerId }, select: { id: true, phone: true, fullName: true, marketingConsent: true } });
    if (!customer?.marketingConsent) return;
    const bill = await this.prisma.bill.findUnique({ where: { id: p.billId }, select: { branch: { select: { name: true } }, closedAt: true } });
    await this.notify({
      templateCode: NotificationTemplates.receipt,
      recipient: customer.phone,
      customerId: customer.id,
      refType: 'Bill',
      refId: p.billId,
      params: { name: customer.fullName ?? 'Quý khách', code: p.code, total: formatVnd(p.total), branch: bill?.branch.name ?? 'Dạ Lan', time: formatVnDateTime(bill?.closedAt ?? new Date()) },
      fallbackText: `Da Lan cam on quy khach. Hoa don ${p.code}: ${formatVnd(p.total)}.`,
    });
  }
}

export function formatVnDateTime(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hourCycle: 'h23' }).format(date);
}
