import { describe, expect, it } from 'vitest';
import { toDecimal, toDecimalString } from './decimal';
import { EngineInputError } from './errors';
import {
  annualRateFromPeriod,
  discountFactor,
  futureValue,
  nominalFromReal,
  npv,
  periodRateFromAnnual,
  presentValue,
  realFromNominal,
} from './time-value';

/** Rounds to 12 places for comparison with reference values. */
const r12 = (value: string) => toDecimalString(toDecimal(value), 12);

// Reference values were computed independently with Python's `decimal` module (50 digits),
// not with this engine. A is the textbook case; Excel's NPV(10%, -100, 60, 60) = 3.75657400…
describe('npv (COMFAR XI.E)', () => {
  const yearly = { periodMonths: [12, 12, 12], amounts: ['-100', '60', '60'] };

  it('discounts to the start of the first period', () => {
    const result = npv(yearly, { annualRate: '0.10', reference: 'START_OF_FIRST_PERIOD' });
    expect(r12(result.value)).toBe('3.756574004508');
    expect(result.defaultsUsed).toEqual([]);
  });

  it('defaults to the end of the first year and says so', () => {
    const result = npv(yearly, { annualRate: '0.10' });
    expect(r12(result.value)).toBe('4.132231404959');
    expect(result.defaultsUsed).toEqual([
      { key: 'discounting.referenceDate', value: 'END_OF_FIRST_YEAR' },
    ]);
  });

  it('adds the discounted salvage value at the end of the horizon', () => {
    const result = npv(yearly, {
      annualRate: '0.10',
      reference: 'START_OF_FIRST_PERIOD',
      salvageValue: '10',
    });
    expect(r12(result.value)).toBe('11.269722013524');
  });

  it('handles uneven periods (quarters in construction, then a year)', () => {
    const series = { periodMonths: [3, 3, 3, 3, 12], amounts: ['-50', '-50', '10', '10', '120'] };
    expect(r12(npv(series, { annualRate: '0.12', reference: 'START_OF_FIRST_PERIOD' }).value)).toBe(
      '17.928161426781',
    );
    // Flows before month 12 are compounded forward to the reference date.
    expect(r12(npv(series, { annualRate: '0.12', reference: 'END_OF_FIRST_YEAR' }).value)).toBe(
      '20.079540797995',
    );
  });

  it('accepts a discount-rate path, one rate per period', () => {
    const series = { periodMonths: [12, 12, 12], amounts: ['-100', '50', '80'] };
    const annualRate = ['0.10', '0.15', '0.20'];
    expect(r12(npv(series, { annualRate, reference: 'START_OF_FIRST_PERIOD' }).value)).toBe(
      '1.317523056653',
    );
    expect(r12(npv(series, { annualRate, reference: 'END_OF_FIRST_YEAR' }).value)).toBe(
      '1.449275362319',
    );
  });

  it('is the plain sum at a zero rate', () => {
    expect(npv(yearly, { annualRate: '0', reference: 'START_OF_FIRST_PERIOD' }).value).toBe('20');
  });

  it('works with negative rates above −100 %', () => {
    const value = npv(
      { periodMonths: [12], amounts: ['100'] },
      { annualRate: '-0.5', reference: 'START_OF_FIRST_PERIOD' },
    ).value;
    expect(value).toBe('200');
  });

  it('records the model version', () => {
    expect(npv(yearly, { annualRate: '0.1' }).modelVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('rejects meaningless input instead of guessing', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e instanceof EngineInputError ? e.code : 'other';
      }
      return 'none';
    };
    expect(code(() => npv(yearly, { annualRate: '-1' }))).toBe('rate.notAboveMinus100');
    expect(code(() => npv(yearly, { annualRate: ['0.1', '0.1'] }))).toBe('rate.pathLengthMismatch');
    expect(code(() => npv({ periodMonths: [], amounts: [] }, { annualRate: '0.1' }))).toBe(
      'series.empty',
    );
    expect(
      code(() => npv({ periodMonths: [12], amounts: ['1', '2'] }, { annualRate: '0.1' })),
    ).toBe('series.lengthMismatch');
    expect(code(() => npv({ periodMonths: [0], amounts: ['1'] }, { annualRate: '0.1' }))).toBe(
      'period.lengthNotPositiveInteger',
    );
  });
});

describe('rates and single amounts', () => {
  it('converts annual and period rates both ways', () => {
    expect(r12(periodRateFromAnnual('0.12', 1))).toBe('0.009488792935');
    expect(r12(annualRateFromPeriod('0.01', 1))).toBe('0.126825030132');
    expect(r12(annualRateFromPeriod(periodRateFromAnnual('0.3', 3), 3))).toBe('0.300000000000');
  });

  it('applies the Fisher relation', () => {
    expect(nominalFromReal('0.05', '0.30')).toBe('0.365');
    expect(r12(realFromNominal('0.365', '0.30'))).toBe('0.050000000000');
  });

  it('discounts and compounds with the month-based factor', () => {
    expect(discountFactor('0.10', '12')).toBe('1.1');
    expect(r12(discountFactor('0.10', '-12'))).toBe('0.909090909091');
    expect(discountFactor('0.25', '0')).toBe('1');
    expect(presentValue('110', '0.10', '12')).toBe('100');
    expect(futureValue('100', '0.10', '24')).toBe('121');
  });
});
