import { describe, expect, it } from 'vitest';
import { unavailableOrKnownCode } from './all-exceptions.filter';

/** ST-26.05 (F-13): an unreachable or saturated database is a retryable 503, not a bug. */
describe('database errors', () => {
  it.each([
    ['pool timeout', { name: 'Error', message: 'Connection terminated due to connection timeout' }],
    [
      'prisma transaction',
      {
        name: 'PrismaClientKnownRequestError',
        code: 'P2024',
        message: 'Timed out fetching a new connection from the pool',
      },
    ],
    ['prisma unreachable', { name: 'PrismaClientKnownRequestError', code: 'P1001', message: 'x' }],
    ['statement timeout', { name: 'error', code: '57014', message: 'canceling statement' }],
    ['refused socket', { name: 'Error', code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }],
    [
      'transaction start',
      {
        name: 'PrismaClientKnownRequestError',
        code: 'P2028',
        message: 'Transaction API error: Unable to start a transaction in the given time.',
      },
    ],
  ])('maps a %s to SERVICE_UNAVAILABLE', (_name, error) => {
    expect(unavailableOrKnownCode(error)).toBe('SERVICE_UNAVAILABLE');
  });

  it('keeps the meaning of real data errors', () => {
    expect(
      unavailableOrKnownCode({ name: 'PrismaClientKnownRequestError', code: 'P2002', message: '' }),
    ).toBe('CONFLICT');
    expect(
      unavailableOrKnownCode({ name: 'PrismaClientKnownRequestError', code: 'P2025', message: '' }),
    ).toBe('NOT_FOUND');
    expect(unavailableOrKnownCode(new TypeError('x is not a function'))).toBeUndefined();
    expect(unavailableOrKnownCode(undefined)).toBeUndefined();
  });
});
