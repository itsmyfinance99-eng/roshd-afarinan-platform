import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
import { EngineInputError } from '../errors';
import { paybackPeriod } from '../indicators';
import { irr } from '../irr';
import { loanPeriods, loanSchedule } from '../loans';
import { npv } from '../time-value';
import { incrementalAnalysis } from './incremental';
import { projectModel, type ProjectInput } from './project';
import type { StartingBalances } from './starting-balances';

/**
 * An existing factory over three years of production, without a construction phase (VII.T).
 *
 * Starting balance: machinery 600 (written off in three years) and land 300; a stock of ore of 80,
 * ten finished units at 5, receivables of 120 collected after 90 days, cash-in-hand 30, short-term
 * deposits 20 and a cash surplus of 40; payables of 70 paid after 400 days; a loan of 300 at 10 %
 * repaid in three instalments; equity 500. Assets 1 240 against 870, so 370 are reserves.
 *
 * Operations: 100 units a year at 10, ore 4 a unit, office 100 a year, no working capital
 * requirement, tax 10 %, the whole profit retained, discount rate 10 %.
 */
const at = (values: Record<number, string>) => ['0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
const balances: StartingBalances = {
  fixedAssets: [
    { item: 'machinery', value: '600' },
    { item: 'land', value: '300' },
  ],
  materials: [{ cost: 'ore', value: '80' }],
  workInProgress: [],
  finishedProducts: [{ product: 'steel', quantity: '10', price: '5' }],
  receivables: { value: '120', collectionDays: 90 },
  payables: { value: '70', paymentDays: 400 },
  cashInHand: '30',
  shortTermDeposits: '20',
  cashSurplus: '40',
  loans: [{ loan: 'bank', balance: '300' }],
  equity: [{ equity: 'founders', value: '500' }],
};
const existing: ProjectInput = {
  horizon: {
    start: { year: 2027, month: 1 },
    balanceMonth: 12,
    construction: { periods: 0, periodMonths: 12 },
    startup: { periods: 0, periodMonths: 12 },
    productionYears: 3,
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
        amounts: at({}),
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 36,
          salvageRate: '0',
          startPeriod: 0,
        },
      },
      { key: 'land', group: 'LAND', currency: 'IRR', origin: 'LOCAL', amounts: at({}) },
    ],
  },
  financing: {
    equity: [
      { key: 'founders', class: 'ORDINARY', currency: 'IRR', origin: 'LOCAL', amounts: at({}) },
    ],
    loans: [
      {
        key: 'bank',
        currency: 'IRR',
        origin: 'LOCAL',
        loan: {
          type: 'CONSTANT_PRINCIPAL',
          repaymentMonths: 12,
          flows: [],
          rates: [{ fromDay: 1, rate: '0.1' }],
          capitalisedShare: '0',
          numberOfRepayments: 3,
          firstRepaymentDay: 360,
        },
      },
    ],
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
            quantities: ['100', '100', '100'],
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
      {
        key: 'office',
        category: 'ADMINISTRATIVE_OVERHEADS',
        product: 'steel',
        currency: 'IRR',
        origin: 'LOCAL',
        standard: { mode: 'PER_UNIT', quantity: '0', price: '0', fixedCost: '100' },
        payablesCoverage: none,
      },
    ],
    cash: { localCoverage: none, foreignCoverage: none, depositShare: '0', depositRate: '0' },
  },
  statements: {
    tax: {
      brackets: [{ lowerLimit: '0', rate: '0.1' }],
      holidayYears: 0,
      lossCarryForwardYears: 0,
    },
    profitDistribution: { retainedShare: '1', shareholders: [] },
    discounting: { totalCapitalRate: '0.1', equityRate: '0.1' },
    referenceYear: 0,
  },
  startingBalances: balances,
};

/**
 * The same factory with the project: a new line of 500 bought in the first year with new equity,
 * written off in the two years after it, selling 50 units more in the second and third year.
 */
