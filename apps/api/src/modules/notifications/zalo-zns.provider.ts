import { Logger } from '@nestjs/common';
import { zaloMessagingConfigSchema, type ZaloMessagingConfig } from '@dalan/contracts';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { MessagingProviderError, type MessagingChannel, type MessagingProvider, type SendResult, type SendTemplateInput } from './messaging.provider.js';

const ZNS_ENDPOINT = 'https://business.openapi.zalo.me/message/template';
const OAUTH_ENDPOINT = 'https://oauth.zaloapp.com/v4/oa/access_token';

/**
 * Gửi tin Zalo Notification Service (ZNS) qua Official Account.
 * Cấu hình lấy từ IntegrationConfig (kind MESSAGING, provider zalo): appId, secretKey, accessToken,
 * refreshToken và bảng ánh xạ mã mẫu nội bộ → template_id đã được Zalo duyệt.
 * Access token OA hết hạn sau 1 giờ nên được làm mới tự động bằng refresh token (hạn 3 tháng).
 * Tài liệu: https://developers.zalo.me/docs/zalo-notification-service
 */
export class ZaloZnsProvider implements MessagingProvider {
  readonly name = 'zalo';
  private readonly logger = new Logger('ZaloZNS');

  constructor(private readonly prisma: PrismaService) {}

  supports(channel: MessagingChannel): boolean {
    return channel === 'ZNS';
  }

  async send(channel: MessagingChannel, input: SendTemplateInput): Promise<SendResult> {
    if (channel !== 'ZNS') throw new MessagingProviderError(`Zalo không hỗ trợ kênh ${channel}`);
    const { row, config } = await this.loadConfig();
    const templateId = config.templates[input.templateCode];
    if (!templateId) throw new MessagingProviderError(`Chưa cấu hình template ZNS cho mẫu ${input.templateCode}`);
    const accessToken = await this.ensureAccessToken(row.id, config);
    const phone = input.recipient.replace(/^\+/, '');
    const body = { phone, template_id: templateId, template_data: input.params, tracking_id: input.trackingId };
    const res = await fetch(ZNS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', access_token: accessToken },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: number; message?: string; data?: { msg_id?: string } };
    if (!res.ok || (json.error !== undefined && json.error !== 0)) {
      // -124: access token hết hạn; -216/-217: lỗi token; các mã khác xem tài liệu Zalo
      const retryable = [-124, -216, -217, -218].includes(json.error ?? 0) || res.status >= 500;
      this.logger.warn(`ZNS lỗi ${json.error}: ${json.message}`);
      throw new MessagingProviderError(`Zalo ZNS lỗi ${json.error ?? res.status}: ${json.message ?? res.statusText}`, retryable, json);
    }
    return { accepted: true, providerMsgId: json.data?.msg_id, raw: json };
  }

  private async loadConfig(): Promise<{ row: { id: string; config: unknown }; config: ZaloMessagingConfig }> {
    const row = await this.prisma.integrationConfig.findFirst({ where: { kind: 'MESSAGING', provider: 'zalo', isActive: true }, orderBy: { branchId: 'asc' } });
    if (!row) throw new MessagingProviderError('Chưa cấu hình Zalo OA (IntegrationConfig kind MESSAGING, provider zalo)');
    const parsed = zaloMessagingConfigSchema.safeParse(row.config);
    if (!parsed.success) throw new MessagingProviderError(`Cấu hình Zalo không hợp lệ: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
    return { row, config: parsed.data };
  }

  /** Dùng access token còn hạn; nếu hết hạn (hoặc không có) thì đổi bằng refresh token và lưu lại. */
  private async ensureAccessToken(rowId: string, config: ZaloMessagingConfig): Promise<string> {
    const expiresAt = config.accessTokenExpiresAt ? new Date(config.accessTokenExpiresAt).getTime() : 0;
    if (config.accessToken && expiresAt > Date.now() + 60_000) return config.accessToken;
    if (!config.refreshToken) {
      if (config.accessToken) return config.accessToken;
      throw new MessagingProviderError('Thiếu refresh token Zalo OA để làm mới access token');
    }
    const form = new URLSearchParams({ refresh_token: config.refreshToken, app_id: config.appId, grant_type: 'refresh_token' });
    const res = await fetch(OAUTH_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', secret_key: config.secretKey }, body: form });
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: string; error?: number; error_name?: string };
    if (!json.access_token) throw new MessagingProviderError(`Không làm mới được access token Zalo: ${json.error_name ?? json.error ?? res.status}`, false, json);
    const next: ZaloMessagingConfig = {
      ...config,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? config.refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000).toISOString(),
    };
    await this.prisma.integrationConfig.update({ where: { id: rowId }, data: { config: next } });
    return next.accessToken!;
  }
}
