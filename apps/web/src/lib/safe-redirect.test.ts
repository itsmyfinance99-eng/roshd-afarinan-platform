import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/dashboard/requests')).toBe('/dashboard/requests');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '',
    null,
  ])('rejects %j', (value) => {
    expect(safeNextPath(value)).toBe('/dashboard');
  });
});
