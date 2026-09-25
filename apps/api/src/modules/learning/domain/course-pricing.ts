import { PRICE_ERRORS } from '@roshd/validation';

export interface CoursePricing {
  isFree: boolean;
  /** Whole rials as a digit string; null = price on request. */
  priceRials: string | null;
}

export const PAID_ZERO_PRICE =
  'مبلغ صفر مجاز نیست؛ برای دوره رایگان گزینه «رایگان» را انتخاب کنید.';

/**
 * Pricing invariant of a course (checked on the merged record, so partial updates are safe):
 * free courses carry no price; paid courses have a positive price or none ("price on request").
 */
export function pricingViolation(pricing: CoursePricing): string | null {
  if (pricing.isFree) return pricing.priceRials === null ? null : PRICE_ERRORS.freeWithPrice;
  if (pricing.priceRials === '0') return PAID_ZERO_PRICE;
  return null;
}

/** Applies a partial update to the current pricing. `undefined` keeps, `null` clears the price. */
export function mergePricing(
  current: CoursePricing,
  patch: { isFree?: boolean; priceRials?: string | null },
): CoursePricing {
  return {
    isFree: patch.isFree ?? current.isFree,
    priceRials: patch.priceRials === undefined ? current.priceRials : patch.priceRials,
  };
}
