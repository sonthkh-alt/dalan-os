import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EnvModule } from './config/env.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { AuthGuard } from './common/auth/auth.guard.js';
import { TokensService } from './common/auth/tokens.service.js';
import { IdempotencyInterceptor } from './common/idempotency.js';
import { HealthController } from './modules/health/health.controller.js';
import { OutboxModule } from './modules/outbox/outbox.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { OrgModule } from './modules/org/org.module.js';
import { MenuModule } from './modules/menu/menu.module.js';
import { DiningModule } from './modules/dining/dining.module.js';
import { KitchenModule } from './modules/kitchen/kitchen.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { PrintingModule } from './modules/printing/printing.module.js';
import { BullModule } from '@nestjs/bullmq';
import { ENV, type Env } from './config/env.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { InvoicingModule } from './modules/invoicing/invoicing.module.js';
import { redisConnectionFromUrl } from './modules/invoicing/queue.js';
import { EventsModule } from './modules/events/events.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { AuditModule } from './modules/audit/audit.module.js';

@Module({
  imports: [
    EnvModule,
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }] }),
    PrismaModule,
    RedisModule,
    OutboxModule,
    RealtimeModule,
    AuthModule,
    OrgModule,
    MenuModule,
    DiningModule,
    KitchenModule,
    BillingModule,
    PrintingModule,
    BullModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => ({ connection: redisConnectionFromUrl(env.REDIS_URL) }) }),
    PaymentsModule,
    InvoicingModule,
    EventsModule,
    InventoryModule,
    ReportsModule,
    StorageModule,
    NotificationsModule,
    ReservationsModule,
    CustomersModule,
    AuditModule,
  ],
  controllers: [HealthController],
  providers: [
    TokensService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