const expanded: ProjectInput = {
  ...existing,
  investment: {
    items: [
      ...existing.investment.items,
      {
        key: 'new-line',
        group: 'MACHINERY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '500' }),
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 24,
          salvageRate: '0',
          startPeriod: 0,
        },
      },
    ],
  },
  financing: {
    ...existing.financing,
    equity: [
      {
        key: 'founders',
        class: 'ORDINARY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '500' }),
      },
    ],
  },
  operations: {
    ...existing.operations,
    products: existing.operations.products.map((p) => ({
      ...p,
      sales: p.sales.map((l) => ({ ...l, quantities: ['100', '150', '150'] })),
    })),
  },
};

const withBalances = (change: Partial<StartingBalances>): ProjectInput => ({
  ...existing,
  startingBalances: { ...balances, ...change },
});
const fails = (
  run: () => unknown,
  code: string,
  field: string,
  params: Record<string, string> = {},
) =>
  expect(run).toThrowError(new EngineInputError(code as EngineInputError['code'], field, params));
const close = (actual: string | undefined, expected: Decimal | string, tolerance = '1e-20') =>
  expect(
    toDecimal(actual ?? 'NaN')
      .minus(expected)
      .abs()
      .lt(tolerance),
    `${actual} ≈ ${expected.toString()}`,
  ).toBe(true);
const numbers = (values: string[]) => values.map((v) => toDecimal(v).toNumber());

