import { Inject, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { TokensService } from '../../common/auth/tokens.service.js';
import type { Principal } from '../../common/auth/principal.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { EVENTS_CHANNEL, type PublishedEvent } from '../outbox/outbox.service.js';
import { serializeDbValues } from '../../common/interceptors/bigint.interceptor.js';
import { AuthService } from '../auth/auth.service.js';

type AuthedSocket = Socket & { principal?: Principal; device?: { id: string; branchId: string; kind: string } };

/**
 * Realtime: nhân viên vào phòng theo cơ sở (và trạm), khách QR vào phòng theo phiên.
 * Sự kiện outbox được phát từ Redis tới các phòng liên quan; client gửi `sync` với seq cuối để tải bù.
 */
@WebSocketGateway({ namespace: '/rt' })
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('Realtime');
  private subscriber?: Redis;

  constructor(
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly auth: AuthService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(EVENTS_CHANNEL);
    this.subscriber.on('message', (_channel, message) => {
      try {
        this.broadcast(JSON.parse(message) as PublishedEvent);
      } catch (err) {
        this.logger.warn(`Bỏ qua sự kiện không hợp lệ: ${String(err)}`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit().catch(() => undefined);
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    // Thiết bị (cầu in, màn hình bếp) xác thực bằng token thiết bị và vào phòng cơ sở của mình
    const deviceToken = client.handshake.auth?.deviceToken as string | undefined;
    if (deviceToken) {
      try {
        const device = await this.auth.resolveDeviceToken(deviceToken);
        client.device = { id: device.id, branchId: device.branchId, kind: device.kind };
        await client.join(`branch:${device.branchId}`);
        client.emit('ready', { kind: 'device', deviceId: device.id, branchId: device.branchId });
      } catch {
        client.emit('error', { code: 'UNAUTHORIZED', message: 'Token thiết bị không hợp lệ' });
        client.disconnect(true);
      }
      return;
    }
    const token = (client.handshake.auth?.token as string | undefined) ?? (client.handshake.headers['x-guest-token'] as string | undefined);
    const principal = token ? ((await this.tokens.verifyAccess(token)) ?? (await this.tokens.verifyGuest(token))) : null;
    if (!principal) {
      client.emit('error', { code: 'UNAUTHORIZED', message: 'Token không hợp lệ' });
      client.disconnect(true);
      return;
    }
    client.principal = principal;
    if (principal.kind === 'staff') {
      for (const branchId of principal.branchIds) await client.join(`branch:${branchId}`);
      const stationCode = client.handshake.auth?.stationCode as string | undefined;
      if (stationCode && principal.activeBranchId) await client.join(`station:${principal.activeBranchId}:${stationCode}`);
    } else if (principal.kind === 'guest') {
      await client.join(`session:${principal.sessionId}`);
    } else {
      await client.join(`customer:${principal.customerId}`);
    }
    client.emit('ready', { kind: principal.kind });
  }

  /** Tải bù các sự kiện bị lỡ kể từ seq cuối cùng client đã nhận. */
  @SubscribeMessage('sync')
  async sync(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { lastSeq?: number }) {
    const principal = client.principal;
    if (!principal) return { events: [] };
    const lastSeq = BigInt(Math.max(0, Math.floor(body?.lastSeq ?? 0)));
    const where =
      principal.kind === 'staff'
        ? { seq: { gt: lastSeq }, branchId: { in: principal.branchIds } }
        : principal.kind === 'guest'
          ? { seq: { gt: lastSeq }, aggregateId: principal.sessionId }
          : { seq: { gt: lastSeq }, aggregateType: 'customer', aggregateId: principal.customerId };
    const events = await this.prisma.domainEvent.findMany({ where, orderBy: { seq: 'asc' }, take: 500 });
    return { events: serializeDbValues(events) };
  }

  private broadcast(event: PublishedEvent): void {
    if (!this.server) return;
    const rooms = new Set<string>();
    if (event.branchId) rooms.add(`branch:${event.branchId}`);
    const payload = event.payload as { sessionId?: string; stationCode?: string; customerId?: string };
    const sessionId = payload.sessionId ?? (event.aggregateType === 'session' ? event.aggregateId : undefined);
    if (sessionId) rooms.add(`session:${sessionId}`);
    if (event.branchId && payload.stationCode) rooms.add(`station:${event.branchId}:${payload.stationCode}`);
    if (payload.customerId) rooms.add(`customer:${payload.customerId}`);
    if (rooms.size === 0) return;
    this.server.to([...rooms]).emit('event', event);
  }
}
