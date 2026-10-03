import { describe, expect, it } from 'vitest';
import { EngineInputError } from '../errors';
import { planHorizon } from './horizon';
import { INVESTMENT_GROUPS, investmentSchedule, type InvestmentItem } from './investment';

// Two construction half-years in 2027, then five production years 2028–2032 (balance in December).
const yearly = planHorizon({
  start: { year: 2027, month: 1 },
  balanceMonth: 12,
  construction: { periods: 2, periodMonths: 6 },
  startup: { periods: 0, periodMonths: 12 },
  productionYears: 5,
});
const zeros = (n: number) => Array.from({ length: n }, () => '0');
const at = (n: number, values: Record<number, string>) => zeros(n).map((z, j) => values[j] ?? z);
const linear = (lifeMonths: number, startPeriod: number) => ({
  method: 'LINEAR_TO_ZERO' as const,
  lifeMonths,
  salvageRate: '0',
  startPeriod,
});
const clean = (values: string[]) => values.map((v) => (v === '-0' ? '0' : v));

describe('investmentSchedule', () => {
  const machinery: InvestmentItem = {
    key: 'machinery',
    group: 'MACHINERY',
    currency: 'USD',
    origin: 'FOREIGN',
    // 1000 USD in each construction half-year, 5000 more (local) is a separate item below.
    amounts: at(7, { 0: '1000', 1: '1000' }),
    depreciation: linear(60, 2),
  };
  const extension: InvestmentItem = {
    key: 'extension',
    group: 'MACHINERY',
    currency: 'IRR',
    origin: 'LOCAL',
    amounts: at(7, { 3: '5000' }),
    depreciation: linear(60, 2),
  };
  const land: InvestmentItem = {
    key: 'land',
    group: 'LAND',
    currency: 'IRR',
    origin: 'LOCAL',
    amounts: at(7, { 0: '3000' }),
  };
  const studies: InvestmentItem = {
    key: 'studies',
    group: 'PRE_PRODUCTION',
    currency: 'IRR',
    origin: 'LOCAL',
    amounts: at(7, { 1: '600' }),
    depreciation: linear(36, 2),
  };
  const input = {
    horizon: yearly,
    localCurrency: 'IRR',
    exchangeRates: { USD: ['10', '12', '12', '12', '12', '12', '12'] },
    items: [machinery, extension, land, studies],
  };

  it('converts each period at its own rate and groups the items', () => {
    const { value } = investmentSchedule(input);
    expect(value.items[0]?.amounts).toEqual(at(7, { 0: '10000', 1: '12000' }));
    expect(value.groups.MACHINERY).toEqual(at(7, { 0: '10000', 1: '12000', 3: '5000' }));
    expect(value.groups.LAND).toEqual(at(7, { 0: '3000' }));
    expect(value.groups.BUILDINGS).toEqual(zeros(7));
    expect(Object.keys(value.groups)).toEqual([...INVESTMENT_GROUPS]);
    expect(value.fixedInvestment).toEqual(at(7, { 0: '13000', 1: '12000', 3: '5000' }));
    expect(value.fixedInvestmentByOrigin).toEqual({
      foreign: at(7, { 0: '10000', 1: '12000' }),
      local: at(7, { 0: '3000', 3: '5000' }),
    });
    expect(value.preProduction).toEqual(at(7, { 1: '600' }));
    expect(value.preProductionByOrigin.foreign).toEqual(zeros(7));
    expect(value.totalInvestment).toEqual(at(7, { 0: '13000', 1: '12600', 3: '5000' }));
    // The foreign and local content always add up to the total.
    value.fixedInvestment.forEach((total, j) => {
      const foreign = Number(value.fixedInvestmentByOrigin.foreign[j]);
      expect(foreign + Number(value.fixedInvestmentByOrigin.local[j])).toBe(Number(total));
    });
  });

  it('depreciates construction acquisitions jointly from the start, later ones from the next year', () => {
    const { value } = investmentSchedule(input);
    // 22 000 over five years from 2028; the 5000 bought in 2029 from 2030 (three years charged).
    expect(value.items[0]?.depreciation).toEqual(
      at(7, { 2: '4400', 3: '4400', 4: '4400', 5: '4400', 6: '4400' }),
    );
    expect(value.items[0]?.bookValue).toEqual([
      '10000',
      '22000',
      '17600',
      '13200',
      '8800',
      '4400',
      '0',
    ]);
    expect(value.items[1]?.depreciation).toEqual(at(7, { 4: '1000', 5: '1000', 6: '1000' }));
    expect(value.items[1]?.bookValue).toEqual(['0', '0', '0', '5000', '4000', '3000', '2000']);
    // Land is not depreciated: its book value is what was bought.
    expect(value.items[2]?.depreciation).toEqual(zeros(7));
    expect(value.items[2]?.bookValue).toEqual(Array.from({ length: 7 }, () => '3000'));
    expect(value.depreciation.preProduction).toEqual(at(7, { 2: '200', 3: '200', 4: '200' }));
    expect(value.depreciation.fixed).toEqual(
      at(7, { 2: '4400', 3: '4400', 4: '5400', 5: '5400', 6: '5400' }),
    );
    expect(value.depreciation.total).toEqual(
      at(7, { 2: '4600', 3: '4600', 4: '5600', 5: '5400', 6: '5400' }),
    );
    expect(value.bookValue.total[6]).toBe('5000');
  });

  it('charges a shortened first production year by its months', () => {
    // Construction in three quarters from Farvardin 1405; production from Dey, balance in Esfand.
    const horizon = planHorizon({
      start: { year: 1405, month: 1 },
      balanceMonth: 12,
      construction: { periods: 3, periodMonths: 3 },
      startup: { periods: 0, periodMonths: 12 },
      productionYears: 3,
    });
    const { value } = investmentSchedule({
      horizon,
      localCurrency: 'IRR',
      exchangeRates: {},
      items: [
        {
          key: 'building',
          group: 'BUILDINGS',
          currency: 'IRR',
          origin: 'LOCAL',
          amounts: at(6, { 1: '1200' }),
          depreciation: linear(24, 3),
        },
      ],
    });
    // 600 a year: 3/12 of it in the three-month first year, the rest in the last.
    expect(value.items[0]?.depreciation).toEqual(at(6, { 3: '150', 4: '600', 5: '450' }));
    expect(value.items[0]?.bookValue).toEqual(['0', '1200', '1200', '1050', '450', '0']);
  });

  it('starts in a start-up period and charges at the balance date', () => {
    // Construction 2027, start-up in quarters of 2028, then 2029 and 2030.
    const horizon = planHorizon({
      start: { year: 2027, month: 1 },
      balanceMonth: 12,
      construction: { periods: 1, periodMonths: 12 },
      startup: { periods: 4, periodMonths: 3 },
      productionYears: 3,
    });
    expect(horizon.periods.map((p) => p.phase)).toEqual([
      'CONSTRUCTION',
      'STARTUP',
      'STARTUP',
      'STARTUP',
      'STARTUP',
      'PRODUCTION',
      'PRODUCTION',
    ]);
    const { value } = investmentSchedule({
      horizon,
      localCurrency: 'IRR',
      exchangeRates: {},
      items: [
        {
          key: 'plant',
          group: 'MACHINERY',
          currency: 'IRR',
          origin: 'LOCAL',
          // Bought in construction and in the first quarter: joint from the second quarter (nine
          // months to the balance date); the third-quarter purchase starts in 2029.
          amounts: at(7, { 0: '1000', 1: '200', 3: '400' }),
          depreciation: linear(60, 2),
        },
      ],
    });
    expect(value.items[0]?.depreciation).toEqual(at(7, { 4: '180', 5: '320', 6: '320' }));
  });

  it('applies salvage and the declining balance per batch', () => {
    const { value } = investmentSchedule({
      ...input,
      items: [
        {
          ...extension,
          amounts: at(7, { 1: '1000' }),
          depreciation: {
            method: 'LINEAR_TO_SCRAP',
            lifeMonths: 48,
            salvageRate: '0.2',
            startPeriod: 2,
          },
        },
      ],
    });
    expect(value.items[0]?.depreciation).toEqual(at(7, { 2: '200', 3: '200', 4: '200', 5: '200' }));
    expect(value.items[0]?.bookValue[6]).toBe('200');
  });

  it('refuses inputs it cannot place, with the field', () => {
    const fails = (items: InvestmentItem[], code: string, field: string, rates = {}) => {
      let caught: unknown;
      try {
        investmentSchedule({ ...input, exchangeRates: rates, items });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(EngineInputError);
      expect(caught).toMatchObject({ code, field });
    };
    fails([machinery], 'model.exchangeRateMissing', 'items[0].currency');
    fails([machinery], 'series.lengthMismatch', 'exchangeRates.USD', { USD: ['10'] });
    fails([{ ...land, amounts: ['1'] }], 'series.lengthMismatch', 'items[0].amounts');
    fails([{ ...land, amounts: at(7, { 2: '-5' }) }], 'amount.negative', 'items[0].amounts[2]');
    fails([land, land], 'model.duplicateKey', 'items[1].key');
    fails(
      [{ ...land, origin: 'IMPORTED' as InvestmentItem['origin'] }],
      'model.origin',
      'items[0].origin',
    );
    fails(
      [{ ...land, group: 'GOODWILL' as InvestmentItem['group'] }],
      'investment.group',
      'items[0].group',
    );
    fails(
      [{ ...land, depreciation: linear(60, 1) }],
      'investment.depreciationStart',
      'items[0].depreciation.startPeriod',
    );
    fails(
      [{ ...land, depreciation: linear(60, 7) }],
      'investment.depreciationStart',
      'items[0].depreciation.startPeriod',
    );
    fails(
      [{ ...land, depreciation: linear(0, 2) }],
      'period.lengthNotPositiveInteger',
      'items[0].depreciation.lifeMonths',
    );
    // Also without anything to depreciate yet.
    fails(
      [{ ...land, amounts: zeros(7), depreciation: { ...linear(60, 2), salvageRate: '1' } }],
      'rate.notInUnitInterval',
      'items[0].depreciation.salvageRate',
    );
  });

  it('keeps an item with nothing to depreciate at zero', () => {
    const { value } = investmentSchedule({
      ...input,
      items: [{ ...land, amounts: zeros(7), depreciation: linear(60, 2) }],
    });
    expect(clean(value.depreciation.total)).toEqual(zeros(7));
    expect(clean(value.bookValue.total)).toEqual(zeros(7));
  });
});

describe('investmentSchedule at current prices', () => {
  const item: InvestmentItem = {
    key: 'machinery',
    group: 'MACHINERY',
    currency: 'IRR',
    origin: 'LOCAL',
    amounts: at(7, { 0: '1000', 1: '1000', 3: '5000' }),
    escalation: '0',
    firstYearEscalator: 0,
  };
  // Six project years: the construction half-years of 2027, then 2028–2032.
  const inflation = { IRR: ['0.1', '0.1', '0.1', '0.1', '0.1', '0.1'] };
  const input = { horizon: yearly, localCurrency: 'IRR', exchangeRates: {}, inflation };

  it('inflates acquisitions entered at the prices of the start of the horizon', () => {
    const { value } = investmentSchedule({ ...input, items: [item] });
    // 1.1 in the first year and 1.1³ in the third.
    expect(value.fixedInvestment).toEqual(at(7, { 0: '1100', 1: '1100', 3: '6655' }));
  });

  it('adds the escalation of the item to the inflation of its currency', () => {
    const { value } = investmentSchedule({
      ...input,
      items: [{ ...item, escalation: '0.05', firstYearEscalator: 1 }],
    });
    // 1 + 0.1 + 0.05 in the first year, × 1.15² by the third.
    expect(value.fixedInvestment).toEqual(at(7, { 0: '1150', 1: '1150', 3: '7604.375' }));
  });

  it('requires the escalation and the inflation of the currency when inflation is on', () => {
    const { escalation: _, ...bare } = item;
    expect(() => investmentSchedule({ ...input, items: [bare] })).toThrowError(
      new EngineInputError('operations.escalationRequired', 'items[0].escalation'),
    );
    expect(() =>
      investmentSchedule({ ...input, inflation: { USD: inflation.IRR }, items: [item] }),
    ).toThrowError(
      new EngineInputError('operations.inflationMissing', 'items[0].currency', {
        currency: 'IRR',
      }),
    );
  });
});
