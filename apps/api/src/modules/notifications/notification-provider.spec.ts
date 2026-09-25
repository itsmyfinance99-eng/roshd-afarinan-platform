import { describe, expect, it } from 'vitest';
import { LogNotificationProvider } from './adapters/log-notification-provider';
import { maskRecipient } from './ports/notification-provider';

describe('notifications', () => {
  it('masks recipients for logs', () => {
    expect(maskRecipient('09121234567')).toBe('0912***4567');
    expect(maskRecipient('maryam@example.com')).toBe('m***@example.com');
    expect(maskRecipient('123')).toBe('***');
  });

  it('log provider accepts and records messages', async () => {
    const provider = new LogNotificationProvider();
    const result = await provider.send({
      channel: 'sms',
      to: '09121234567',
      template: 'service-request.received',
      data: { code: 'RA-1' },
    });
    expect(result.accepted).toBe(true);
    expect(provider.sent).toHaveLength(1);
  });
});
