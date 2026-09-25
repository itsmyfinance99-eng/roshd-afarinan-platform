import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  maskRecipient,
  type NotificationMessage,
  type NotificationProvider,
  type NotificationResult,
} from '../ports/notification-provider';

/** Development adapter: records the notification in the structured log (recipient masked). */
export class LogNotificationProvider implements NotificationProvider {
  readonly driver = 'log';
  readonly sent: NotificationMessage[] = [];
  private readonly logger = new Logger('Notifications');

  send(message: NotificationMessage): Promise<NotificationResult> {
    this.sent.push(message);
    this.logger.log(
      { channel: message.channel, to: maskRecipient(message.to), template: message.template },
      'notification (log driver)',
    );
    return Promise.resolve({ accepted: true, providerMessageId: `log-${randomUUID()}` });
  }
}
