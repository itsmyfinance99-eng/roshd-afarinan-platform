import { describe, expect, it } from 'vitest';
import { toDecimal, toDecimalString } from './decimal';
import { depreciationSchedule, revaluedDepreciation, type DepreciationInput } from './depreciation';
import { EngineInputError } from './errors';

const r9 = (value: string) => toDecimalString(toDecimal(value), 9);
const charges = (input: DepreciationInput) =>
  depreciationSchedule(input).value.years.map((y) => r9(y.depreciation));
const total = (input: DepreciationInput) =>
  depreciationSchedule(input)
    .value.years.reduce((sum, y) => sum.plus(y.depreciation), toDecimal('0'))
    .toFixed();

// Reference values: Python `decimal`, written from the manual's formulas (XI.H) independently of
// this engine's algorithm (e.g. the `M = integral part of …` form for the linear methods). Where the
// printed formulas are inconsistent (declining-balance remaining life, the shifted sum-of-years-digits
// cases) the references apply the rules recorded in comfar-model-spec §4.4.1.
describe('depreciationSchedule (COMFAR XI.H)', () => {
  it('linear to scrap with a partial first year writes the remainder off in year M + 1', () => {
    const input: DepreciationInput = {
      method: 'LINEAR_TO_SCRAP',
      initialBookValue: '1000',
      lifeMonths: 60,
      salvageRate: '0.1',
      firstYearMonths: 6,
    };
    const { value } = depreciationSchedule(input);
    expect(value.salvageValue).toBe('100');
    expect(value.years).toEqual([
      { year: 0, depreciation: '90', bookValue: '910' },
      { year: 1, depreciation: '180', bookValue: '730' },
      { year: 2, depreciation: '180', bookValue: '550' },
      { year: 3, depreciation: '180', bookValue: '370' },
      { year: 4, depreciation: '180', bookValue: '190' },
      { year: 5, depreciation: '90', bookValue: '100' },
    ]);
  });

  it('linear to scrap with a life in years and months', () => {
    expect(
      charges({
        method: 'LINEAR_TO_SCRAP',
        initialBookValue: '1000',
        lifeMonths: 66,
        salvageRate: '0',
        firstYearMonths: 12,
      }),
    ).toEqual([
      '181.818181818',
      '181.818181818',
      '181.818181818',
      '181.818181818',
      '181.818181818',
      '90.909090909',
    ]);
  });

  it('linear to zero charges IBV / L until the salvage value is reached', () => {
    const { value } = depreciationSchedule({
      method: 'LINEAR_TO_ZERO',
      initialBookValue: '1000',
      lifeMonths: 60,
      salvageRate: '0.1',
      firstYearMonths: 12,
    });
    expect(value.years.map((y) => y.depreciation)).toEqual(['200', '200', '200', '200', '100']);
    expect(value.years.at(-1)?.bookValue).toBe('100');
  });

  it('never goes below salvage when the life is shorter than the first year', () => {
    expect(
      charges({
        method: 'LINEAR_TO_SCRAP',
        initialBookValue: '1000',
        lifeMonths: 6,
        salvageRate: '0',
        firstYearMonths: 12,
      }),
    ).toEqual(['1000.000000000']);
  });

  it('declining balance switches to linear to scrap over the remaining life', () => {
    const { value } = depreciationSchedule({
      method: 'DECLINING_BALANCE',
      initialBookValue: '1000',
      lifeMonths: 60,
      salvageRate: '0',
      firstYearMonths: 12,
      decliningRate: '0.4',
    });
    expect(value.years.map((y) => y.depreciation)).toEqual(['400', '240', '144', '108', '108']);
    expect(value.switchedToLinearInYear).toBe(3);
    expect(value.years).toHaveLength(5); // the full life of five years
  });

  it('declining balance writes a life within the first year off in that year', () => {
    const { value } = depreciationSchedule({
      method: 'DECLINING_BALANCE',
      initialBookValue: '1000',
      lifeMonths: 12,
      salvageRate: '0',
      firstYearMonths: 12,
      decliningRate: '0.4',
    });
    expect(value.years).toEqual([{ year: 0, depreciation: '1000', bookValue: '0' }]);
    expect(value.switchedToLinearInYear).toBeUndefined();
  });

  it('declining balance with a partial first year and salvage', () => {
    const input: DepreciationInput = {
      method: 'DECLINING_BALANCE',
      initialBookValue: '1000',
      lifeMonths: 60,
      salvageRate: '0.1',
      firstYearMonths: 6,
      decliningRate: '0.3',
    };
    expect(charges(input)).toEqual([
      '150.000000000',
      '255.000000000',
      '178.500000000',
      '126.600000000',
      '126.600000000',
      '63.300000000',
    ]);
    expect(total(input)).toBe('900');
  });

  it('sum of years digits over whole years', () => {
    const input: DepreciationInput = {
      method: 'SUM_OF_YEARS_DIGITS',
      initialBookValue: '1500',
      lifeMonths: 60,
      salvageRate: '0',
      firstYearMonths: 12,
    };
    expect(depreciationSchedule(input).value.years.map((y) => y.depreciation)).toEqual([
      '500',
      '400',
      '300',
      '200',
      '100',
    ]);
  });

  it('sum of years digits shifted by a partial first year', () => {
    const input: DepreciationInput = {
      method: 'SUM_OF_YEARS_DIGITS',
      initialBookValue: '1500',
      lifeMonths: 60,
      salvageRate: '0',
      firstYearMonths: 6,
    };
    expect(depreciationSchedule(input).value.years.map((y) => y.depreciation)).toEqual([
      '250',
      '450',
      '350',
      '250',
      '150',
      '50',
    ]);
  });

  it('sum of years digits with extra months, first year shorter than the stub (m1 ≤ m)', () => {
    const input: DepreciationInput = {
      method: 'SUM_OF_YEARS_DIGITS',
      initialBookValue: '1000',
      lifeMonths: 33,
      salvageRate: '0',
      firstYearMonths: 6,
    };
    expect(charges(input)).toEqual([
      '261.904761905',
      '434.523809524',
      '252.976190476',
      '50.595238095',
    ]);
    expect(total(input)).toBe('1000');
  });

  it('sum of years digits with extra months, first year longer than the stub (m1 > m)', () => {
    const input: DepreciationInput = {
      method: 'SUM_OF_YEARS_DIGITS',
      initialBookValue: '1000',
      lifeMonths: 33,
      salvageRate: '0',
      firstYearMonths: 12,
    };
    expect(charges(input)).toEqual(['494.047619048', '354.166666667', '151.785714286']);
    expect(total(input)).toBe('1000');
  });

  it('sum of years digits for a life under one year', () => {
    expect(
      charges({
        method: 'SUM_OF_YEARS_DIGITS',
        initialBookValue: '800',
        lifeMonths: 8,
        salvageRate: '0',
        firstYearMonths: 12,
      }),
    ).toEqual(['800.000000000']);
  });

  it('depreciates exactly IBV − SV with every method (property)', () => {
    const methods = [
      'LINEAR_TO_ZERO',
      'LINEAR_TO_SCRAP',
      'DECLINING_BALANCE',
      'SUM_OF_YEARS_DIGITS',
    ];
    for (const method of methods) {
      for (const lifeMonths of [7, 12, 30, 61, 120]) {
        for (const firstYearMonths of [1, 5, 12]) {
          const input = {
            method,
            initialBookValue: '123456789.25',
            lifeMonths,
            salvageRate: '0.05',
            firstYearMonths,
            decliningRate: '0.25',
          } as DepreciationInput;
          const { value } = depreciationSchedule(input);
          const label = `${method} ${lifeMonths} ${firstYearMonths}`;
          // Summing the yearly charges here rounds in the 34th digit, hence the tolerance.
          const residue = toDecimal(total(input)).minus('117283949.7875').abs();
          expect(residue.lt('1e-20'), `${label}: ${residue.toFixed()}`).toBe(true);
          expect(value.years.at(-1)?.bookValue, label).toBe('6172839.4625');
          for (const y of value.years) expect(toDecimal(y.depreciation).gte(0), label).toBe(true);
          // The schedule spans exactly the life for these parameters: the first year plus whole
          // years for the rest. (Linear to zero, and declining balance with other rates, may end
          // earlier when the book value reaches salvage.)
          const rest = lifeMonths - firstYearMonths;
          const years = rest <= 0 ? 1 : 1 + (rest - (rest % 12)) / 12 + (rest % 12 === 0 ? 0 : 1);
          if (method !== 'LINEAR_TO_ZERO') expect(value.years, label).toHaveLength(years);
          else expect(value.years.length, label).toBeLessThanOrEqual(years);
        }
      }
    }
  });

  it('returns an empty schedule when there is nothing to depreciate', () => {
    const { value } = depreciationSchedule({
      method: 'LINEAR_TO_SCRAP',
      initialBookValue: '0',
      lifeMonths: 60,
      salvageRate: '0',
      firstYearMonths: 12,
    });
    expect(value.years).toEqual([]);
  });

  it('rejects invalid conditions', () => {
    const base: DepreciationInput = {
      method: 'LINEAR_TO_SCRAP',
      initialBookValue: '1000',
      lifeMonths: 60,
      salvageRate: '0',
      firstYearMonths: 12,
    };
    const invalid: [Partial<DepreciationInput>, string, string][] = [
      [{ initialBookValue: '-1' }, 'amount.negative', 'initialBookValue'],
      [{ lifeMonths: 0 }, 'period.lengthNotPositiveInteger', 'lifeMonths'],
      [{ lifeMonths: 2.5 }, 'period.lengthNotPositiveInteger', 'lifeMonths'],
      [{ lifeMonths: 1201 }, 'depreciation.lifeTooLong', 'lifeMonths'],
      [{ firstYearMonths: 0 }, 'depreciation.firstYearMonths', 'firstYearMonths'],
      [{ firstYearMonths: 13 }, 'depreciation.firstYearMonths', 'firstYearMonths'],
      [{ salvageRate: '1' }, 'rate.notInUnitInterval', 'salvageRate'],
      [{ salvageRate: '-0.1' }, 'rate.notInUnitInterval', 'salvageRate'],
      [{ method: 'DECLINING_BALANCE' }, 'depreciation.rateRequired', 'decliningRate'],
      [
        { method: 'DECLINING_BALANCE', decliningRate: '0' },
        'depreciation.rateOutOfRange',
        'decliningRate',
      ],
      [
        { method: 'DECLINING_BALANCE', decliningRate: '1.5' },
        'depreciation.rateOutOfRange',
        'decliningRate',
      ],
    ];
    for (const [change, code, field] of invalid) {
      let error: unknown;
      try {
        depreciationSchedule({ ...base, ...change });
      } catch (e) {
        error = e;
      }
      expect(error, JSON.stringify(change)).toBeInstanceOf(EngineInputError);
      expect((error as EngineInputError).code, JSON.stringify(change)).toBe(code);
      expect((error as EngineInputError).field, JSON.stringify(change)).toBe(field);
    }
  });
});

