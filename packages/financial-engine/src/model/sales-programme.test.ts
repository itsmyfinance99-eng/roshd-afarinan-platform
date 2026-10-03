import { describe, expect, it } from 'vitest';
import { toDecimal, toDecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import { productionProgramme } from './sales-programme';
import { coverageDays, workingCapitalValues } from './working-capital';

const decimals = (values: string[]) => values.map((v) => toDecimal(v));
const strings = (values: ReturnType<typeof toDecimal>[]) => values.map((v) => toDecimalString(v));

function programme(sales: string[], days: string, firstPeriod = 0, lastPeriod = sales.length - 1) {
  const result = productionProgramme(
    {
      sales: decimals(sales),
      months: sales.map(() => 12),
      coverageDays: toDecimal(days),
      firstPeriod,
      lastPeriod,
    },
    (j) => `sales[${j}]`,
  );
  return {
    broughtForward: strings(result.broughtForward),
    produced: strings(result.produced),
    carried: strings(result.carried),
  };
}

describe('productionProgramme (XI.L)', () => {
  it('produces the sales plus the change in the required stock', () => {
    // 36 days in a year: c = 10, so the stock is a tenth of the period's sales.
    expect(programme(['600', '900', '1000', '1000'], '36')).toEqual({
      broughtForward: ['0', '60', '90', '100'],
      produced: ['660', '930', '1010', '1000'],
      carried: ['60', '90', '100', '100'],
    });
  });

  it('keeps a stock above the requirement and produces nothing more than needed', () => {
    // 180 days: c = 2. Year 2 sells 10 out of a stock of 50; 40 are left, above the required 5.
    expect(programme(['100', '10'], '180')).toEqual({
      broughtForward: ['0', '50'],
      produced: ['150', '0'],
      carried: ['50', '40'],
    });
  });

  it('uses the period length in the coefficient of turnover', () => {
    const result = productionProgramme(
      {
        sales: decimals(['300', '600']),
        months: [6, 12],
        coverageDays: toDecimal('36'),
        firstPeriod: 0,
        lastPeriod: 1,
      },
      (j) => `sales[${j}]`,
    );
    // Half-year: c = 30 × 6 / 36 = 5; year: c = 10.
    expect(strings(result.carried)).toEqual(['60', '60']);
    expect(strings(result.produced)).toEqual(['360', '600']);
  });

  it('runs the stock down when sales end before production ends', () => {
    // 180 days. The stock never exceeds the sales still to come, so nothing is left over.
    expect(programme(['100', '100', '0'], '180')).toEqual({
      broughtForward: ['0', '50', '0'],
      produced: ['150', '50', '0'],
      carried: ['50', '0', '0'],
    });
    // 360 days (c = 1): year 2 sells less than the stock, so nothing is produced.
    expect(programme(['100', '20', '30', '0'], '360')).toEqual({
      broughtForward: ['0', '50', '30', '0'],
      produced: ['150', '0', '0', '0'],
      carried: ['50', '30', '0', '0'],
    });
  });

  it('sells from stock only outside the production interval', () => {
    // Produced in period 1 only; 72 days: c = 5.
    expect(programme(['0', '100', '20'], '72', 1, 1)).toEqual({
      broughtForward: ['0', '0', '20'],
      produced: ['0', '120', '0'],
      carried: ['0', '20', '0'],
    });
    expect(() => programme(['0', '100', '30'], '72', 1, 1)).toThrowError(
      new EngineInputError('production.salesOutsideInterval', 'sales[2]'),
    );
  });

  it('keeps no stock with zero days of coverage', () => {
    expect(programme(['10', '20'], '0').produced).toEqual(['10', '20']);
  });
});

describe('working capital by value (XI.K)', () => {
  const periods = [
    { months: 12, production: false },
    { months: 12, production: true },
    { months: 12, production: true },
  ];

  it('consumes the initial stock first, then keeps the required value', () => {
    const values = workingCapitalValues({
      bases: decimals(['0', '300', '300']),
      periods,
      days: toDecimal('36'),
      purchases: decimals(['500', '0', '0']),
      stock: true,
    });
    // 500 bought; year 1 consumes 300 and 200 is left (above the required 30); then 30.
    expect(strings(values)).toEqual(['500', '200', '30']);
  });

  it('scales the requirement with the length of the period', () => {
    const values = workingCapitalValues({
      bases: decimals(['0', '900', '2400']),
      periods: [periods[0]!, { months: 6, production: true }, periods[2]!],
      days: toDecimal('18'),
      stock: false,
    });
    expect(strings(values)).toEqual(['0', '90', '120']);
  });

  it('carries a value over for stocks only', () => {
    // The basis falls to zero: a stock stays, receivables and the like unwind.
    const input = { bases: decimals(['0', '360', '0']), periods, days: toDecimal('720') };
    expect(strings(workingCapitalValues({ ...input, stock: true }))).toEqual(['0', '720', '720']);
    expect(strings(workingCapitalValues({ ...input, stock: false }))).toEqual(['0', '720', '0']);
  });

  it('reads coverage as days or as a share of the year', () => {
    expect(toDecimalString(coverageDays({ days: '18' }, 'c'))).toBe('18');
    expect(toDecimalString(coverageDays({ shareOfYear: '0.05' }, 'c'))).toBe('18');
    expect(() => coverageDays(undefined, 'c')).toThrowError(
      new EngineInputError('operations.coverageRequired', 'c'),
    );
    expect(() => coverageDays({ days: '1', shareOfYear: '0.1' }, 'c')).toThrowError(
      new EngineInputError('operations.coverage', 'c'),
    );
    expect(() => coverageDays({ days: '-1' }, 'c')).toThrowError(
      new EngineInputError('amount.negative', 'c.days'),
    );
  });
});
