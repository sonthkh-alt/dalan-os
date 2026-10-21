import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions } from 'socket.io';

/** Socket.IO adapter dùng Redis pub/sub để chạy nhiều bản API song song. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    const pub = new Redis(this.redisUrl, { maxRetriesPerRequest: 3 });
    const sub = pub.duplicate();
    await Promise.all([waitReady(pub), waitReady(sub)]);
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const merged = {
      ...options,
      cors: { origin: true, credentials: true },
      transports: ['websocket', 'polling'],
      pingInterval: 20_000,
      pingTimeout: 20_000,
    } as unknown as ServerOptions;
    const server = super.createIOServer(port, merged);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}

function waitReady(redis: Redis): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redis.status === 'ready') return resolve();
    redis.once('ready', () => resolve());
    redis.once('error', (err) => reject(err));
  });
}
