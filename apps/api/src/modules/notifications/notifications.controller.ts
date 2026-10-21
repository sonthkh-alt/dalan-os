import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { notificationListQuerySchema, sendTestNotificationSchema } from '@dalan/contracts';
import type { z } from 'zod';
import { RequirePermissions } from '../../common/auth/auth.guard.js';
import { MessagingService } from './messaging.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  @RequirePermissions('customer.read', 'audit.read')
  list(@Query({ schema: notificationListQuerySchema }) query: z.infer<typeof notificationListQuerySchema>) {
    return this.messaging.list(query);
  }

  @Get('provider')
  @RequirePermissions('customer.manage', 'branch.read')
  provider() {
    return { provider: this.messaging.providerName };
  }

  @Post(':logId/resend')
  @RequirePermissions('customer.manage')
  @HttpCode(200)
  resend(@Param('logId') logId: string) {
    return this.messaging.resend(logId);
  }

  @Post('test')
  @RequirePermissions('customer.manage', 'branch.update')
  sendTest(@Body({ schema: sendTestNotificationSchema }) body: z.infer<typeof sendTestNotificationSchema>) {
    const channel = body.channel === 'PUSH' ? 'ZNS' : body.channel;
    return this.messaging.notify({ channel, templateCode: body.templateCode, recipient: body.recipient, params: body.params, refType: 'Test' });
  }
}
