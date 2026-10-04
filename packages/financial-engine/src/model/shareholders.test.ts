import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
import { EngineInputError } from '../errors';
import { projectModel, type ProjectInput } from './project';

/**
 * A joint venture of two partners (VII.L, VII.R, XI.F): one construction year and two years of
 * production, no loan, no working capital, no tax.
 *
 * Machinery 1 000, written off in the two production years. Partner A pays 600 and B 400. Sales
 * of 100 units at 10 against 4 of ore a unit: a profit of 100 a year, all of it paid out, 60 % to
 * A and 40 % to B. In the last year A gets 200 of its equity back. The net worth left at the end
 * (the cash of 800) is shared half and half by agreement.
 */
const at = (values: Record<number, string>) => ['0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
const holder = (equity: string, ordinaryShare: string, netWorthShare?: string) => ({
  equity,
  preferredRate: '0',
  preferredAmount: '0',
  ordinaryShare,
  repatriatedShare: '0',
  ...(netWorthShare === undefined ? {} : { netWorthShare }),
});
const venture: ProjectInput = {
  horizon: {
    start: { year: 2027, month: 1 },
    balanceMonth: 12,
    construction: { periods: 1, periodMonths: 12 },
    startup: { periods: 0, periodMonths: 12 },
    productionYears: 2,
  },
  localCurrency: 'IRR',
  exchangeRates: {},
  investment: {
    items: [
      {
        key: 'machinery',
        group: 'MACHINERY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '1000' }),
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 24,
          salvageRate: '0',
          startPeriod: 1,
        },
      },
    ],
  },
  financing: {
    equity: [
      {
        key: 'A',
        class: 'JOINT_VENTURE',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '600' }),
        refunds: at({ 2: '200' }),
      },
      {
        key: 'B',
        class: 'JOINT_VENTURE',
        currency: 'IRR',
        origin: 'FOREIGN',
        amounts: at({ 0: '400' }),
      },
    ],
    loans: [],
  },
  operations: {
    products: [
      {
        key: 'steel',
        sales: [
          {
            key: 'home',
            market: 'LOCAL',
            currency: 'IRR',
            quantities: at({ 1: '100', 2: '100' }),
            price: '10',
            salesTaxRate: '0',
            subsidyRate: '0',
            subsidyAmount: '0',
            receivablesCoverage: none,
          },
        ],
        finishedGoodsCoverage: none,
        workInProgressCoverage: none,
      },
    ],
    costs: [
      {
        key: 'ore',
        category: 'RAW_MATERIALS',
        product: 'steel',
        currency: 'IRR',
        origin: 'LOCAL',
        standard: { mode: 'PER_UNIT', quantity: '1', price: '4', fixedCost: '0' },
        stockCoverage: none,
        payablesCoverage: none,
      },
    ],
    cash: { localCoverage: none, foreignCoverage: none, depositShare: '0', depositRate: '0' },
  },
  statements: {
    tax: { brackets: [{ lowerLimit: '0', rate: '0' }], holidayYears: 0, lossCarryForwardYears: 0 },
    profitDistribution: {
      retainedShare: '0',
      shareholders: [holder('A', '0.6', '0.5'), holder('B', '0.4', '0.5')],
    },
    discounting: { totalCapitalRate: '0.1', equityRate: '0.1' },
    referenceYear: 0,
  },
};

const withHolders = (shareholders: ReturnType<typeof holder>[]): ProjectInput => ({
  ...venture,
  statements: {
    ...venture.statements,
    profitDistribution: { retainedShare: '0', shareholders },
  },
});
const fails = (run: () => unknown, code: string, field: string) =>
  expect(run).toThrowError(new EngineInputError(code as EngineInputError['code'], field));
const close = (actual: string | undefined, expected: Decimal) =>
  expect(
    toDecimal(actual ?? 'NaN')
      .minus(expected)
      .abs()
      .lt('1e-20'),
    `${actual} ≈ ${expected.toString()}`,
  ).toBe(true);
