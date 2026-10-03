import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
import { EngineInputError } from '../errors';
import { distributeProfit, type DividendShareholder } from './dividends';
import { graduatedTax, incomeTax, type TaxConditions } from './tax';

const d = (value: string) => toDecimal(value);
const flat = (rate: string): TaxConditions => ({
  brackets: [{ lowerLimit: '0', rate }],
  holidayYears: 0,
  lossCarryForwardYears: 0,
});
const fails = (
  conditions: TaxConditions,
  code: string,
  field: string,
  params: Record<string, string> = {},
) =>
  expect(() => incomeTax(['100', '100'], conditions)).toThrowError(
    new EngineInputError(code as EngineInputError['code'], field, params),
  );

describe('graduatedTax', () => {
  // Manual table 22: brackets from 0, 1 200, 2 000, 5 000 and 10 000 at 15, 25, 40, 60 and 75 %.
  const limits = ['0', '1200', '2000', '5000', '10000'].map(d);
  const rates = ['0.15', '0.25', '0.4', '0.6', '0.75'].map(d);

  it('taxes every slice at the rate of its bracket (manual table 22)', () => {
    // 1 200 × 15 % + 800 × 25 % + 3 000 × 40 % + 2 500 × 60 % = 180 + 200 + 1 200 + 1 500.
    expect(graduatedTax(d('7500'), limits, rates).toFixed()).toBe('3080');
  });

  it('handles a profit on a limit, in the top bracket and of zero', () => {
    expect(graduatedTax(d('1200'), limits, rates).toFixed()).toBe('180');
    // 180 + 200 + 1 200 + 3 000 + 2 000 × 75 %.
    expect(graduatedTax(d('12000'), limits, rates).toFixed()).toBe('6080');
    expect(graduatedTax(d('0'), limits, rates).toFixed()).toBe('0');
  });
});

describe('incomeTax', () => {
  it('carries losses forward for three years, oldest first (manual table 23)', () => {
    const { value } = incomeTax(['-200', '-80', '20', '130', '200', '300'], {
      ...flat('0.25'),
      lossCarryForwardYears: 3,
    });
    expect(value.map((y) => y.deductibleLoss)).toEqual(['0', '0', '20', '130', '80', '0']);
    // The 50 left of the first loss expire after year 4; year 5 uses the second loss only.
    expect(value.map((y) => y.taxableProfit)).toEqual(['-200', '-80', '0', '0', '120', '300']);
    expect(value.map((y) => y.tax)).toEqual(['0', '0', '0', '0', '30', '75']);
  });

  it('does not carry losses forward when the user enters 0 years', () => {
    const { value } = incomeTax(['-200', '100'], flat('0.25'));
    expect(value.map((y) => y.deductibleLoss)).toEqual(['0', '0']);
    expect(value[1]?.tax).toBe('25');
  });

  it('charges no tax in the holiday years; losses are still used up there', () => {
    const { value } = incomeTax(['-100', '60', '100'], {
      ...flat('0.2'),
      holidayYears: 2,
      lossCarryForwardYears: 5,
    });
    expect(value.map((y) => y.holiday)).toEqual([true, true, false]);
    expect(value.map((y) => y.deductibleLoss)).toEqual(['0', '60', '40']);
    expect(value.map((y) => y.tax)).toEqual(['0', '0', '12']);
  });

  it('applies a rate path per year and bracket', () => {
    const { value, warnings, defaultsUsed } = incomeTax(['1000', '1000'], {
      brackets: [
        { lowerLimit: '0', rate: ['0.1', '0.2'] },
        { lowerLimit: '400', rate: '0.5' },
      ],
      holidayYears: 0,
      lossCarryForwardYears: 0,
    });
    // 400 × 10 % + 600 × 50 %, then 400 × 20 % + 600 × 50 %.
    expect(value.map((y) => y.tax)).toEqual(['340', '380']);
    expect(warnings).toEqual([]);
    expect(defaultsUsed).toEqual([]);
  });

  it('refuses invalid conditions with the field', () => {
    fails({ ...flat('0.1'), brackets: [] }, 'tax.bracketsRequired', 'brackets');
    fails(
      { ...flat('0.1'), brackets: [{ lowerLimit: '10', rate: '0.1' }] },
      'tax.bracketLimits',
      'brackets[0].lowerLimit',
    );
    fails(
      {
        ...flat('0.1'),
        brackets: [
          { lowerLimit: '0', rate: '0.1' },
          { lowerLimit: '0', rate: '0.2' },
        ],
      },
      'tax.bracketLimits',
      'brackets[1].lowerLimit',
    );
    fails(flat('1'), 'rate.notInUnitInterval', 'brackets[0].rate');
    fails(
      { ...flat('0.1'), brackets: [{ lowerLimit: '0', rate: ['0.1', '-0.1'] }] },
      'rate.notInUnitInterval',
      'brackets[0].rate[1]',
    );
    fails(
      { ...flat('0.1'), brackets: [{ lowerLimit: '0', rate: ['0.1'] }] },
      'series.lengthMismatch',
      'brackets[0].rate',
      { expected: '2', actual: '1' },
    );
    fails({ ...flat('0.1'), holidayYears: -1 }, 'horizon.outOfRange', 'holidayYears', {
      min: '0',
      max: '50',
    });
    fails(
      { ...flat('0.1'), lossCarryForwardYears: 1.5 },
      'horizon.outOfRange',
      'lossCarryForwardYears',
      { min: '0', max: '50' },
    );
  });
});

