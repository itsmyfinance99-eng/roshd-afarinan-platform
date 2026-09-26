import { describe, expect, it } from 'vitest';
import { REDACTED, redactMetadata } from './redact';

describe('redactMetadata', () => {
  it('keeps ordinary fields and redacts secret-like keys at any depth', () => {
    expect(
      redactMetadata({
        slug: 'x',
        before: ['user'],
        password: 'hunter2',
        nested: { refreshToken: 'abc', apiKey: 'k', passwordHash: 'h', note: 'ok' },
        list: [{ sig: 's', size: 3 }],
      }),
    ).toEqual({
      slug: 'x',
      before: ['user'],
      password: REDACTED,
      nested: { refreshToken: REDACTED, apiKey: REDACTED, passwordHash: REDACTED, note: 'ok' },
      list: [{ sig: REDACTED, size: 3 }],
    });
  });

  it('passes through primitives and null', () => {
    expect(redactMetadata(null)).toBeNull();
    expect(redactMetadata('text')).toBe('text');
    expect(redactMetadata(5)).toBe(5);
  });
});