describe('starting balances of an existing enterprise', () => {
  const { value: model } = projectModel(existing);
  const { statements, operations, investment, financing } = model;

  it('balances the starting balance sheet with reserves', () => {
    const start = statements.startingBalance;
    expect(start?.assets).toEqual({
      cashSurplus: '40',
      materials: '80',
      workInProgress: '0',
      finishedProducts: '50',
      receivables: '120',
      cashInHand: '30',
      shortTermDeposits: '20',
      currentAssets: '340',
      fixedInvestment: '900',
      preProduction: '0',
      fixedAssets: '900',
      accumulatedLosses: '0',
      total: '1240',
    });
    expect(start?.liabilities).toMatchObject({
      accountsPayable: '70',
      longTermDebt: '300',
      totalEquity: '500',
      reserves: '370',
      total: '1240',
    });
    expect(start?.liabilities.equity.ORDINARY).toBe('500');
    expect(start?.netWorth).toBe('870');
  });

  it('shows accumulated losses when the liabilities exceed the assets', () => {
    const start = projectModel(withBalances({ equity: [{ equity: 'founders', value: '1000' }] }))
      .value.statements.startingBalance;
    expect(start?.assets.accumulatedLosses).toBe('130');
    expect(start?.liabilities.reserves).toBe('0');
    expect(start?.assets.total).toBe(start?.liabilities.total);
    expect(start?.netWorth).toBe('870');
  });

  it('depreciates existing assets from the first day and keeps land at its value', () => {
    expect(investment.startingBalance).toEqual({ fixed: '900', preProduction: '0', total: '900' });
    expect(investment.items[0]?.startingBalance).toBe('600');
    expect(numbers(investment.items[0]?.depreciation ?? [])).toEqual([200, 200, 200]);
    expect(numbers(investment.bookValue.fixed)).toEqual([700, 500, 300]);
    expect(numbers(investment.fixedInvestment)).toEqual([0, 0, 0]);
  });

  it('uses the starting stocks first and settles receivables and payables on their day', () => {
    // Ten units come from stock, so 90 are produced; the ore in stock is used up.
    expect(numbers(operations.products[0]?.quantities.stockBroughtForward ?? [])).toEqual([
      10, 0, 0,
    ]);
    expect(numbers(operations.products[0]?.quantities.produced ?? [])).toEqual([90, 100, 100]);
    const wc = operations.workingCapital;
    expect(numbers(wc.totals.materials)).toEqual([0, 0, 0]);
    expect(numbers(wc.totals.finishedProducts)).toEqual([0, 0, 0]);
    // Receivables are collected on day 90 (first year), payables paid on day 400 (second year).
    expect(numbers(wc.totals.receivables)).toEqual([0, 0, 0]);
    expect(numbers(wc.totals.currentLiabilities)).toEqual([70, 0, 0]);
    // Cash-in-hand falls to its requirement (none); the deposits stay to the end.
    expect(numbers(wc.cash.inHand)).toEqual([0, 0, 0]);
    expect(numbers(wc.cash.deposits)).toEqual([20, 20, 20]);
    expect(numbers(wc.totals.increase)).toEqual([-280, 70, 0]);
    expect(wc.liquidation).toBe('20');
    expect(wc.starting?.opening).toMatchObject({
      currentAssets: '300',
      currentLiabilities: '70',
      netWorkingCapital: '230',
    });
  });

  it('repays an existing loan without a disbursement', () => {
    expect(financing.startingBalance?.debt).toBe('300');
    const loan = financing.loanTotals;
    expect(numbers(loan.map((p) => p.beginningBalance))).toEqual([300, 200, 100]);
    expect(numbers(loan.map((p) => p.interest))).toEqual([30, 20, 10]);
    expect(numbers(loan.map((p) => p.repayment))).toEqual([100, 100, 100]);
    expect(numbers(loan.map((p) => p.disbursement))).toEqual([0, 0, 0]);
  });

  it('starts the cash flow from the cash surplus and measures increases from the start', () => {
    const { cashFlow, incomeStatement } = statements;
    // Profit: 1 000 − 400 − 100 − 200 depreciation − interest, tax 10 %.
    expect(numbers(incomeStatement.netProfit)).toEqual([243, 252, 261]);
    // The first year frees 280 of current assets; the second pays the 70 of payables.
    expect(numbers(cashFlow.outflows.currentAssetsIncrease)).toEqual([-280, 0, 0]);
    expect(numbers(cashFlow.inflows.payablesIncrease)).toEqual([0, -70, 0]);
    expect(numbers(cashFlow.inflows.equity)).toEqual([0, 0, 0]);
    expect(numbers(cashFlow.inflows.longTermLoans)).toEqual([0, 0, 0]);
    expect(numbers(cashFlow.surplus)).toEqual([623, 282, 361]);
    expect(numbers(cashFlow.cumulativeSurplus)).toEqual([663, 945, 1306]);
    expect(numbers(cashFlow.cashBalance)).toEqual([663, 945, 1306]);
  });

  it('carries equity, debt and reserves into a balance sheet that balances', () => {
    const { assets, liabilities } = statements.balanceSheet;
    expect(numbers(assets.total)).toEqual([1383, 1465, 1626]);
    expect(assets.total).toEqual(liabilities.total);
    expect(numbers(liabilities.totalEquity)).toEqual([500, 500, 500]);
    expect(numbers(liabilities.equity.ORDINARY)).toEqual([500, 500, 500]);
    expect(numbers(liabilities.longTermDebt)).toEqual([200, 100, 0]);
    expect(numbers(liabilities.reserves)).toEqual([613, 865, 1126]);
    expect(numbers(statements.balanceSheet.netWorth)).toEqual([1113, 1365, 1626]);
  });

  it('charges the discounted cash flows with the starting balance (XI.F)', () => {
    const { totalCapital, equity } = statements;
    // Fixed assets 900 + current assets 340 − current liabilities 70; then the starting equity.
    expect(totalCapital.startingBalance).toBe('1170');
    expect(numbers(totalCapital.net)).toEqual([753, 402, 471, 320]);
    expect(numbers(totalCapital.cumulative)).toEqual([-417, -15, 456, 776]);
    expect(equity.startingBalance).toBe('500');
    expect(numbers(equity.net)).toEqual([623, 282, 361, 320]);
    // Reference at the end of the first year: the day before the project is one year earlier.
    close(totalCapital.startingBalancePresentValue, '1287');
    close(
      totalCapital.npv,
      new Decimal(-1287)
        .plus(753)
        .plus(new Decimal(402).div('1.1'))
        .plus(new Decimal(471).div('1.21'))
        .plus(new Decimal(320).div('1.331')),
    );
    close(
      equity.npv,
      new Decimal(-550)
        .plus(623)
        .plus(new Decimal(282).div('1.1'))
        .plus(new Decimal(361).div('1.21'))
        .plus(new Decimal(320).div('1.331')),
    );
    // Paid back in the third period: 15 of its 471.
    expect(totalCapital.payback?.period).toBe(2);
    close(totalCapital.payback?.months, new Decimal(24).plus(new Decimal(15).div(471).times(12)));
  });

  it('counts the charge of the starting balance as investment in the NPV ratio', () => {
    const ratio = statements.totalCapital.npvRatio;
    // 1 170 a year before the reference, 280 of current assets freed, 70 of payables paid.
    const invested = new Decimal(1287).minus(280).plus(new Decimal(70).div('1.1'));
    close(ratio?.presentValueOfInvestment, invested);
    close(ratio?.ratio, toDecimal(statements.totalCapital.npv).div(invested));
    expect(numbers(statements.totalCapital.investment)).toEqual([-280, 70, 0, 0]);
  });

  it('takes all deposits out of the cash-in-hand of a production period (VII.Q)', () => {
    // Office costs of 100 a year with 36 days of cash: a requirement of 10, half of it deposited.
    const withCash = (shortTermDeposits: string) =>
      projectModel({
        ...existing,
        operations: {
          ...existing.operations,
          cash: {
            localCoverage: { days: '36' },
            foreignCoverage: none,
            depositShare: '0.5',
            depositRate: '0.2',
          },
        },
        startingBalances: { ...balances, shortTermDeposits },
      }).value;
    const small = withCash('2').operations;
    expect(numbers(small.workingCapital.cash.deposits)).toEqual([7, 7, 7]);
    expect(numbers(small.workingCapital.cash.inHand)).toEqual([3, 3, 3]);
    expect(numbers(small.workingCapital.totals.cash)).toEqual([10, 10, 10]);
    // Interest on the deposits made from the requirement only: 5 at 20 %.
    expect(numbers(small.depositInterest)).toEqual([1, 1, 1]);
    // Deposits above the requirement leave nothing in hand; they stay to the end.
    const large = withCash('20');
    expect(numbers(large.operations.workingCapital.cash.deposits)).toEqual([25, 25, 25]);
    expect(numbers(large.operations.workingCapital.cash.inHand)).toEqual([0, 0, 0]);
    expect(numbers(large.operations.workingCapital.totals.cash)).toEqual([25, 25, 25]);
    const sheet = large.statements.balanceSheet;
    expect(sheet.assets.total).toEqual(sheet.liabilities.total);
  });

  it('discounts the starting balance at its own date when the reference is the start', () => {
    const result = projectModel({
      ...existing,
      statements: {
        ...existing.statements,
        discounting: { ...existing.statements.discounting, reference: 'START_OF_FIRST_PERIOD' },
      },
    }).value.statements.totalCapital;
    close(result.startingBalancePresentValue, '1170');
    close(
      result.npv,
      new Decimal(-1170)
        .plus(new Decimal(753).div('1.1'))
        .plus(new Decimal(402).div('1.21'))
        .plus(new Decimal(471).div('1.331'))
        .plus(new Decimal(320).div('1.4641')),
    );
  });

  it('leaves a new project without any starting balance line', () => {
    const { startingBalances: _, ...fresh } = existing;
    const loans = fresh.financing.loans.map((l) => ({
      ...l,
      loan: { ...l.loan, flows: [{ day: 1, amount: '300' }], firstRepaymentDay: 720 },
    }));
    const result = projectModel({ ...fresh, financing: { ...fresh.financing, loans } }).value;
    expect(result.statements.startingBalance).toBeUndefined();
    expect(result.statements.totalCapital.startingBalance).toBeUndefined();
    expect(result.operations.workingCapital.starting).toBeUndefined();
    expect(result.investment.startingBalance).toBeUndefined();
    expect(result.financing.startingBalance).toBeUndefined();
  });

  it('gives the results of a new project when every starting balance is zero', () => {
    const zero: StartingBalances = {
      fixedAssets: [],
      materials: [],
      workInProgress: [],
      finishedProducts: [],
      receivables: { value: '0', collectionDays: 0 },
      payables: { value: '0', paymentDays: 0 },
      cashInHand: '0',
      shortTermDeposits: '0',
      cashSurplus: '0',
      loans: [],
      equity: [],
    };
    const { startingBalances: _, ...fresh } = expanded;
    const financed: ProjectInput = {
      ...fresh,
      financing: {
        ...fresh.financing,
        loans: fresh.financing.loans.map((l) => ({
          ...l,
          loan: { ...l.loan, flows: [{ day: 1, amount: '300' }], firstRepaymentDay: 720 },
        })),
      },
    };
    const plain = projectModel(financed).value.statements;
    const zeroed = projectModel({ ...financed, startingBalances: zero }).value.statements;
    expect(zeroed.cashFlow).toEqual(plain.cashFlow);
    expect(zeroed.balanceSheet).toEqual(plain.balanceSheet);
    expect(zeroed.totalCapital.npv).toBe(plain.totalCapital.npv);
    expect(zeroed.totalCapital.irr).toBe(plain.totalCapital.irr);
    expect(zeroed.equity.net).toEqual(plain.equity.net);
    expect(zeroed.totalCapital.startingBalance).toBe('0');
    expect(zeroed.startingBalance?.assets.total).toBe('0');
  });

  it('keeps a receivable beyond the horizon outstanding and liquidates it', () => {
    const wc = projectModel(withBalances({ receivables: { value: '120', collectionDays: 2000 } }))
      .value.operations.workingCapital;
    expect(numbers(wc.totals.receivables)).toEqual([120, 120, 120]);
    expect(wc.liquidation).toBe('140');
  });

  it('converts an existing foreign loan at the rate of the first period', () => {
    const result = projectModel({
      ...existing,
      exchangeRates: { USD: ['10', '12', '12'] },
      financing: {
        ...existing.financing,
        loans: existing.financing.loans.map((l) => ({ ...l, currency: 'USD' })),
      },
    }).value;
    expect(result.financing.startingBalance?.debt).toBe('3000');
    expect(result.statements.startingBalance?.liabilities.longTermDebt).toBe('3000');
    // 200 dollars are restated from 10 to 12 in the second year.
    expect(numbers(result.financing.loanTotals.map((p) => p.exchangeAdjustment))).toEqual([
      0, 400, 0,
    ]);
    const sheet = result.statements.balanceSheet;
    expect(sheet.assets.total).toEqual(sheet.liabilities.total);
  });

  it('refuses a balance of an unknown item, a negative amount and a wrong day', () => {
    fails(
      () => projectModel(withBalances({ fixedAssets: [{ item: 'crane', value: '1' }] })),
      'startingBalance.unknownItem',
      'startingBalances.fixedAssets[0].item',
    );
    fails(
      () => projectModel(withBalances({ loans: [{ loan: 'bank', balance: '-1' }] })),
      'amount.negative',
      'startingBalances.loans[0].balance',
    );
    fails(
      () => projectModel(withBalances({ equity: [{ equity: 'nobody', value: '1' }] })),
      'startingBalance.unknownItem',
      'startingBalances.equity[0].equity',
    );
    fails(
      () => projectModel(withBalances({ materials: [{ cost: 'office', value: '1' }] })),
      'startingBalance.materialItem',
      'startingBalances.materials[0].cost',
    );
    fails(
      () =>
        projectModel(
          withBalances({
            finishedProducts: [
              { product: 'steel', quantity: '1', price: '1' },
              { product: 'steel', quantity: '1', price: '1' },
            ],
          }),
        ),
      'model.duplicateKey',
      'startingBalances.finishedProducts[1].product',
    );
    fails(
      () => projectModel(withBalances({ payables: { value: '70', paymentDays: -1 } })),
      'startingBalance.days',
      'startingBalances.payables.paymentDays',
    );
    fails(
      () => projectModel(withBalances({ cashSurplus: '-5' })),
      'amount.negative',
      'startingBalances.cashSurplus',
    );
  });
});

