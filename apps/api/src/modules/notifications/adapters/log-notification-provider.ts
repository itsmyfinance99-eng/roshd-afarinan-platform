import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  maskRecipient,
  type NotificationMessage,
  type NotificationProvider,
  type NotificationResult,
} from '../ports/notification-provider';

/** Messages kept in memory; enough for any test, small enough to never grow unbounded. */
const MAX_REMEMBERED = 100;

/** Development adapter: records the notification in the structured log (recipient masked). */
export class LogNotificationProvider implements NotificationProvider {
  readonly driver = 'log';
  /**
   * Recent messages, for tests that assert what was sent. Bounded because this adapter is the
   * production default until a provider is chosen (OQ-08), and every message holds a live reset
   * or verification link (ST-26.08, finding F-09).
   */
  readonly sent: NotificationMessage[] = [];
  private readonly logger = new Logger('Notifications');

  send(message: NotificationMessage): Promise<NotificationResult> {
    this.sent.push(message);
    if (this.sent.length > MAX_REMEMBERED) this.sent.splice(0, this.sent.length - MAX_REMEMBERED);
    this.logger.log(
      { channel: message.channel, to: maskRecipient(message.to), template: message.template },
      'notification (log driver)',
    );
    return Promise.resolve({ accepted: true, providerMessageId: `log-${randomUUID()}` });
  }
}
