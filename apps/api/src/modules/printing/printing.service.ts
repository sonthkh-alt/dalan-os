import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@dalan/db';
import { DomainEvents } from '@dalan/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Errors } from '../../common/errors.js';
import { AuthService } from '../auth/auth.service.js';
import { OutboxService, type PublishedEvent } from '../outbox/outbox.service.js';
import { serializeDbValues } from '../../common/interceptors/bigint.interceptor.js';

type Tx = Prisma.TransactionClient | PrismaService;

export type PrintJobKind = 'KITCHEN_TICKET' | 'KITCHEN_VOID' | 'BILL_PROVISIONAL' | 'BILL_FINAL' | 'SHIFT_REPORT' | 'DEPOSIT_RECEIPT' | 'TEST' | 'LABEL';

/**
 * Hàng đợi in: API tạo PrintJob với payload có cấu trúc; cầu in tại cơ sở lấy job, render ESC/POS và báo kết quả.
 * Phiếu bếp được tạo tự động từ sự kiện outbox nên dù API gặp lỗi sau khi gửi đơn, phiếu vẫn được in khi relay chạy lại.
 */
@Injectable()
export class PrintingService implements OnModuleInit {
  private readonly logger = new Logger('Printing');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly auth: AuthService,
  ) {}

  onModuleInit(): void {
    this.outbox.on(DomainEvents.ticketCreated, (e) => this.onTicketCreated(e));
    this.outbox.on(DomainEvents.ticketVoided, (e) => this.onTicketVoided(e));
  }

  async enqueue(tx: Tx, input: { branchId: string; printerId: string; kind: PrintJobKind; payload: Record<string, unknown>; refType?: string; refId?: string; idempotencyKey?: string }) {
    if (input.idempotencyKey) {
      const existing = await tx.printJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;
    }
    const job = await tx.printJob.create({
      data: {
        branchId: input.branchId,
        printerId: input.printerId,
        kind: input.kind,
        payload: serializeDbValues(input.payload) as Prisma.InputJsonValue,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    await this.outbox.append(tx, { type: DomainEvents.printJobCreated, aggregateType: 'printJob', aggregateId: job.id, branchId: input.branchId, payload: { jobId: job.id, printerId: input.printerId, kind: input.kind } });
    return job;
  }

  private async onTicketCreated(e: PublishedEvent): Promise<void> {
    const p = e.payload as { ticketId: string; stationId: string; stationMode: string; printerId: string | null; sessionCode: string; tableNames: string; guestCount: number; seq: number; stationCode: string; course: number; lines: unknown[] };
    if (!p.printerId || p.stationMode === 'KDS') return;
    const station = await this.prisma.station.findUnique({ where: { id: p.stationId }, select: { name: true, branch: { select: { name: true } } } });
    await this.enqueue(this.prisma, {
      branchId: e.branchId!,
      printerId: p.printerId,
      kind: 'KITCHEN_TICKET',
      refType: 'KitchenTicket',
      refId: p.ticketId,
      idempotencyKey: `ticket:${p.ticketId}`,
      payload: {
        branchName: station?.branch.name,
        stationName: station?.name,
        stationCode: p.stationCode,
        ticketSeq: p.seq,
        sessionCode: p.sessionCode,
        tableNames: p.tableNames,
        guestCount: p.guestCount,
        course: p.course,
        firedAt: e.occurredAt,
        lines: p.lines,
      },
    });
  }

  private async onTicketVoided(e: PublishedEvent): Promise<void> {
    const p = e.payload as { ticketId: string; stationId: string; stationCode: string; lineId: string; name: string; quantity: number; reason: string; sessionId: string };
    const station = await this.prisma.station.findUnique({ where: { id: p.stationId }, select: { name: true, mode: true, printerId: true } });
    if (!station?.printerId || station.mode === 'KDS') return;
    const session = await this.prisma.tableSession.findUnique({ where: { id: p.sessionId }, select: { code: true, tables: { where: { releasedAt: null }, select: { table: { select: { name: true } } } } } });
    await this.enqueue(this.prisma, {
      branchId: e.branchId!,
      printerId: station.printerId,
      kind: 'KITCHEN_VOID',
      refType: 'OrderLine',
      refId: p.lineId,
      idempotencyKey: `void:${p.lineId}:${p.ticketId}`,
      payload: { stationName: station.name, sessionCode: session?.code, tableNames: session?.tables.map((t) => t.table.name).join(' + '), name: p.name, quantity: p.quantity, reason: p.reason, at: e.occurredAt },
    });
  }

  /** Máy in hóa đơn mặc định của cơ sở (kind RECEIPT, đang hoạt động). */
  async receiptPrinter(branchId: string) {
    return this.prisma.printer.findFirst({ where: { branchId, kind: 'RECEIPT', isActive: true }, orderBy: { code: 'asc' } });
  }

  async testPrint(branchId: string, printerId: string, staffName: string) {
    const printer = await this.prisma.printer.findFirst({ where: { id: printerId, branchId } });
    if (!printer) throw Errors.notFound('máy in');
    return this.enqueue(this.prisma, { branchId, printerId, kind: 'TEST', payload: { message: `In thử từ DaLan OS bởi ${staffName}`, at: new Date().toISOString(), printer: printer.name } });
  }

  listJobs(branchId: string, status?: string) {
    return this.prisma.printJob.findMany({ where: { branchId, ...(status ? { status: status as 'QUEUED' } : {}) }, orderBy: { createdAt: 'desc' }, take: 100, include: { printer: { select: { code: true, name: true } } } });
  }

  async retry(jobId: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job) throw Errors.notFound('lệnh in');
    return this.prisma.printJob.update({ where: { id: jobId }, data: { status: 'QUEUED', error: null } });
  }

  // ───────── Cầu in ─────────

  async bridgeContext(deviceToken: string) {
    const device = await this.auth.resolveDeviceForBridge(deviceToken);
    return device;
  }

  async bridgePull(deviceToken: string) {
    const device = await this.bridgeContext(deviceToken);
    const jobs = await this.prisma.printJob.findMany({
      where: { branchId: device.branchId, status: { in: ['QUEUED', 'SENT'] }, attempts: { lt: 5 } },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: { printer: { select: { id: true, code: true, name: true, connection: true, address: true, paperWidthMm: true, kind: true } } },
    });
    if (jobs.length) {
      await this.prisma.printJob.updateMany({ where: { id: { in: jobs.map((j) => j.id) } }, data: { status: 'SENT', attempts: { increment: 1 } } });
      await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    }
    return jobs;
  }

  async bridgeAck(deviceToken: string, jobId: string, result: { status: 'PRINTED' | 'FAILED'; error?: string }) {
    const device = await this.bridgeContext(deviceToken);
    const job = await this.prisma.printJob.findFirst({ where: { id: jobId, branchId: device.branchId } });
    if (!job) throw Errors.notFound('lệnh in');
    const updated = await this.prisma.printJob.update({
      where: { id: jobId },
      data: result.status === 'PRINTED' ? { status: 'PRINTED', printedAt: new Date(), error: null } : { status: job.attempts >= 5 ? 'FAILED' : 'QUEUED', error: result.error ?? 'Lỗi in' },
    });
    if (result.status === 'PRINTED') {
      await this.prisma.printer.update({ where: { id: job.printerId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
      if (job.refType === 'KitchenTicket' && job.refId) await this.prisma.kitchenTicket.update({ where: { id: job.refId }, data: { printedAt: new Date(), printJobId: job.id } }).catch(() => undefined);
    } else {
      this.logger.warn(`In thất bại job ${jobId}: ${result.error}`);
    }
    return updated;
  }

  async bridgePrinters(deviceToken: string) {
    const device = await this.bridgeContext(deviceToken);
    return this.prisma.printer.findMany({ where: { branchId: device.branchId, isActive: true } });
  }
}