describe('an existing loan', () => {
  const loan = {
    type: 'ANNUITY' as const,
    repaymentMonths: 12 as const,
    flows: [],
    rates: [{ fromDay: 1, rate: '0.1' }],
    capitalisedShare: '0',
    numberOfRepayments: 2,
    firstRepaymentDay: 360,
    openingBalance: '210',
  };

  it('accrues interest from the first day on the opening balance', () => {
    const schedule = loanSchedule(loan).value;
    // Annuity of 121: interest 21 and 11.
    expect(schedule.events.map((e) => [e.day, e.kind, toDecimal(e.amount).toNumber()])).toEqual([
      [360, 'INTEREST_PAID', 21],
      [360, 'REPAYMENT', 100],
      [720, 'INTEREST_PAID', 11],
      [720, 'REPAYMENT', 110],
    ]);
    expect(schedule.totalDisbursed).toBe('0');
    expect(schedule.finalBalance).toBe('0');
    const periods = loanPeriods(schedule, [180, 360, 720], '210').value;
    expect(periods.map((p) => p.openingBalance)).toEqual(['210', '210', '110']);
    expect(periods.map((p) => p.closingBalance)).toEqual(['210', '110', '0']);
  });

  it('still needs a disbursement when nothing is outstanding', () => {
    fails(() => loanSchedule({ ...loan, openingBalance: '0' }), 'loan.noDisbursement', 'flows');
    fails(
      () => loanSchedule({ ...loan, openingBalance: '-1' }),
      'amount.negative',
      'openingBalance',
    );
  });

  it('needs a rate from the first day', () => {
    fails(
      () => loanSchedule({ ...loan, rates: [{ fromDay: 31, rate: '0.1' }] }),
      'loan.rateMissing',
      'rates[0].fromDay',
    );
  });
});

