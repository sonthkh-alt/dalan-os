/** Giao diện nhà cung cấp gửi tin: Zalo ZNS, SMS, email. Mọi bản triển khai đều phải idempotent theo trackingId. */

export type MessagingChannel = 'ZNS' | 'SMS' | 'EMAIL';

export interface SendTemplateInput {
  /** Mã mẫu nội bộ (NotificationTemplates), nhà cung cấp ánh xạ sang template id riêng. */
  templateCode: string;
  /** Số điện thoại E.164 (+84...) hoặc email. */
  recipient: string;
  /** Tham số điền vào mẫu, chuỗi phẳng. */
  params: Record<string, string>;
  /** Mã theo dõi duy nhất (id NotificationLog) để nhà cung cấp chống trùng. */
  trackingId: string;
  /** Văn bản dự phòng khi kênh không hỗ trợ mẫu (SMS, email). */
  fallbackText?: string;
}

export interface SendResult {
  providerMsgId?: string;
  /** Nhà cung cấp báo gửi thành công nhưng chưa biết đã nhận hay chưa. */
  accepted: boolean;
  raw?: unknown;
}

export interface MessagingProvider {
  readonly name: string;
  /** Kênh mà nhà cung cấp hỗ trợ; service sẽ dùng kênh dự phòng nếu kênh yêu cầu không có. */
  supports(channel: MessagingChannel): boolean;
  send(channel: MessagingChannel, input: SendTemplateInput): Promise<SendResult>;
}

export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');

export class MessagingProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'MessagingProviderError';
  }
}
