import { describe, expect, it } from 'vitest';
import { createInvestmentSchema } from './investment';

const base = {
  slug: 'iron-ore',
  title: 'فرآوری سنگ آهن',
  summary: 'طرح فرآوری سنگ آهن در کرمان',
  description: 'متن',
  sector: 'MINING',
  stage: 'IDEA',
};

describe('investment schema', () => {
  it('accepts a positive rial amount (Persian digits) and rejects zero or fractions', () => {
    expect(
      createInvestmentSchema.parse({ ...base, estimatedInvestmentRials: '۱٬۰۰۰٬۰۰۰' })
        .estimatedInvestmentRials,
    ).toBe('1000000');
    expect(
      createInvestmentSchema.safeParse({ ...base, estimatedInvestmentRials: '0' }).success,
    ).toBe(false);
    expect(
      createInvestmentSchema.safeParse({ ...base, estimatedInvestmentRials: '10.5' }).success,
    ).toBe(false);
  });

  it('only accepts known sectors and stages', () => {
    expect(createInvestmentSchema.safeParse({ ...base, sector: 'CRYPTO' }).success).toBe(false);
    expect(createInvestmentSchema.safeParse({ ...base, stage: 'FUNDED' }).success).toBe(false);
  });
});
