import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@dalan/db';
import { Redis } from 'ioredis';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { serializeDbValues } from '../../common/interceptors/bigint.interceptor.js';

export const EVENTS_CHANNEL = 'dalan:events';

/** Sự kiện miền ghi vào outbox trong cùng giao dịch với thay đổi dữ liệu. */
export interface DomainEventInput {
  type: string;
  aggregateType: string;
  aggregateId: string;
  branchId?: string | null;
  payload: Record<string, unknown>;
  actorStaffId?: string | null;
  actorParticipantId?: string | null;
}

export interface PublishedEvent extends DomainEventInput {
  id: string;
  seq: number;
  occurredAt: string;
}

export type EventHandler = (event: PublishedEvent) => Promise<void> | void;

type TxClient = Prisma.TransactionClient | PrismaService;

/**
 * Outbox: mọi thay đổi trạng thái tạo một DomainEvent trong giao dịch. Một relay (có khóa Redis để chỉ
 * một bản API chạy) đọc sự kiện chưa phát, phát lên Redis pub/sub (realtime) và gọi các handler nội bộ
 * (in phiếu, tích điểm, thông báo). Handler lỗi không chặn realtime; sự kiện được đánh dấu processedAt
 * sau khi handler chạy xong.
 */
@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Outbox');
  private readonly handlers = new Map<string, EventHandler[]>();
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly instanceId = crypto.randomUUID();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Ghi sự kiện trong giao dịch hiện tại (truyền `tx`) hoặc tự tạo. */
  async append(tx: TxClient, event: DomainEventInput): Promise<void> {
    await tx.domainEvent.create({
      data: {
        type: event.type,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        branchId: event.branchId ?? null,
        payload: serializeDbValues(event.payload) as Prisma.InputJsonValue,
        actorStaffId: event.actorStaffId ?? null,
        actorParticipantId: event.actorParticipantId ?? null,
      },
    });
  }

  /** Đăng ký handler cho một loại sự kiện (hỗ trợ ký tự đại diện `dining.*`). */
  on(type: string, handler: EventHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  onModuleInit(): void {
    if (process.env.OUTBOX_RELAY === 'off') return;
    this.timer = setInterval(() => void this.tick(), 400);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Một vòng relay: giành khóa, đọc tối đa 200 sự kiện chưa phát, phát và xử lý. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let locked: string | null = null;
    try {
      locked = await this.redis.set('dalan:outbox:lock', this.instanceId, 'PX', 15_000, 'NX');
      if (locked !== 'OK') return;
      const events = await this.prisma.domainEvent.findMany({
        where: { publishedAt: null },
        orderBy: { seq: 'asc' },
        take: 200,
      });
      if (events.length === 0) return;
      for (const e of events) {
        const published: PublishedEvent = {
          id: e.id,
          seq: Number(e.seq),
          type: e.type,
          aggregateType: e.aggregateType,
          aggregateId: e.aggregateId,
          branchId: e.branchId,
          payload: (e.payload ?? {}) as Record<string, unknown>,
          actorStaffId: e.actorStaffId,
          actorParticipantId: e.actorParticipantId,
          occurredAt: e.occurredAt.toISOString(),
        };
        await this.redis.publish(EVENTS_CHANNEL, JSON.stringify(published));
        await this.prisma.domainEvent.update({ where: { id: e.id }, data: { publishedAt: new Date() } });
        await this.dispatch(published);
        await this.prisma.domainEvent.update({ where: { id: e.id }, data: { processedAt: new Date() } });
      }
    } catch (err) {
      this.logger.error('Relay lỗi', err instanceof Error ? err.stack : String(err));
    } finally {
      if (locked === 'OK') {
        // Chỉ xóa khóa nếu vẫn là của mình (compare-and-delete)
        await this.redis
          .eval('if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end', 1, 'dalan:outbox:lock', this.instanceId)
          .catch(() => undefined);
      }
      this.running = false;
    }
  }

  private async dispatch(event: PublishedEvent): Promise<void> {
    const [resource] = event.type.split('.');
    const candidates = [...(this.handlers.get(event.type) ?? []), ...(this.handlers.get(`${resource}.*`) ?? []), ...(this.handlers.get('*') ?? [])];
    for (const handler of candidates) {
      try {
        await handler(event);
      } catch (err) {
        this.logger.error(`Handler ${event.type} lỗi`, err instanceof Error ? err.stack : String(err));
      }
    }
  }
}
