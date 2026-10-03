import { describe, expect, it } from 'vitest';
import { EngineInputError } from '../errors';
import {
  EQUITY_CLASSES,
  financingSchedule,
  type FinancingInput,
  type FinancingLoan,
} from './financing';
import { planHorizon } from './horizon';

// Construction in two half-years of 2027 (days 180 and 360), production 2028–2032 (720 … 2160).
const horizon = planHorizon({
  start: { year: 2027, month: 1 },
  balanceMonth: 12,
  construction: { periods: 2, periodMonths: 6 },
  startup: { periods: 0, periodMonths: 12 },
  productionYears: 5,
});
const zeros = (n: number) => Array.from({ length: n }, () => '0');
const at = (values: Record<number, string>) => zeros(7).map((z, j) => values[j] ?? z);
const column = (rows: Record<string, string>[], key: string) => rows.map((r) => r[key]);

const localLoan: FinancingLoan = {
  key: 'bank',
  currency: 'IRR',
  origin: 'LOCAL',
  loan: {
    type: 'CONSTANT_PRINCIPAL',
    repaymentMonths: 12,
    flows: [
      { day: 180, amount: '1000' },
      { day: 360, amount: '1000' },
    ],
    rates: [{ fromDay: 1, rate: '0.1' }],
    capitalisedShare: '0',
    numberOfRepayments: 4,
    firstRepaymentDay: 720,
  },
  depreciation: { method: 'LINEAR_TO_ZERO', lifeMonths: 12, startPeriod: 2 },
};

const foreignLoan: FinancingLoan = {
  key: 'supplier',
  currency: 'USD',
  origin: 'FOREIGN',
  loan: {
    type: 'CONSTANT_PRINCIPAL',
    repaymentMonths: 12,
    flows: [{ day: 360, amount: '100' }],
    rates: [{ fromDay: 1, rate: '0.1' }],
    capitalisedShare: '1',
    capitaliseUntilDay: 720,
    numberOfRepayments: 2,
    firstRepaymentDay: 1080,
  },
};

const input: FinancingInput = {
  horizon,
  localCurrency: 'IRR',
  exchangeRates: { USD: ['10', '10', '12', '12', '12', '12', '12'] },
  equity: [
    {
      key: 'founders',
      class: 'ORDINARY',
      currency: 'IRR',
      origin: 'LOCAL',
      amounts: at({ 0: '500' }),
    },
    {
      key: 'partner',
      class: 'JOINT_VENTURE',
      currency: 'USD',
      origin: 'FOREIGN',
      amounts: at({ 1: '50' }),
    },
  ],
  loans: [localLoan, foreignLoan],
};

