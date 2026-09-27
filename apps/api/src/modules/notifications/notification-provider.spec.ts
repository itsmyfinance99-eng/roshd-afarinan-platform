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

describe('LogNotificationProvider memory', () => {
  it('remembers only the most recent messages', async () => {
    // ST-26.08 (F-09): this adapter is the production default and each message holds a live link.
    const provider = new LogNotificationProvider();
    for (let i = 0; i < 250; i++) {
      await provider.send({
        channel: 'email',
        to: `user${i}@example.com`,
        template: 'auth.password-reset',
        data: { resetUrl: `https://site/reset-password?token=t${i}` },
      });
    }
    expect(provider.sent).toHaveLength(100);
    expect(provider.sent.at(-1)?.to).toBe('user249@example.com');
    expect(JSON.stringify(provider.sent)).not.toContain('token=t0"');
  });
});
