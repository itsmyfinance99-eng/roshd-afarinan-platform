import { describe, expect, it } from 'vitest';
import { isSignedFileUrl } from './signed-file';

describe('signed address of a file', () => {
  it('is a site-relative address of the files route with its signature', () => {
    expect(
      isSignedFileUrl('/api/v1/files/0199f0aa-1111-7222-8333-444455556666/content?exp=1&sig=s'),
    ).toBe(true);
  });

  it('is nothing else', () => {
    for (const url of [
      'https://example.org/api/v1/files/0199f0aa/content?exp=1&sig=s',
      '//example.org/api/v1/files/0199f0aa/content?exp=1',
      'javascript:alert(1)',
      '/api/v1/files/../auth/logout?x=1',
      '/api/v1/files/0199f0aa/content',
      '/dashboard',
      '',
      undefined,
      null,
      { url: '/api/v1/files/0199f0aa/content?exp=1' },
    ]) {
      expect(isSignedFileUrl(url), String(url)).toBe(false);
    }
  });
});
