import { describe, expect, it } from 'vitest';
import { canCancel, canStartPayment, generateOrderCode, orderTotal } from './order.policy';

describe('order policy', () => {
  it('allows paying and cancelling only pending orders', () => {
    expect(canStartPayment('PENDING_PAYMENT')).toEqual({ ok: true });
    expect(canStartPayment('PAID')).toEqual({ ok: false, reason: 'paid' });
    expect(canStartPayment('CANCELLED')).toEqual({ ok: false, reason: 'cancelled' });
    expect(canCancel('PAID')).toEqual({ ok: false, reason: 'paid' });
  });

  it('sums whole rials exactly, beyond the safe integer range', () => {
    expect(
      orderTotal([
        { unitPriceRials: 9_007_199_254_740_993n, quantity: 1 },
        { unitPriceRials: 25_000_000n, quantity: 2 },
      ]),
    ).toBe(9_007_199_304_740_993n);
    expect(orderTotal([])).toBe(0n);
  });

  it('generates readable order codes', () => {
    expect(generateOrderCode()).toMatch(/^OR-[0-9A-HJKMNP-TV-Z]{8}$/);
  });
});
