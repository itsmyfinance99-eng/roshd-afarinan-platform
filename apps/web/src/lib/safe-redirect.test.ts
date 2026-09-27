import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/dashboard/requests')).toBe('/dashboard/requests');
  });

  it('keeps the query and hash of a same-site path', () => {
    expect(safeNextPath('/dashboard/requests?page=2#top')).toBe('/dashboard/requests?page=2#top');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    // Browsers drop control characters and whitespace, turning these into "//host" (F-12).
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/ /evil.example',
    '/\t\\evil.example',
    '',
    null,
  ])('rejects %j', (value) => {
    expect(safeNextPath(value)).toBe('/dashboard');
  });
});