describe('revaluedDepreciation (COMFAR XI.B)', () => {
  it('scales depreciation and book value by the index and keeps the balance sheet balanced', () => {
    const schedule = depreciationSchedule({
      method: 'LINEAR_TO_SCRAP',
      initialBookValue: '1000',
      lifeMonths: 36,
      salvageRate: '0',
      firstYearMonths: 12,
    }).value;
    const { value } = revaluedDepreciation({ initialBookValue: '1000', years: schedule.years }, [
      '1.1',
      '1.21',
      '1.331',
    ]);
    expect(value.map((y) => r9(y.depreciation))).toEqual([
      '366.666666667',
      '403.333333333',
      '443.666666667',
    ]);
    expect(value.map((y) => r9(y.bookValue))).toEqual([
      '733.333333333',
      '403.333333333',
      '0.000000000',
    ]);
    // Revalued book value + revalued depreciation charged − IBV
    expect(value.map((y) => r9(y.revaluationAdjustment))).toEqual([
      '100.000000000',
      '173.333333333',
      '213.666666667',
    ]);
  });

  it('needs one positive factor per year', () => {
    const years = [{ year: 0, depreciation: '10', bookValue: '0' }];
    expect(() => revaluedDepreciation({ initialBookValue: '10', years }, [])).toThrow(
      EngineInputError,
    );
    expect(() => revaluedDepreciation({ initialBookValue: '10', years }, ['0'])).toThrow(
      EngineInputError,
    );
  });
});
