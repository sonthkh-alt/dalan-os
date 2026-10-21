import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { MESSAGING_PROVIDER } from './messaging.provider.js';
import { MessagingService } from './messaging.service.js';
import { MockMessagingProvider } from './mock.provider.js';
import { NotificationsController } from './notifications.controller.js';
import { ZaloZnsProvider } from './zalo-zns.provider.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    {
      provide: MESSAGING_PROVIDER,
      inject: [ENV, PrismaService],
      useFactory: (env: Env, prisma: PrismaService) => (env.MESSAGING_PROVIDER === 'zalo' ? new ZaloZnsProvider(prisma) : new MockMessagingProvider()),
    },
    MessagingService,
  ],
  exports: [MessagingService, MESSAGING_PROVIDER],
})
export class NotificationsModule {}
