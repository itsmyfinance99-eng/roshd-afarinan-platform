import { PRICE_ERRORS } from '@roshd/validation';
import { describe, expect, it } from 'vitest';
import { mergePricing, PAID_ZERO_PRICE, pricingViolation } from './course-pricing';

describe('course pricing', () => {
  it('accepts free courses without a price and paid courses with or without one', () => {
    expect(pricingViolation({ isFree: true, priceRials: null })).toBeNull();
    expect(pricingViolation({ isFree: false, priceRials: '25000000' })).toBeNull();
    expect(pricingViolation({ isFree: false, priceRials: null })).toBeNull();
  });

  it('rejects a free course with a price and a paid course priced at zero', () => {
    expect(pricingViolation({ isFree: true, priceRials: '1000' })).toBe(PRICE_ERRORS.freeWithPrice);
    expect(pricingViolation({ isFree: true, priceRials: '0' })).toBe(PRICE_ERRORS.freeWithPrice);
    expect(pricingViolation({ isFree: false, priceRials: '0' })).toBe(PAID_ZERO_PRICE);
  });

  it('merges partial updates: undefined keeps, null clears', () => {
    const current = { isFree: false, priceRials: '5000' };
    expect(mergePricing(current, {})).toEqual(current);
    expect(mergePricing(current, { isFree: true })).toEqual({ isFree: true, priceRials: '5000' });
    expect(mergePricing(current, { isFree: true, priceRials: null })).toEqual({
      isFree: true,
      priceRials: null,
    });
  });

  it('detects a violation introduced by a partial update', () => {
    const merged = mergePricing({ isFree: false, priceRials: '5000' }, { isFree: true });
    expect(pricingViolation(merged)).toBe(PRICE_ERRORS.freeWithPrice);
  });
});
