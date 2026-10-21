import { z } from 'zod';
import { idSchema, paginationQuerySchema } from './common.js';

/** Mã mẫu thông báo nội bộ; mỗi nhà cung cấp (Zalo ZNS, SMS) ánh xạ sang template id của họ trong IntegrationConfig. */
export const NotificationTemplates = {
  otp: 'OTP',
  reservationReceived: 'RESERVATION_RECEIVED',
  reservationConfirmed: 'RESERVATION_CONFIRMED',
  reservationReminder24h: 'RESERVATION_REMINDER_24H',
  reservationReminder2h: 'RESERVATION_REMINDER_2H',
  reservationCancelled: 'RESERVATION_CANCELLED',
  receipt: 'RECEIPT',
  birthday: 'BIRTHDAY',
  feedbackInvite: 'FEEDBACK_INVITE',
  eventDepositReminder: 'EVENT_DEPOSIT_REMINDER',
} as const;
export type NotificationTemplateCode = (typeof NotificationTemplates)[keyof typeof NotificationTemplates];

export const notificationChannelSchema = z.enum(['ZNS', 'SMS', 'EMAIL', 'PUSH']);

export const notificationListQuerySchema = paginationQuerySchema.extend({
  channel: notificationChannelSchema.optional(),
  status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED']).optional(),
  customerId: idSchema.optional(),
  templateCode: z.string().max(40).optional(),
  recipient: z.string().max(30).optional(),
});

export const sendTestNotificationSchema = z.object({
  channel: notificationChannelSchema.default('ZNS'),
  templateCode: z.string().min(1).max(40),
  recipient: z.string().min(6).max(100),
  params: z.record(z.string(), z.string()).default({}),
});

/** Cấu hình Zalo OA/ZNS lưu trong IntegrationConfig (kind MESSAGING, provider zalo). */
export const zaloMessagingConfigSchema = z.object({
  appId: z.string(),
  secretKey: z.string(),
  oaId: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  accessTokenExpiresAt: z.string().datetime().optional(),
  /** Ánh xạ mã mẫu nội bộ → template_id ZNS đã được Zalo duyệt */
  templates: z.record(z.string(), z.string()).default({}),
});
export type ZaloMessagingConfig = z.infer<typeof zaloMessagingConfigSchema>;

export const auditLogQuerySchema = paginationQuerySchema.extend({
  branchId: idSchema.optional(),
  actorStaffId: idSchema.optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(60).optional(),
  action: z.string().max(60).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