const numbers = (values: string[]) => values.map((v) => toDecimal(v).toNumber());
/** Present value at 10 % with the reference at the end of the first year. */
const present = (amounts: number[]) =>
  amounts.reduce(
    (sum, a, j) => sum.plus(new Decimal(a).div(new Decimal('1.1').pow(j))),
    new Decimal(0),
  );

describe('joint-venture partners', () => {
  const { value: model, warnings } = projectModel(venture);
  const { statements, financing } = model;

  it('refunds equity as a cash outflow and takes it off the equity held', () => {
    expect(numbers(financing.equity.refunds.total)).toEqual([0, 0, 200]);
    expect(numbers(financing.equity.refunds.classes.JOINT_VENTURE)).toEqual([0, 0, 200]);
    expect(financing.equity.items[0]?.refunds).toEqual(['0', '0', '200']);
    expect(financing.equity.items[1]?.refunds).toBeUndefined();
    const { cashFlow, balanceSheet } = statements;
    expect(numbers(cashFlow.outflows.equityRefunds)).toEqual([0, 0, 200]);
    // 600 of margin less 100 of dividends, and less the refund in the last year.
    expect(numbers(cashFlow.surplus)).toEqual([0, 500, 300]);
    expect(numbers(balanceSheet.liabilities.equity.JOINT_VENTURE)).toEqual([1000, 1000, 800]);
    expect(numbers(balanceSheet.liabilities.totalEquity)).toEqual([1000, 1000, 800]);
    expect(balanceSheet.assets.total).toEqual(balanceSheet.liabilities.total);
    expect(numbers(balanceSheet.netWorth)).toEqual([1000, 1000, 800]);
    expect(warnings).toEqual([]);
  });

  it('leaves a refund neutral for the equity as a whole', () => {
    // Surplus with dividends and refunds added back, against the equity paid in.
    expect(numbers(statements.equity.inflow)).toEqual([0, 600, 600]);
    expect(numbers(statements.equity.outflow)).toEqual([1000, 0, 0]);
    expect(numbers(statements.equity.net)).toEqual([-1000, 600, 600, 0]);
  });

  it('gives every partner its own cash flow and indicators', () => {
    const [a, b] = statements.shareholders ?? [];
    expect(a).toMatchObject({ equity: 'A', class: 'JOINT_VENTURE', residualValue: '400' });
    // Dividends of 60 a year and the refund of 200, against 600 paid in; then half of 800.
    expect(numbers(a?.dividends ?? [])).toEqual([0, 60, 60]);
    expect(numbers(a?.inflow ?? [])).toEqual([0, 60, 260]);
    expect(numbers(a?.outflow ?? [])).toEqual([600, 0, 0]);
    expect(numbers(a?.net ?? [])).toEqual([-600, 60, 260, 400]);
    expect(numbers(a?.cumulative ?? [])).toEqual([-600, -540, -280, 120]);
    close(a?.npv, present([-600, 60, 260, 400]));
    expect(a?.payback?.period).toBe(3);
    expect(numbers(b?.net ?? [])).toEqual([-400, 40, 40, 400]);
    close(b?.npv, present([-400, 40, 40, 400]));
    // B's rate of return: −400 + 40 / q + 40 / q² + 400 / q³ = 0.
    const q = toDecimal(b?.irr ?? 'NaN').plus(1);
    expect(
      new Decimal(40)
        .div(q)
        .plus(new Decimal(40).div(q.pow(2)))
        .plus(new Decimal(400).div(q.pow(3)))
        .minus(400)
        .abs()
        .lt('1e-10'),
    ).toBe(true);
    // At 10 % the present value of both partners stays negative (−30.1 each): the engine says
    // so with the partner's name.
    expect(a?.dynamicPayback).toBeUndefined();
    expect(a?.warnings).toEqual([{ code: 'dynamicPayback.notReached', params: { item: 'A' } }]);
    expect(b?.warnings).toEqual([{ code: 'dynamicPayback.notReached', params: { item: 'B' } }]);
  });

  it('pays preferred dividends on the equity held after a refund', () => {
    const early: ProjectInput = {
      ...venture,
      financing: {
        ...venture.financing,
        equity: venture.financing.equity.map((e) =>
          e.key === 'A' ? { ...e, refunds: at({ 1: '200' }) } : e,
        ),
      },
      statements: {
        ...venture.statements,
        profitDistribution: {
          retainedShare: '0',
          shareholders: [
            { ...holder('A', '0.6', '0.5'), preferredRate: '0.1' },
            holder('B', '0.4', '0.5'),
          ],
        },
      },
    };
    const paid = projectModel(early).value.statements.dividends.shareholders[0];
    // 10 % of the 400 still held, then 60 % of the 60 that remain.
    expect(numbers(paid?.preferred ?? [])).toEqual([0, 40, 40]);
    expect(numbers(paid?.ordinary ?? [])).toEqual([0, 36, 36]);
  });

  it('names the partner in the warnings of its own flow', () => {
    // A partner who pays nothing in has no investment to pay back.
    const free: ProjectInput = {
      ...venture,
      financing: {
        ...venture.financing,
        equity: [
          { ...venture.financing.equity[0]!, amounts: at({ 0: '1000' }), refunds: at({}) },
          { ...venture.financing.equity[1]!, amounts: at({}) },
        ],
      },
    };
    const result = projectModel(free);
    const b = result.value.statements.shareholders?.[1];
    expect(b?.irr).toBeUndefined();
    expect(b?.warnings.map((w) => [w.code, w.params?.item])).toEqual(
      expect.arrayContaining([
        ['irr.noSignChange', 'B'],
        ['payback.noInvestment', 'B'],
      ]),
    );
    // They are not mixed with the warnings of the project.
    expect(result.warnings.some((w) => w.code === 'irr.noSignChange')).toBe(false);
  });

  it('produces no partner flows without a distribution of the net worth', () => {
    const plain = projectModel(withHolders([holder('A', '0.6'), holder('B', '0.4')])).value;
    expect(plain.statements.shareholders).toBeUndefined();
    expect(numbers(plain.statements.cashFlow.outflows.equityRefunds)).toEqual([0, 0, 200]);
  });

  it('wants the share of the net worth for all shareholders, adding up to 100 %', () => {
    fails(
      () => projectModel(withHolders([holder('A', '0.6', '1'), holder('B', '0.4')])),
      'shareholders.netWorthShareRequired',
      'statements.profitDistribution.shareholders[1].netWorthShare',
    );
    fails(
      () => projectModel(withHolders([holder('A', '0.6', '0.5'), holder('B', '0.4', '0.4')])),
      'shareholders.netWorthShares',
      'statements.profitDistribution.shareholders',
    );
    fails(
      () => projectModel(withHolders([holder('A', '0.6', '1.5'), holder('B', '0.4', '0')])),
      'share.outOfRange',
      'statements.profitDistribution.shareholders[0].netWorthShare',
    );
  });

  it('refuses a refund above the equity held and a refund of a subsidy', () => {
    const withEquity = (equity: ProjectInput['financing']['equity']): ProjectInput => ({
      ...venture,
      financing: { ...venture.financing, equity },
    });
    const [a, b] = venture.financing.equity;
    fails(
      () => projectModel(withEquity([{ ...a!, refunds: at({ 1: '500', 2: '200' }) }, b!])),
      'financing.refundExceedsEquity',
      'financing.equity[0].refunds[2]',
    );
    fails(
      () => projectModel(withEquity([{ ...a!, refunds: at({ 2: '-1' }) }, b!])),
      'amount.negative',
      'financing.equity[0].refunds[2]',
    );
    fails(
      () =>
        projectModel({
          ...withEquity([
            a!,
            b!,
            {
              key: 'grant',
              class: 'SUBSIDY',
              currency: 'IRR',
              origin: 'LOCAL',
              amounts: at({ 0: '100' }),
              refunds: at({ 2: '50' }),
            },
          ]),
        }),
      'financing.subsidyRefund',
      'financing.equity[2].refunds[2]',
    );
  });
});