describe('financingSchedule', () => {
  it('sums equity by class and origin in local currency', () => {
    const { value } = financingSchedule(input);
    expect(Object.keys(value.equity.classes)).toEqual([...EQUITY_CLASSES]);
    expect(value.equity.classes.ORDINARY).toEqual(at({ 0: '500' }));
    expect(value.equity.classes.JOINT_VENTURE).toEqual(at({ 1: '500' }));
    expect(value.equity.classes.SUBSIDY).toEqual(zeros(7));
    expect(value.equity.byOrigin).toEqual({ foreign: at({ 1: '500' }), local: at({ 0: '500' }) });
    expect(value.equity.total).toEqual(at({ 0: '500', 1: '500' }));
  });

  it('puts a local loan into project periods; construction interest is pre-production', () => {
    const { value } = financingSchedule(input);
    const bank = value.loans[0]!;
    const periods = bank.periods as unknown as Record<string, string>[];
    expect(column(periods, 'disbursement')).toEqual(at({ 0: '1000', 1: '1000' }));
    // 1000 × 10 % for half a year, due at the end of 2027; then 2000, 1500, 1000, 500 a year.
    expect(column(periods, 'interest')).toEqual(
      at({ 1: '50', 2: '200', 3: '150', 4: '100', 5: '50' }),
    );
    expect(column(periods, 'repayment')).toEqual(at({ 2: '500', 3: '500', 4: '500', 5: '500' }));
    expect(column(periods, 'endingBalance')).toEqual([
      '1000',
      '2000',
      '1500',
      '1000',
      '500',
      '0',
      '0',
    ]);
    expect(column(periods, 'exchangeAdjustment')).toEqual(zeros(7));
    expect(bank.preProductionInterest).toEqual(at({ 1: '50' }));
    expect(bank.depreciation).toEqual(at({ 2: '50' }));
    expect(bank.bookValue).toEqual(at({ 1: '50' }));
  });

  it('restates a foreign loan; capitalised interest is pre-production in any phase', () => {
    const { value } = financingSchedule(input);
    const supplier = value.loans[1]!;
    const periods = supplier.periods as unknown as Record<string, string>[];
    expect(column(periods, 'disbursement')).toEqual(at({ 1: '1000' }));
    // 10 USD capitalised at the end of 2028 at 12; the balance of 110 USD is restated at 12.
    expect(column(periods, 'capitalisedInterest')).toEqual(at({ 2: '120' }));
    expect(column(periods, 'exchangeAdjustment')).toEqual(at({ 2: '200' }));
    expect(column(periods, 'repayment')).toEqual(at({ 3: '660', 4: '660' }));
    expect(column(periods, 'interest')).toEqual(at({ 3: '132', 4: '66' }));
    expect(supplier.preProductionInterest).toEqual(at({ 2: '120' }));
    // No depreciation conditions: the capitalised interest stays on the books.
    expect(supplier.depreciation).toEqual(zeros(7));
    expect(supplier.bookValue).toEqual(at({ 2: '120', 3: '120', 4: '120', 5: '120', 6: '120' }));
  });

  it('totals loans and sources period by period', () => {
    const { value } = financingSchedule(input);
    const totals = value.loanTotals as unknown as Record<string, string>[];
    expect(column(totals, 'disbursement')).toEqual(at({ 0: '1000', 1: '2000' }));
    expect(column(totals, 'endingBalance')).toEqual([
      '1000',
      '3000',
      '2820',
      '1660',
      '500',
      '0',
      '0',
    ]);
    expect(value.preProductionInterest).toEqual(at({ 1: '50', 2: '120' }));
    expect(value.interestDepreciation).toEqual(at({ 2: '50' }));
    expect(value.totalSources).toEqual(at({ 0: '1500', 1: '2500' }));
  });

  it('reports the default first repayment date per loan', () => {
    const { loan } = localLoan;
    const withoutDate = { ...loan };
    delete withoutDate.firstRepaymentDay;
    const result = financingSchedule({
      ...input,
      loans: [{ ...localLoan, loan: withoutDate }],
    });
    // One repayment period after the later of the last disbursement and the end of construction.
    expect(result.defaultsUsed).toEqual([
      { key: 'loan.firstRepaymentDate', value: '720', item: 'bank' },
    ]);
    expect(result.value.loans[0]?.firstRepaymentDay).toBe(720);
  });

  it('passes loan warnings on with the loan key', () => {
    const result = financingSchedule({
      ...input,
      loans: [
        {
          ...localLoan,
          loan: { ...localLoan.loan, numberOfRepayments: 10 },
        },
      ],
    });
    expect(result.warnings.map((w) => w.params?.item)).toContain('bank');
    // Reported once, although both the schedule and the period sums notice it.
    expect(result.warnings.filter((w) => w.code === 'loan.beyondHorizon')).toHaveLength(1);
  });

  it('restates a foreign annuity over many periods to exactly zero', () => {
    // Half-yearly instalments: the per-period sums are rounded, the balance comes from the schedule.
    const annuity: FinancingLoan = {
      key: 'export-credit',
      currency: 'USD',
      origin: 'FOREIGN',
      loan: {
        type: 'ANNUITY',
        repaymentMonths: 6,
        flows: [
          { day: 150, amount: '1000' },
          { day: 330, amount: '1000' },
        ],
        rates: [{ fromDay: 1, rate: '0.07' }],
        capitalisedShare: '0',
        numberOfRepayments: 7,
        firstRepaymentDay: 540,
      },
    };
    const local = { ...annuity, key: 'same-in-rials', currency: 'IRR', origin: 'LOCAL' as const };
    const { value } = financingSchedule({
      ...input,
      exchangeRates: { USD: Array.from({ length: 7 }, () => '1') },
      loans: [annuity, local],
    });
    const [usd, irr] = value.loans;
    expect(usd?.periods.at(-1)?.endingBalance).toBe('0');
    expect(usd?.periods.map((p) => p.repayment)).toEqual(irr?.periods.map((p) => p.repayment));
    expect(usd?.periods.map((p) => p.endingBalance)).toEqual(
      irr?.periods.map((p) => p.endingBalance),
    );
  });

  it('works without a construction phase', () => {
    const noConstruction = planHorizon({
      start: { year: 1406, month: 1 },
      balanceMonth: 12,
      construction: { periods: 0, periodMonths: 12 },
      startup: { periods: 0, periodMonths: 12 },
      productionYears: 5,
    });
    const { loan } = localLoan;
    const withoutDate = { ...loan, flows: [{ day: 90, amount: '1000' }] };
    delete withoutDate.firstRepaymentDay;
    const result = financingSchedule({
      horizon: noConstruction,
      localCurrency: 'IRR',
      exchangeRates: {},
      equity: [],
      loans: [{ ...localLoan, loan: withoutDate, depreciation: undefined }],
    });
    // One repayment period after the last disbursement.
    expect(result.value.loans[0]?.firstRepaymentDay).toBe(450);
    expect(result.value.preProductionInterest).toEqual(zeros(5));
    expect(result.value.totalSources).toEqual(['1000', '0', '0', '0', '0']);
  });

  it('starts the depreciation of capitalised interest after the last capitalisation', () => {
    // Interest is capitalised up to day 720, the end of period 2.
    const depreciating = (startPeriod: number) => () =>
      financingSchedule({
        ...input,
        loans: [
          {
            ...foreignLoan,
            depreciation: { method: 'LINEAR_TO_ZERO', lifeMonths: 24, startPeriod },
          },
        ],
      });
    expect(depreciating(2)).toThrowError(
      expect.objectContaining({
        code: 'financing.interestDepreciationStart',
        field: 'loans[0].depreciation.startPeriod',
      }),
    );
    expect(depreciating(3)().value.interestDepreciation).toEqual(at({ 3: '60', 4: '60' }));
  });

  it('refuses inputs it cannot place, with the field', () => {
    const fails = (changes: Partial<FinancingInput>, code: string, field: string) => {
      let caught: unknown;
      try {
        financingSchedule({ ...input, ...changes });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(EngineInputError);
      expect(caught).toMatchObject({ code, field });
    };
    fails({ exchangeRates: {} }, 'model.exchangeRateMissing', 'equity[1].currency');
    fails({ loans: [localLoan, localLoan] }, 'model.duplicateKey', 'loans[1].key');
    fails(
      { loans: [{ ...localLoan, origin: 'OTHER' as 'LOCAL' }] },
      'model.origin',
      'loans[0].origin',
    );
    fails(
      { equity: [{ ...input.equity[0]!, class: 'BONDS' as 'ORDINARY' }] },
      'financing.equityClass',
      'equity[0].class',
    );
    fails(
      { loans: [{ ...localLoan, loan: { ...localLoan.loan, rates: [] } }] },
      'loan.rateMissing',
      'loans[0].loan.rates',
    );
    fails(
      {
        loans: [
          {
            ...localLoan,
            depreciation: { method: 'LINEAR_TO_ZERO', lifeMonths: 12, startPeriod: 0 },
          },
        ],
      },
      'investment.depreciationStart',
      'loans[0].depreciation.startPeriod',
    );
  });
});
