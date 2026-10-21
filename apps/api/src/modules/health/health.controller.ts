import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Public } from '../../common/auth/auth.guard.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'fail'> = { db: 'fail', redis: 'fail' };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = 'ok';
    } catch {
      /* giữ fail */
    }
    try {
      if ((await this.redis.ping()) === 'PONG') checks.redis = 'ok';
    } catch {
      /* giữ fail */
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    return { status: ok ? 'ok' : 'degraded', checks, time: new Date().toISOString() };
  }
}
