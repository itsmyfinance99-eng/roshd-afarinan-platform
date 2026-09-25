/**
 * Port for outbound notifications (SMS / email). Providers are chosen after OQ-08.
 * Messages are template-based so copy stays out of business logic.
 */
export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

export type NotificationChannel = 'sms' | 'email';

export interface NotificationMessage {
  channel: NotificationChannel;
  /** Mobile (09XXXXXXXXX) or email address. */
  to: string;
  /** Template identifier, e.g. `service-request.received`. */
  template: string;
  data: Record<string, string | number>;
}

export interface NotificationResult {
  accepted: boolean;
  providerMessageId?: string;
}

export interface NotificationProvider {
  readonly driver: string;
  send(message: NotificationMessage): Promise<NotificationResult>;
}

/** Masks a recipient for logs: 0912***6789 / a***@example.com. */
export function maskRecipient(to: string): string {
  if (to.includes('@')) {
    const [local = '', domain = ''] = to.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return to.length > 7 ? `${to.slice(0, 4)}***${to.slice(-4)}` : '***';
}
