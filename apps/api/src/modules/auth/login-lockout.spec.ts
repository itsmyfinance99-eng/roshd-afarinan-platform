import { describe, expect, it } from 'vitest';
import { isLocked, minutesLeft } from './login-lockout';

const now = new Date('2026-09-26T12:00:00Z');

describe('login lockout', () => {
  it('is locked only until the lock instant', () => {
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(new Date('2026-09-26T12:15:00Z'), now)).toBe(true);
    expect(isLocked(now, now)).toBe(false);
  });

  it('reports the remaining minutes rounded up, never zero', () => {
    expect(minutesLeft(new Date('2026-09-26T12:14:01Z'), now)).toBe(15);
    expect(minutesLeft(new Date('2026-09-26T12:00:05Z'), now)).toBe(1);
  });
});
