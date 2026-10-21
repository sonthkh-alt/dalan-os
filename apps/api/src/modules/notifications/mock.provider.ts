import { Logger } from '@nestjs/common';
import type { MessagingChannel, MessagingProvider, SendResult, SendTemplateInput } from './messaging.provider.js';

/**
 * Bản giả lập cho dev, demo và CI: không gọi ra ngoài, chỉ ghi log.
 * Ghi vào bộ đệm trong bộ nhớ để kiểm thử có thể đọc lại tin đã "gửi".
 */
export class MockMessagingProvider implements MessagingProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MessagingMock');
  readonly sent: { channel: MessagingChannel; input: SendTemplateInput; at: Date }[] = [];

  supports(): boolean {
    return true;
  }

  async send(channel: MessagingChannel, input: SendTemplateInput): Promise<SendResult> {
    this.sent.push({ channel, input, at: new Date() });
    if (this.sent.length > 500) this.sent.shift();
    this.logger.log(`[${channel}] ${input.templateCode} → ${input.recipient} ${JSON.stringify(input.params)}`);
    return { accepted: true, providerMsgId: `mock-${input.trackingId}` };
  }
}