describe('distributeProfit', () => {
  const holder = (over: Partial<Record<keyof DividendShareholder, string | boolean>>) =>
    ({
      jointVenture: over.jointVenture === true,
      accumulatedEquity: d(String(over.accumulatedEquity ?? '0')),
      preferredRate: d(String(over.preferredRate ?? '0')),
      preferredAmount: d(String(over.preferredAmount ?? '0')),
      ordinaryShare: d(String(over.ordinaryShare ?? '0')),
    }) satisfies DividendShareholder;
  // A partner entitled to 100 (1 000 × 10 %) and two shareholders entitled to 60 and 140.
  const partner = holder({
    jointVenture: true,
    accumulatedEquity: '1000',
    preferredRate: '0.1',
    ordinaryShare: '0.5',
  });
  const first = holder({ accumulatedEquity: '500', preferredRate: '0.1', preferredAmount: '10' });
  const second = holder({ preferredAmount: '140', ordinaryShare: '0.5' });
  const run = (netProfit: string, retained: string) => {
    const result = distributeProfit(d(netProfit), d(retained), [partner, first, second]);
    return {
      payable: result.payable.toFixed(),
      preferred: result.shareholders.map((s) => s.preferred.toFixed()),
      ordinary: result.shareholders.map((s) => s.ordinary.toFixed()),
      dividends: result.dividends.toFixed(),
    };
  };

  it('pays preferred dividends in full and shares the rest (case 1)', () => {
    // 1 000 × (1 − 60 %) = 400 payable; 300 preferred; 100 ordinary, half each.
    expect(run('1000', '0.6')).toEqual({
      payable: '400',
      preferred: ['100', '60', '140'],
      ordinary: ['50', '0', '50'],
      dividends: '400',
    });
  });

  it('reduces the other shareholders when the profit is short (case 2)', () => {
    // 200 payable: the partner gets 100, the others share 100 of their 200 (factor 0.5).
    expect(run('200', '0')).toEqual({
      payable: '200',
      preferred: ['100', '30', '70'],
      ordinary: ['0', '0', '0'],
      dividends: '200',
    });
  });

  it('reduces the partners and pays the others nothing (case 3)', () => {
    expect(run('80', '0')).toEqual({
      payable: '80',
      preferred: ['80', '0', '0'],
      ordinary: ['0', '0', '0'],
      dividends: '80',
    });
  });

  it('pays nothing on a loss or when everything is retained', () => {
    expect(run('-500', '0').dividends).toBe('0');
    expect(run('0', '0').dividends).toBe('0');
    expect(run('1000', '1')).toEqual({
      payable: '0',
      preferred: ['0', '0', '0'],
      ordinary: ['0', '0', '0'],
      dividends: '0',
    });
  });

  it('never pays more than is payable', () => {
    const result = distributeProfit(new Decimal(299), new Decimal(0), [partner, first, second]);
    expect(result.dividends.toFixed()).toBe('299');
  });
});
