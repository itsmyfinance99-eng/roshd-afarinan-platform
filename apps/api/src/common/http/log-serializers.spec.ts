import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { logPath, requestSerializer } from './log-serializers';

describe('logPath', () => {
  it('keeps the path and hides the query string', () => {
    // The guest tracking route takes a mobile number and signed links carry a live signature.
    expect(logPath('/api/v1/service-requests/track?code=RA-1&mobile=09121234567')).toBe(
      '/api/v1/service-requests/track?[REDACTED]',
    );
    expect(logPath('/api/v1/files/abc/content?exp=1&sig=deadbeef')).toBe(
      '/api/v1/files/abc/content?[REDACTED]',
    );
    expect(logPath('/api/v1/articles')).toBe('/api/v1/articles');
    expect(logPath(undefined)).toBe('');
  });
});

describe('requestSerializer', () => {
  const req = (url: string, headers: Record<string, string> = {}) =>
    ({
      id: 'r1',
      method: 'GET',
      url,
      headers,
      socket: { remoteAddress: '127.0.0.1' },
    }) as unknown as IncomingMessage & { id?: unknown };

  it('logs no query string, no parsed query and no credential headers', () => {
    const logged = requestSerializer(
      req('/api/v1/search?q=%D8%A7%D9%85%DA%A9%D8%A7%D9%86', {
        authorization: 'Bearer secret-token',
        cookie: 'ra_at=secret',
        'user-agent': 'probe',
        referer: 'https://site/reset-password?token=live-token',
      }),
    );
    const text = JSON.stringify(logged);
    expect(logged.url).toBe('/api/v1/search?[REDACTED]');
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('ra_at');
    expect(text).not.toContain('live-token');
    expect(text).not.toContain('query');
    expect(logged.headers['user-agent']).toBe('probe');
    expect(logged.remoteAddress).toBe('127.0.0.1');
  });
});