describe('an amount on the day before the first period', () => {
  const series = { periodMonths: [0, 12, 12], amounts: ['-100', '60', '60.5'] };

  it('is not discounted at the start and is compounded to the end of the first year', () => {
    close(
      npv(series, { annualRate: ['0.1', '0.1', '0.1'], reference: 'START_OF_FIRST_PERIOD' }).value,
      new Decimal(-100).plus(new Decimal(60).div('1.1')).plus(new Decimal('60.5').div('1.21')),
    );
    close(npv(series, { annualRate: '0.1' }).value, new Decimal(-110).plus(60).plus(55));
  });

  it('counts as time zero for the IRR and the payback', () => {
    // By the definition: the later amounts discounted at the IRR equal the amount of day zero.
    const rate = toDecimal(irr(series).value ?? 'NaN').plus(1);
    close('100', new Decimal(60).div(rate).plus(new Decimal('60.5').div(rate.pow(2))), '1e-12');
    const payback = paybackPeriod(series).value;
    expect(payback?.period).toBe(2);
    close(payback?.months, new Decimal(12).plus(new Decimal(40).div('60.5').times(12)));
  });

  it('is allowed for the first amount only', () => {
    fails(
      () => npv({ periodMonths: [12, 0], amounts: ['1', '1'] }, { annualRate: '0.1' }),
      'period.lengthNotPositiveInteger',
      'periodMonths[1]',
    );
    fails(
      () => npv({ periodMonths: [0], amounts: ['1'] }, { annualRate: '0.1' }),
      'period.lengthNotPositiveInteger',
      'periodMonths[0]',
    );
  });
});

