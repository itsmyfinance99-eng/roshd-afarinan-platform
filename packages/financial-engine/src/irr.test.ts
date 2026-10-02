import { describe, expect, it } from 'vitest';
import { toDecimal, toDecimalString } from './decimal';
import { irr, mirr, signChanges } from './irr';
import { npv } from './time-value';

const r12 = (value: string | undefined) =>
  value === undefined ? undefined : toDecimalString(toDecimal(value), 12);

// Reference values: Python `decimal` (50 digits) with its own bisection, independent of this engine.
describe('irr (COMFAR XI.E)', () => {
  const textbook = { periodMonths: [12, 12, 12], amounts: ['-100', '60', '60'] };

  it('finds the single root of a conventional series', () => {
    const result = irr(textbook);
    expect(r12(result.value)).toBe('0.130662386292');
    expect(result.warnings).toEqual([]);
  });

  it('handles uneven periods', () => {
    const series = {
      periodMonths: [3, 3, 3, 3, 12, 12],
      amounts: ['-40', '-40', '-20', '10', '60', '70'],
    };
    expect(r12(irr(series).value)).toBe('0.188608585498');
  });

  it('makes NPV vanish at the IRR (property)', () => {
    const cases = [
      textbook,
      { periodMonths: [12, 12, 12, 12, 12], amounts: ['-1000', '-500', '400', '700', '900'] },
      {
        periodMonths: [6, 6, 6, 6],
        amounts: ['-250000000000', '90000000000', '100000000000', '110000000000'],
      },
    ];
    for (const series of cases) {
      const rate = irr(series).value;
      expect(rate).toBeDefined();
      const value = npv(series, { annualRate: rate!, reference: 'START_OF_FIRST_PERIOD' }).value;
      const scale = toDecimal(series.amounts[0]!).abs();
      expect(
        toDecimal(value).abs().div(scale).lt('1e-12'),
        `${series.amounts.join(',')}: ${value}`,
      ).toBe(true);
    }
  });

  it('reports several roots instead of picking one', () => {
    // −100, +230, −132 has roots at 10 % and 20 %.
    const result = irr({ periodMonths: [12, 12, 12], amounts: ['-100', '230', '-132'] });
    expect(result.value).toBeUndefined();
    expect(result.warnings[0]?.code).toBe('irr.multiple');
    expect(result.warnings[0]?.params?.count).toBe('2');
    const roots = result.warnings[0]!.params!.roots!.split(' ').map((r) => r12(r));
    expect(roots).toEqual(['0.100000000000', '0.200000000000']);
  });

  it('reports a series without a sign change', () => {
    const result = irr({ periodMonths: [12, 12], amounts: ['100', '50'] });
    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual([{ code: 'irr.noSignChange' }]);
  });

  it('reports a root outside the search range', () => {
    const result = irr({ periodMonths: [12, 12], amounts: ['-100', '0.5'] });
    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual([{ code: 'irr.notFound' }]);
  });

  it('counts sign changes, skipping zeros', () => {
    expect(signChanges(['-100', '0', '60', '-10', '0', '20'])).toBe(3);
    expect(signChanges(['5', '5'])).toBe(0);
  });
});

describe('mirr (COMFAR XI.E)', () => {
  const textbook = { periodMonths: [12, 12, 12], amounts: ['-100', '60', '60'] };

  it('compounds surpluses and discounts deficits with separate rates', () => {
    const atStart = mirr(textbook, {
      reinvestmentRate: '0.12',
      borrowingRate: '0.10',
      reference: 'START_OF_FIRST_PERIOD',
    });
    expect(r12(atStart.value)).toBe('0.118475817873');
    expect(atStart.defaultsUsed).toEqual([]);
  });

  it('matches Excel MIRR when the reference is the end of the first year', () => {
    // Excel MIRR({-100,60,60}, 10%, 12%) = 12.7829…%
    const result = mirr(textbook, { reinvestmentRate: '0.12', borrowingRate: '0.10' });
    expect(r12(result.value)).toBe('0.127829774390');
    expect(result.defaultsUsed).toEqual([
      { key: 'discounting.referenceDate', value: 'END_OF_FIRST_YEAR' },
    ]);
  });

  it('defaults both rates to the IRR and says so, which makes MIRR equal the IRR', () => {
    const result = mirr(textbook, { reference: 'START_OF_FIRST_PERIOD' });
    const internal = irr(textbook).value!;
    expect(result.defaultsUsed).toEqual([{ key: 'mirr.rates', value: internal }]);
    expect(r12(result.value)).toBe(r12(internal));
  });

  it('needs explicit rates when the IRR does not exist or is not unique', () => {
    const result = mirr({ periodMonths: [12, 12, 12], amounts: ['-100', '230', '-132'] });
    expect(result.value).toBeUndefined();
    expect(result.warnings[0]?.code).toBe('mirr.ratesRequired');
  });

  it('is unique even where the IRR is not', () => {
    const result = mirr(
      { periodMonths: [12, 12, 12], amounts: ['-100', '230', '-132'] },
      { reinvestmentRate: '0.15', borrowingRate: '0.15', reference: 'START_OF_FIRST_PERIOD' },
    );
    expect(result.value).toBeDefined();
  });

  it('reports a series without any deficit', () => {
    const result = mirr(
      { periodMonths: [12, 12], amounts: ['10', '20'] },
      { reinvestmentRate: '0.1', borrowingRate: '0.1' },
    );
    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual([{ code: 'mirr.noDeficit' }]);
  });
});
