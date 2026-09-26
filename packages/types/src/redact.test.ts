import { describe, expect, it } from 'vitest';
import { routeOf, scrub } from './redact';

describe('scrub', () => {
  it('removes personal data and secrets', () => {
    const out = scrub(
      'user maryam@example.com mobile 09121234567 +989121234567 card 6037991234567890 ' +
        'Bearer abc.def-ghi token=s3cr3t password: "hunter2" ' +
        'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig key QmFzZTY0U2VjcmV0S2V5VGhhdElzVmVyeUxvbmc5OTk5',
    );
    for (const leaked of [
      'maryam@example.com',
      '09121234567',
      '9121234567',
      '6037991234567890',
      'abc.def-ghi',
      's3cr3t',
      'hunter2',
      'eyJhbGciOiJIUzI1NiJ9',
      'QmFzZTY0U2VjcmV0S2V5',
    ]) {
      expect(out).not.toContain(leaked);
    }
    expect(out).toContain('[email]');
    expect(out).toContain('[mobile]');
  });

  it('keeps ids, short numbers and file paths readable', () => {
    const text =
      'ticket 0199aaaa-0000-7000-8000-000000000000 status 500 at ' +
      '/home/runner/work/roshd-afarinan-platform/apps/api/src/modules/service-requests/service-requests.service.ts:120:15';
    expect(scrub(text)).toBe(text);
  });
});

describe('routeOf', () => {
  it('drops the query string and fragment', () => {
    expect(routeOf('/api/v1/files/1/content?exp=1&sig=abcdef')).toBe('/api/v1/files/1/content');
    expect(routeOf('/api/v1/search?q=maryam@example.com#x')).toBe('/api/v1/search');
    expect(routeOf(undefined)).toBeUndefined();
  });
});