describe('incrementalAnalysis', () => {
  const base = projectModel(existing).value;
  const project = projectModel(expanded).value;
  const discounting = expanded.statements.discounting;
  const { value, warnings } = incrementalAnalysis({
    withProject: project,
    withoutProject: base,
    discounting,
  });

  it('takes the difference of the two cases line by line', () => {
    // The new line costs 500 and earns 500 − 200 of costs − 5 of tax in each later year.
    expect(numbers(value.totalCapital.net)).toEqual([-500, 295, 295, 0]);
    expect(numbers(value.equity.net)).toEqual([-500, 295, 295, 0]);
    expect(numbers(value.totalCapital.inflow)).toEqual([0, 500, 500]);
    expect(numbers(value.totalCapital.outflow)).toEqual([500, 205, 205]);
    expect(numbers(value.cashFlow.inflows.equity)).toEqual([500, 0, 0]);
    expect(numbers(value.cashFlow.outflows.fixedInvestment)).toEqual([500, 0, 0]);
    expect(numbers(value.cashFlow.outflows.incomeTax)).toEqual([0, 5, 5]);
    expect(numbers(value.cashFlow.surplus)).toEqual([0, 295, 295]);
    expect(numbers(value.cashFlow.cumulativeSurplus)).toEqual([0, 295, 590]);
    expect(warnings).toEqual([]);
  });

  it('cancels the starting balances both cases share', () => {
    expect(value.totalCapital.startingBalance).toBe('0');
    expect(value.equity.startingBalance).toBe('0');
    expect(numbers(value.totalCapital.cumulative)).toEqual([-500, -205, 90, 90]);
  });

  it('computes the indicators of the difference', () => {
    const expected = new Decimal(-500)
      .plus(new Decimal(295).div('1.1'))
      .plus(new Decimal(295).div('1.21'));
    close(value.totalCapital.npv, expected);
    // Discounting is linear: the NPV of the difference is the difference of the NPVs.
    close(
      value.totalCapital.npv,
      toDecimal(project.statements.totalCapital.npv).minus(base.statements.totalCapital.npv),
      '1e-25',
    );
    const rate = toDecimal(value.totalCapital.irr ?? 'NaN').plus(1);
    close('500', new Decimal(295).div(rate).plus(new Decimal(295).div(rate.pow(2))), '1e-10');
    expect(value.totalCapital.payback?.period).toBe(2);
    expect(value.totalCapital.dynamicPayback?.period).toBe(2);
  });

  it('keeps a starting balance only one case has', () => {
    const { startingBalances: _, ...fresh } = existing;
    const withoutBalances = projectModel({
      ...fresh,
      financing: {
        ...fresh.financing,
        loans: fresh.financing.loans.map((l) => ({
          ...l,
          loan: { ...l.loan, flows: [{ day: 1, amount: '300' }], firstRepaymentDay: 720 },
        })),
      },
    }).value;
    const result = incrementalAnalysis({
      withProject: base,
      withoutProject: withoutBalances,
      discounting,
    }).value;
    expect(result.totalCapital.startingBalance).toBe('1170');
    expect(result.equity.startingBalance).toBe('500');
  });

  it('keeps a line only one case has', () => {
    // A run stored before refunds of equity existed has no such line.
    const { equityRefunds: _, ...outflows } = project.statements.cashFlow.outflows;
    const old = {
      ...project,
      statements: {
        ...project.statements,
        cashFlow: { ...project.statements.cashFlow, outflows },
      },
    } as typeof project;
    const refunds = (withProject: typeof project, withoutProject: typeof project) =>
      incrementalAnalysis({ withProject, withoutProject, discounting }).value.cashFlow.outflows
        .equityRefunds;
    expect(numbers(refunds(old, base))).toEqual([0, 0, 0]);
    expect(numbers(refunds(base, old))).toEqual([0, 0, 0]);
  });

  it('refuses two cases with different horizons or another discount option', () => {
    const longer = projectModel({
      ...existing,
      horizon: { ...existing.horizon, start: { year: 2028, month: 1 } },
    }).value;
    fails(
      () => incrementalAnalysis({ withProject: project, withoutProject: longer, discounting }),
      'incremental.horizonMismatch',
      'withoutProject',
    );
    const atEnd = projectModel({
      ...existing,
      statements: { ...existing.statements, residualValueTiming: 'END_OF_PRODUCTION' },
    }).value;
    fails(
      () => incrementalAnalysis({ withProject: project, withoutProject: atEnd, discounting }),
      'incremental.horizonMismatch',
      'withoutProject',
    );
    fails(
      () =>
        incrementalAnalysis({
          withProject: project,
          withoutProject: base,
          discounting: { totalCapitalRate: ['0.1'], equityRate: '0.1' },
        }),
      'rate.pathLengthMismatch',
      'discounting.totalCapitalRate',
      { expected: '3', actual: '1' },
    );
  });
});
