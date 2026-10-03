import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
import { EngineInputError } from '../errors';
import { financingSchedule } from './financing';
import { planHorizon } from './horizon';
import { investmentSchedule } from './investment';
import { operationsSchedule } from './operations';
import { financialStatements, type StatementsInput } from './statements';

// One construction year (2027) and three production years (2028–2030), balance in December.
const horizon = planHorizon({
  start: { year: 2027, month: 1 },
  balanceMonth: 12,
  construction: { periods: 1, periodMonths: 12 },
  startup: { periods: 0, periodMonths: 12 },
  productionYears: 3,
});
const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const production = (value: string) => at({ 1: value, 2: value, 3: value });
const none = { days: '0' };
const context = { horizon, localCurrency: 'IRR', exchangeRates: {} };

// Machinery of 1 000 over five years (200 a year) and land of 200, bought in construction.
const investment = investmentSchedule({
  ...context,
  items: [
    {
      key: 'machinery',
      group: 'MACHINERY',
      currency: 'IRR',
      origin: 'LOCAL',
      amounts: at({ 0: '1000' }),
      depreciation: { method: 'LINEAR_TO_ZERO', lifeMonths: 60, salvageRate: '0', startPeriod: 1 },
    },
    { key: 'land', group: 'LAND', currency: 'IRR', origin: 'LOCAL', amounts: at({ 0: '200' }) },
  ],
}).value;

// A loan of 500 at 10 %, drawn at the end of construction and repaid in two yearly instalments:
// interest 50 and 25, repayments 250 and 250.
const financing = (equity: string) =>
  financingSchedule({
    ...context,
    equity: [
      {
        key: 'founders',
        class: 'ORDINARY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: equity }),
      },
    ],
    loans: [
      {
        key: 'bank',
        currency: 'IRR',
        origin: 'LOCAL',
        loan: {
          type: 'CONSTANT_PRINCIPAL',
          repaymentMonths: 12,
          flows: [{ day: 360, amount: '500' }],
          rates: [{ fromDay: 1, rate: '0.1' }],
          capitalisedShare: '0',
          numberOfRepayments: 2,
          firstRepaymentDay: 720,
        },
      },
    ],
  }).value;

// 100 units a year at 10: revenue 1 000; ore 400 (variable), office 100 (fixed). Receivables of
// 36 days on the operating costs of 500: 50 in every production year. No other working capital.
const operations = operationsSchedule({
  ...context,
  products: [
    {
      key: 'steel',
      sales: [
        {
          key: 'home',
          market: 'LOCAL',
          currency: 'IRR',
          quantities: production('100'),
          price: '10',
          salesTaxRate: '0',
          subsidyRate: '0',
          subsidyAmount: '0',
          receivablesCoverage: { days: '36' },
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
}).value;

const base = (over: Partial<StatementsInput> = {}, equity = '800'): StatementsInput => ({
  horizon,
  investment,
  financing: financing(equity),
  operations,
  // 10 % up to 100 and 20 % above.
  tax: {
    brackets: [
      { lowerLimit: '0', rate: '0.1' },
      { lowerLimit: '100', rate: '0.2' },
    ],
    holidayYears: 0,
    lossCarryForwardYears: 0,
  },
  profitDistribution: {
    retainedShare: '0.5',
    shareholders: [
      {
        equity: 'founders',
        preferredRate: '0',
        preferredAmount: '0',
        ordinaryShare: '1',
        repatriatedShare: '0.2',
      },
    ],
  },
  discounting: { totalCapitalRate: '0.1', equityRate: '0.1' },
  referenceYear: 1,
  ...over,
});
const fails = (
  input: StatementsInput,
  code: string,
  field: string,
  params: Record<string, string> = {},
) =>
  expect(() => financialStatements(input)).toThrowError(
    new EngineInputError(code as EngineInputError['code'], field, params),
  );
const balances = (input: StatementsInput) => {
  const { balanceSheet } = financialStatements(input).value;
  expect(balanceSheet.assets.total).toEqual(balanceSheet.liabilities.total);
  return balanceSheet;
};
/** Present value at 10 % with the reference at the end of the first year (period 0). */
const present = (amounts: string[]) =>
  amounts.reduce(
    (sum, a, j) => sum.plus(toDecimal(a).div(new Decimal('1.1').pow(j))),
    new Decimal(0),
  );

describe('financialStatements: a fully financed project', () => {
  const { value, warnings, defaultsUsed } = financialStatements(base());

  it('builds the net income statement with graduated tax and dividends', () => {
    const s = value.incomeStatement;
    expect(s.salesRevenue).toEqual(production('1000'));
    expect(s.variableCosts).toEqual(production('400'));
    expect(s.variableMargin).toEqual(production('600'));
    expect(s.fixedCosts).toEqual(production('100'));
    expect(s.depreciation).toEqual(production('200'));
    expect(s.operationalMargin).toEqual(production('300'));
    expect(s.financialCosts).toEqual(at({ 1: '50', 2: '25' }));
    expect(s.grossProfitFromOperations).toEqual(at({ 1: '250', 2: '275', 3: '300' }));
    expect(s.grossProfit).toEqual(s.grossProfitFromOperations);
    expect(s.taxableProfit).toEqual(s.grossProfit);
    // 100 × 10 % + the rest × 20 %.
    expect(s.incomeTax).toEqual(at({ 1: '40', 2: '45', 3: '50' }));
    expect(s.netProfit).toEqual(at({ 1: '210', 2: '230', 3: '250' }));
    expect(s.dividends).toEqual(at({ 1: '105', 2: '115', 3: '125' }));
    expect(s.retainedProfit).toEqual(at({ 1: '105', 2: '115', 3: '125' }));
    expect(value.taxYears.map((y) => y.tax)).toEqual(['40', '45', '50']);
    expect(value.dividends.shareholders).toEqual([
      {
        equity: 'founders',
        preferred: at({}),
        ordinary: at({ 1: '105', 2: '115', 3: '125' }),
        repatriated: at({ 1: '21', 2: '23', 3: '25' }),
      },
    ]);
  });

  it('builds the cash flow for financial planning with its cumulative balance', () => {
    const c = value.cashFlow;
    expect(c.inflows.equity).toEqual(at({ 0: '800' }));
    expect(c.inflows.longTermLoans).toEqual(at({ 0: '500' }));
    expect(c.inflows.total).toEqual(['1300', '1000', '1000', '1000']);
    expect(c.outflows.fixedInvestment).toEqual(at({ 0: '1200' }));
    expect(c.outflows.currentAssetsIncrease).toEqual(at({ 1: '50' }));
    expect(c.outflows.operatingCosts).toEqual(production('500'));
    expect(c.outflows.financialCosts).toEqual(at({ 1: '50', 2: '25' }));
    expect(c.outflows.loanRepayments).toEqual(at({ 1: '250', 2: '250' }));
    // 50 + 500 + 40 + 50 + 250 + 105, then 500 + 45 + 25 + 250 + 115, then 500 + 50 + 125.
    expect(c.outflows.total).toEqual(['1200', '995', '935', '675']);
    expect(c.surplus).toEqual(['100', '5', '65', '325']);
    expect(c.cumulativeSurplus).toEqual(['100', '105', '170', '495']);
    expect(c.cashBalance).toEqual(c.cumulativeSurplus);
    expect(c.automaticEquity).toEqual(at({}));
    expect(c.automaticOverdraft).toEqual(at({}));
    expect(warnings).toEqual([]);
  });

  it('builds a balance sheet that balances in every period', () => {
    const b = value.balanceSheet;
    expect(b.assets.cashSurplus).toEqual(value.cashFlow.cashBalance);
    expect(b.assets.receivables).toEqual(production('50'));
    expect(b.assets.fixedAssets).toEqual(['1200', '1000', '800', '600']);
    expect(b.assets.total).toEqual(['1300', '1155', '1020', '1145']);
    expect(b.liabilities.longTermDebt).toEqual(['500', '250', '0', '0']);
    expect(b.liabilities.equity.ORDINARY).toEqual(['800', '800', '800', '800']);
    expect(b.liabilities.reserves).toEqual(['0', '105', '220', '345']);
    expect(b.liabilities.total).toEqual(b.assets.total);
    expect(b.netWorth).toEqual(['800', '905', '1020', '1145']);
  });

  it('derives the cash flow of the total capital and its indicators', () => {
    const t = value.totalCapital;
    expect(t.salvageColumn).toBe(true);
    // Revenue less investment, operating costs and tax; book values and working capital return
    // in the year after production: 400 + 200 + 50.
    expect(t.inflow).toEqual(['0', '1000', '1000', '1000']);
    expect(t.outflow).toEqual(['1200', '590', '545', '550']);
    expect(t.residualValue).toBe('650');
    expect(t.net).toEqual(['-1200', '410', '455', '450', '650']);
    expect(t.cumulative).toEqual(['-1200', '-790', '-335', '115', '765']);
    const npv = present(t.net);
    expect(toDecimal(t.npv).minus(npv).abs().lt('1e-25')).toBe(true);
    expect(toDecimal(t.npv).toFixed(4)).toBe('330.8107');
    expect(toDecimal(t.cumulativePresentValue[4]!).minus(npv).abs().lt('1e-25')).toBe(true);
    // NPV at the IRR is zero.
    const irr = toDecimal(t.irr!);
    const atIrr = t.net.reduce(
      (sum, a, j) => sum.plus(toDecimal(a).div(irr.plus(1).pow(j))),
      new Decimal(0),
    );
    expect(atIrr.abs().lt('0.0001')).toBe(true);
    expect(t.mirr).toBeDefined();
    // Recovered in the third production year: 36 + 12 × 335 / 450 months.
    expect(t.payback).toMatchObject({ period: 3, endMonth: 48 });
    expect(toDecimal(t.payback!.months).toFixed(4)).toBe('44.9333');
    expect(t.dynamicPayback).toMatchObject({ period: 4, endMonth: 60 });
    // PVI = 1 200 + 50 / 1.1.
    expect(t.investment).toEqual(['1200', '50', '0', '0', '0']);
    const pvi = new Decimal(1200).plus(new Decimal(50).div('1.1'));
    expect(toDecimal(t.npvRatio!.presentValueOfInvestment).minus(pvi).abs().lt('1e-25')).toBe(true);
    expect(toDecimal(t.npvRatio!.ratio).minus(npv.div(pvi)).abs().lt('1e-25')).toBe(true);
  });

  it('derives the cash flow of the equity: surplus plus dividends against the equity paid in', () => {
    const e = value.equity;
    expect(e.inflow).toEqual(['100', '110', '180', '450']);
    expect(e.outflow).toEqual(at({ 0: '800' }));
    // Book values and working capital less the debt outstanding (none).
    expect(e.residualValue).toBe('650');
    expect(e.net).toEqual(['-700', '110', '180', '450', '650']);
    expect(toDecimal(e.npv).minus(present(e.net)).abs().lt('1e-25')).toBe(true);
    expect(e.payback).toMatchObject({ period: 3, endMonth: 48 });
  });

  it('computes break-even, debt-service coverage and ratios from the statements', () => {
    // Year 2: margin ratio 0.6; fixed costs 100 + 200, interest 25.
    expect(value.breakEven.selectedYear).toBe(1);
    expect(value.breakEven.selected).toEqual(value.breakEven.periods[2]);
    expect(value.breakEven.periods[0]).toBeNull();
    const point = value.breakEven.periods[2]!;
    expect(point.variableMarginRatio).toBe('0.6');
    expect(point.excludingFinance.breakEvenSalesValue).toBe('500');
    expect(toDecimal(point.includingFinance.breakEvenSalesValue!).toFixed(4)).toBe('541.6667');
    // (5 + 250 + 50) / 300 and (65 + 250 + 25) / 275.
    const coverage = value.debtService!;
    expect(toDecimal(coverage.periods[1]!.ratio!).toFixed(4)).toBe('1.0167');
    expect(toDecimal(coverage.periods[2]!.ratio!).toFixed(4)).toBe('1.2364');
    expect(coverage.periods[3]!.ratio).toBeUndefined();
    expect(coverage.minimum?.period).toBe(1);
    expect(value.ratios.netProfitToSales).toEqual([null, '0.21', '0.23', '0.25']);
    expect(value.ratios.netProfitToEquity).toEqual(['0', '0.2625', '0.2875', '0.3125']);
    expect(value.ratios.longTermDebtToNetWorth).toEqual([
      '0.625',
      toDecimal('250').div(905).toFixed(),
      '0',
      '0',
    ]);
    expect(value.ratios.currentRatio).toEqual([null, null, null, null]);
  });

  it('lists the COMFAR defaults it used', () => {
    expect(defaultsUsed.map((d) => [d.key, d.item])).toEqual([
      ['cash.autoCoverage', undefined],
      ['assets.residualValuePeriod', undefined],
      ['mirr.rates', 'totalCapital'],
      ['discounting.referenceDate', undefined],
      ['mirr.rates', 'equity'],
      ['breakEven.period', undefined],
    ]);
    expect(defaultsUsed.find((d) => d.key === 'breakEven.period')?.value).toBe('2');
    expect(defaultsUsed.find((d) => d.key === 'assets.residualValuePeriod')?.value).toBe(
      'YEAR_AFTER_PRODUCTION',
    );
  });

  it('lists no default the user has overridden', () => {
    const result = financialStatements(
      base({
        automaticCashCoverage: true,
        residualValueTiming: 'END_OF_PRODUCTION',
        breakEvenYear: 0,
        discounting: {
          totalCapitalRate: ['0.1', '0.1', '0.1', '0.1'],
          equityRate: '0.1',
          reference: 'START_OF_FIRST_PERIOD',
          reinvestmentRate: '0.08',
          borrowingRate: '0.12',
        },
      }),
    );
    expect(result.defaultsUsed).toEqual([]);
    expect(result.value.breakEven.selectedYear).toBe(0);
    // The residual value arrives on the last day of production.
    expect(result.value.totalCapital.salvageColumn).toBe(false);
    expect(result.value.totalCapital.net).toEqual(['-1200', '410', '455', '1100']);
    expect(result.value.totalCapital.investment).toEqual(['1200', '50', '0', '0']);
    expect(result.value.equity.net).toEqual(['-700', '110', '180', '1100']);
  });
});

describe('financialStatements: cash deficits', () => {
  it('covers a deficit of the construction phase with labelled automatic equity', () => {
    const { value, warnings } = financialStatements(base({}, '600'));
    expect(value.cashFlow.surplus).toEqual(['-100', '5', '65', '325']);
    expect(value.cashFlow.cumulativeSurplus).toEqual(['-100', '-95', '-30', '295']);
    expect(value.cashFlow.automaticEquity).toEqual(at({ 0: '100' }));
    expect(value.cashFlow.cashBalance).toEqual(['0', '5', '70', '395']);
    expect(value.balanceSheet.liabilities.automaticEquity).toEqual(['100', '100', '100', '100']);
    expect(value.balanceSheet.liabilities.totalEquity).toEqual(['700', '700', '700', '700']);
    expect(value.balanceSheet.assets.total).toEqual(value.balanceSheet.liabilities.total);
    expect(warnings).toEqual([{ code: 'cash.underFinanced', params: { periods: '1' } }]);
  });

  // Equity of 700 and no retained profit: deficits of 100 and 50, then a surplus of 200.
  const tight = (over: Partial<StatementsInput> = {}) =>
    base(
      {
        profitDistribution: {
          retainedShare: '0',
          shareholders: base().profitDistribution.shareholders,
        },
        ...over,
      },
      '700',
    );

  it('covers deficits of the production phase with an overdraft repaid from the first surplus', () => {
    const { value, warnings } = financialStatements(tight());
    expect(value.cashFlow.surplus).toEqual(['0', '-100', '-50', '200']);
    expect(value.cashFlow.automaticOverdraft).toEqual(['0', '100', '50', '-150']);
    expect(value.cashFlow.automaticOverdraftBalance).toEqual(['0', '100', '150', '0']);
    expect(value.cashFlow.cashBalance).toEqual(['0', '0', '0', '50']);
    expect(value.balanceSheet.liabilities.currentLiabilities).toEqual(['0', '100', '150', '0']);
    expect(value.balanceSheet.assets.total).toEqual(['1200', '1050', '850', '700']);
    expect(value.balanceSheet.liabilities.total).toEqual(value.balanceSheet.assets.total);
    expect(warnings).toEqual([{ code: 'cash.underFinanced', params: { periods: '2، 3' } }]);
  });

  it('shows the deficit as negative cash when the user switches the coverage off', () => {
    const covered = financialStatements(tight()).value;
    const { value, warnings, defaultsUsed } = financialStatements(
      tight({ automaticCashCoverage: false }),
    );
    expect(value.cashFlow.automaticOverdraft).toEqual(at({}));
    expect(value.cashFlow.cashBalance).toEqual(['0', '-100', '-150', '50']);
    expect(value.balanceSheet.assets.total).toEqual(value.balanceSheet.liabilities.total);
    expect(warnings).toEqual([{ code: 'cash.deficit', params: { periods: '2، 3' } }]);
    expect(defaultsUsed.some((d) => d.key === 'cash.autoCoverage')).toBe(false);
    // The coverage is a financing matter: it changes neither view of the cash flow.
    expect(value.equity.net).toEqual(covered.equity.net);
    expect(value.totalCapital.net).toEqual(covered.totalCapital.net);
  });
});

describe('financialStatements: sale of assets and allowances', () => {
  it('books a sale above book value as extraordinary income and stops the depreciation', () => {
    const input = base({ assetSales: [{ item: 'machinery', period: 2, proceeds: '700' }] });
    const { value } = financialStatements(input);
    const s = value.incomeStatement;
    // Book value 600 at the end of year 2; nothing is depreciated in year 3.
    expect(s.extraordinaryIncome).toEqual(at({ 2: '100' }));
    expect(s.extraordinaryLoss).toEqual(at({}));
    expect(s.depreciation).toEqual(at({ 1: '200', 2: '200' }));
    expect(s.grossProfit).toEqual(at({ 1: '250', 2: '375', 3: '500' }));
    expect(s.incomeTax).toEqual(at({ 1: '40', 2: '65', 3: '90' }));
    expect(value.cashFlow.inflows.otherIncome).toEqual(at({ 2: '700' }));
    expect(value.balanceSheet.assets.fixedInvestment).toEqual(['1200', '1000', '200', '200']);
    // Only the land and the working capital are left as residual value.
    expect(value.totalCapital.residualValue).toBe('250');
    balances(input);
  });

  it('books a sale below book value as an extraordinary loss', () => {
    const input = base({ assetSales: [{ item: 'machinery', period: 1, proceeds: '650' }] });
    const { value } = financialStatements(input);
    expect(value.incomeStatement.extraordinaryLoss).toEqual(at({ 1: '150' }));
    expect(value.incomeStatement.grossProfit).toEqual(at({ 1: '100', 2: '475', 3: '500' }));
    balances(input);
  });

  it('deducts allowances from the taxable profit; the depreciation allowance also from assets', () => {
    const input = base({
      allowances: { investment: at({ 1: '50' }), depreciation: at({ 1: '100' }) },
    });
    const { value } = financialStatements(input);
    const s = value.incomeStatement;
    expect(s.grossProfit).toEqual(at({ 1: '150', 2: '275', 3: '300' }));
    expect(s.taxableProfit).toEqual(at({ 1: '100', 2: '275', 3: '300' }));
    expect(s.incomeTax).toEqual(at({ 1: '10', 2: '45', 3: '50' }));
    expect(s.netProfit).toEqual(at({ 1: '140', 2: '230', 3: '250' }));
    const b = balances(input);
    expect(b.assets.depreciationAllowances).toEqual(['0', '100', '100', '100']);
    expect(b.assets.fixedAssets).toEqual(['1200', '900', '700', '500']);
  });

  it('does not depreciate again what a depreciation allowance has written off', () => {
    const input = base({ allowances: { investment: at({}), depreciation: at({ 1: '700' }) } });
    const { value } = financialStatements(input);
    // Book values 1 000, 800 and 600 against allowances of 700: the last 100 of year 3 are
    // already written off, so only 100 are charged there.
    expect(value.incomeStatement.depreciation).toEqual(at({ 1: '200', 2: '200', 3: '100' }));
    const b = balances(input);
    expect(b.assets.depreciationAllowances).toEqual(['0', '700', '700', '600']);
    expect(b.assets.fixedAssets).toEqual(['1200', '300', '100', '0']);
  });

  it('keeps an allowance when the asset is sold, as long as other assets cover it', () => {
    const input = base({
      allowances: { investment: at({}), depreciation: at({ 1: '300' }) },
      assetSales: [{ item: 'machinery', period: 2, proceeds: '700' }],
    });
    const { value } = financialStatements(input);
    // After the sale only the land of 200 is left: 100 of the year's charge are not booked.
    expect(value.incomeStatement.depreciation).toEqual(at({ 1: '200', 2: '100' }));
    expect(value.incomeStatement.extraordinaryIncome).toEqual(at({ 2: '100' }));
    const b = balances(input);
    expect(b.assets.fixedAssets).toEqual(['1200', '700', '0', '0']);
    // An allowance that the remaining assets cannot cover is refused where it was entered.
    fails(
      base({
        allowances: { investment: at({}), depreciation: at({ 1: '500' }) },
        assetSales: [{ item: 'machinery', period: 2, proceeds: '700' }],
      }),
      'allowance.exceedsBookValue',
      'allowances.depreciation[1]',
    );
  });

  it('carries a loss forward and shows accumulated losses in the balance sheet', () => {
    const input = base({
      allowances: { investment: at({}), depreciation: at({ 1: '400' }) },
      tax: { ...base().tax, lossCarryForwardYears: 2 },
    });
    const { value } = financialStatements(input);
    const s = value.incomeStatement;
    // Year 1: 250 − 400 = −150, no tax and no dividends; year 2: 275 − 150 = 125 taxable.
    expect(s.grossProfit).toEqual(at({ 1: '-150', 2: '275', 3: '300' }));
    expect(s.deductibleLoss).toEqual(at({ 2: '150' }));
    expect(s.taxableProfit).toEqual(at({ 1: '-150', 2: '125', 3: '300' }));
    expect(s.incomeTax).toEqual(at({ 2: '15', 3: '50' }));
    expect(s.dividends).toEqual(at({ 2: '130', 3: '125' }));
    const b = balances(input);
    expect(b.assets.accumulatedLosses).toEqual(['0', '150', '20', '0']);
    expect(b.liabilities.reserves).toEqual(['0', '0', '0', '105']);
    expect(b.netWorth).toEqual(['800', '650', '780', '905']);
  });
});

describe('financialStatements: input errors', () => {
  it('refuses invalid options with the field', () => {
    fails(base({ referenceYear: 3 }), 'horizon.outOfRange', 'referenceYear', {
      min: '0',
      max: '2',
    });
    fails(base({ breakEvenYear: -1 }), 'horizon.outOfRange', 'breakEvenYear', {
      min: '0',
      max: '2',
    });
    fails(
      base({ residualValueTiming: 'NEVER' as never }),
      'statements.residualValueTiming',
      'residualValueTiming',
    );
    fails(
      base({ discounting: { totalCapitalRate: ['0.1'], equityRate: '0.1' } }),
      'rate.pathLengthMismatch',
      'discounting.totalCapitalRate',
      { expected: '4', actual: '1' },
    );
    fails(
      base({ discounting: { totalCapitalRate: '0.1', equityRate: '-1' } }),
      'rate.notAboveMinus100',
      'discounting.equityRate',
    );
    fails(base({ tax: { ...base().tax, brackets: [] } }), 'tax.bracketsRequired', 'tax.brackets');
    fails(
      base({
        discounting: { totalCapitalRate: '0.1', equityRate: '0.1', reference: 'X' as never },
      }),
      'statements.option',
      'discounting.reference',
    );
    fails(
      base({ automaticCashCoverage: 'false' as never }),
      'statements.option',
      'automaticCashCoverage',
    );
    const twice = base();
    twice.profitDistribution.shareholders.push(twice.profitDistribution.shareholders[0]!);
    fails(twice, 'model.duplicateKey', 'profitDistribution.shareholders[1].equity');
  });

  it('refuses invalid asset sales and allowances', () => {
    const sale = (over: object) =>
      base({ assetSales: [{ item: 'machinery', period: 2, proceeds: '1', ...over }] });
    fails(sale({ item: 'nothing' }), 'assetSale.unknownItem', 'assetSales[0].item');
    fails(sale({ period: 0 }), 'assetSale.period', 'assetSales[0].period');
    fails(sale({ period: 9 }), 'assetSale.period', 'assetSales[0].period');
    fails(sale({ proceeds: '-1' }), 'amount.negative', 'assetSales[0].proceeds');
    fails(
      base({
        assetSales: [
          { item: 'land', period: 1, proceeds: '1' },
          { item: 'land', period: 2, proceeds: '1' },
        ],
      }),
      'model.duplicateKey',
      'assetSales[1].item',
    );
    fails(
      base({ allowances: { investment: at({ 0: '5' }), depreciation: at({}) } }),
      'statements.productionOnly',
      'allowances.investment[0]',
    );
    fails(
      base({ allowances: { investment: at({}), depreciation: at({ 1: '1300' }) } }),
      'allowance.exceedsBookValue',
      'allowances.depreciation[1]',
    );
  });

  it('refuses an invalid profit distribution', () => {
    const holders = (over: object, retainedShare = '0.5') =>
      base({
        profitDistribution: {
          retainedShare,
          shareholders: [{ ...base().profitDistribution.shareholders[0]!, ...over }],
        },
      });
    fails(
      holders({ equity: 'nobody' }),
      'dividends.unknownEquity',
      'profitDistribution.shareholders[0].equity',
    );
    fails(
      holders({ ordinaryShare: '0.9' }),
      'dividends.ordinaryShares',
      'profitDistribution.shareholders',
      { year: '1' },
    );
    fails(
      holders({ repatriatedShare: '1.5' }),
      'share.outOfRange',
      'profitDistribution.shareholders[0].repatriatedShare',
    );
    fails(holders({}, '1.2'), 'share.outOfRange', 'profitDistribution.retainedShare');
    // Nothing is distributed, so the shares are not needed.
    expect(() => financialStatements(holders({ ordinaryShare: '0' }, '1'))).not.toThrow();
  });
});

describe('financialStatements: a project with every feature', () => {
  // Two construction half-years from April 2027, four start-up quarters, balance in December:
  // the first production year (April–December 2028) is partial; four production years in all.
  const wide = planHorizon({
    start: { year: 2027, month: 4 },
    balanceMonth: 12,
    construction: { periods: 2, periodMonths: 6 },
    startup: { periods: 4, periodMonths: 3 },
    productionYears: 4,
  });
  const n = wide.periods.length;
  const fill = (value: string) => Array.from({ length: n }, () => value);
  const on = (values: Record<number, string>) => fill('0').map((z, j) => values[j] ?? z);
  const producing = (value: string) =>
    wide.periods.map((p) => (p.phase === 'CONSTRUCTION' ? '0' : value));
  const shared = {
    horizon: wide,
    localCurrency: 'IRR',
    exchangeRates: { USD: wide.periods.map((_, j) => String(10 + j)) },
  };
  const firstProduction = 2;
  const investments = investmentSchedule({
    ...shared,
    items: [
      {
        key: 'plant',
        group: 'MACHINERY',
        currency: 'USD',
        origin: 'FOREIGN',
        amounts: on({ 0: '300', 1: '200', 4: '50' }),
        depreciation: {
          method: 'DECLINING_BALANCE',
          lifeMonths: 72,
          salvageRate: '0.1',
          decliningRate: '0.3',
          startPeriod: firstProduction,
        },
      },
      {
        key: 'studies',
        group: 'PRE_PRODUCTION',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: on({ 0: '400' }),
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 36,
          salvageRate: '0',
          startPeriod: firstProduction,
        },
      },
    ],
  }).value;
  const finance = financingSchedule({
    ...shared,
    equity: [
      {
        key: 'founders',
        class: 'ORDINARY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: on({ 0: '3000' }),
      },
      {
        key: 'fund',
        class: 'PREFERENCE',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: on({ 1: '1000' }),
      },
      {
        key: 'partner',
        class: 'JOINT_VENTURE',
        currency: 'USD',
        origin: 'FOREIGN',
        amounts: on({ 0: '50' }),
      },
      {
        key: 'grant',
        class: 'SUBSIDY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: on({ 1: '200' }),
      },
    ],
    loans: [
      {
        key: 'supplier',
        currency: 'USD',
        origin: 'FOREIGN',
        loan: {
          type: 'ANNUITY',
          repaymentMonths: 6,
          flows: [
            { day: 180, amount: '150' },
            { day: 360, amount: '100' },
          ],
          rates: [{ fromDay: 1, rate: '0.08' }],
          capitalisedShare: '0.5',
          capitaliseUntilDay: 360,
          numberOfRepayments: 5,
          firstRepaymentDay: 720,
          fees: { agency: '0.01', commitment: '0.005' },
        },
        depreciation: { method: 'LINEAR_TO_ZERO', lifeMonths: 24, startPeriod: firstProduction },
      },
    ],
  }).value;
  const works = operationsSchedule({
    ...shared,
    products: [
      {
        key: 'steel',
        nominalCapacity: '1200',
        sales: [
          {
            key: 'home',
            market: 'LOCAL',
            currency: 'IRR',
            capacityShares: producing('0.8'),
            price: '9',
            salesTaxRate: '0.09',
            subsidyRate: '0.02',
            subsidyAmount: '0',
            receivablesCoverage: { days: '45' },
          },
          {
            key: 'abroad',
            market: 'EXPORT',
            currency: 'USD',
            capacityShares: producing('0.1'),
            price: '1',
            salesTaxRate: '0',
            subsidyRate: '0',
            subsidyAmount: '0',
            receivablesCoverage: { days: '60' },
          },
        ],
        finishedGoodsCoverage: { days: '20' },
        workInProgressCoverage: { days: '5' },
      },
    ],
    costs: [
      {
        key: 'ore',
        category: 'RAW_MATERIALS',
        product: 'steel',
        currency: 'USD',
        origin: 'FOREIGN',
        standard: {
          mode: 'AT_NOMINAL_CAPACITY',
          quantity: '1200',
          price: '0.2',
          variableShare: '1',
        },
        adjustments: {
          quantities: on({ 1: '40' }),
          prices: fill('0.2'),
          variableShares: fill('1'),
        },
        stockCoverage: { days: '30' },
        payablesCoverage: { days: '30' },
      },
      {
        key: 'wages',
        category: 'LABOUR',
        product: 'steel',
        currency: 'IRR',
        origin: 'LOCAL',
        standard: {
          mode: 'AT_NOMINAL_CAPACITY',
          quantity: '1',
          price: '2400',
          variableShare: '0.25',
        },
        payablesCoverage: none,
      },
      {
        key: 'adverts',
        category: 'DIRECT_MARKETING',
        product: 'steel',
        currency: 'IRR',
        origin: 'LOCAL',
        standard: { mode: 'PER_UNIT', quantity: '1', price: '0.3', fixedCost: '120' },
        payablesCoverage: { days: '15' },
      },
    ],
    cash: {
      localCoverage: { days: '15' },
      foreignCoverage: { days: '10' },
      depositShare: '0.4',
      depositRate: '0.12',
    },
  }).value;
  const everything = (over: Partial<StatementsInput> = {}): StatementsInput => ({
    horizon: wide,
    investment: investments,
    financing: finance,
    operations: works,
    tax: {
      brackets: [
        { lowerLimit: '0', rate: '0.15' },
        { lowerLimit: '1000', rate: '0.25' },
      ],
      holidayYears: 1,
      lossCarryForwardYears: 3,
    },
    allowances: {
      investment: on({ [firstProduction + 4]: '100' }),
      depreciation: on({ [firstProduction + 4]: '150' }),
    },
    assetSales: [{ item: 'studies', period: n - 2, proceeds: '75' }],
    profitDistribution: {
      retainedShare: ['1', '0.4', '0.4', '0.2'],
      shareholders: [
        {
          equity: 'founders',
          preferredRate: '0',
          preferredAmount: '0',
          ordinaryShare: '0.7',
          repatriatedShare: '0',
        },
        {
          equity: 'fund',
          preferredRate: '0.05',
          preferredAmount: '10',
          ordinaryShare: '0',
          repatriatedShare: '0',
        },
        {
          equity: 'partner',
          preferredRate: '0.04',
          preferredAmount: '0',
          ordinaryShare: '0.3',
          repatriatedShare: '1',
        },
      ],
    },
    discounting: { totalCapitalRate: '0.2', equityRate: '0.25' },
    referenceYear: 2,
    ...over,
  });
  const sum = (values: string[]) => values.reduce((s, v) => s.plus(v), new Decimal(0));
  const close = (actual: string, expected: string) =>
    expect(toDecimal(actual).minus(expected).abs().lt('1e-24'), `${actual} ≈ ${expected}`).toBe(
      true,
    );

  it.each([true, false])('balances in every period (automatic coverage: %s)', (coverage) => {
    const { value } = financialStatements(everything({ automaticCashCoverage: coverage }));
    const b = value.balanceSheet;
    // Quotients are rounded to 34 significant digits, so the two sides agree to the last digits.
    b.assets.total.forEach((total, j) => close(total, b.liabilities.total[j]!));
    expect(b.assets.cashSurplus).toEqual(value.cashFlow.cashBalance);
    // Net worth is what is left for the shareholders: assets less debts to third parties.
    b.netWorth.forEach((netWorth, j) =>
      close(
        netWorth,
        toDecimal(b.assets.total[j]!)
          .minus(b.assets.accumulatedLosses[j]!)
          .minus(b.assets.exchangeLosses[j]!)
          .minus(b.liabilities.currentLiabilities[j]!)
          .minus(b.liabilities.longTermDebt[j]!)
          .toFixed(),
      ),
    );
    // The exchange adjustment of the foreign loan is a balance-sheet line of its own.
    expect(sum(b.assets.exchangeLosses).gt(0)).toBe(true);
    // Capitalised interest and the interest and fees of construction are assets.
    expect(toDecimal(b.assets.preProductionInterest[1]!).gt(0)).toBe(true);
    expect(value.incomeStatement.financialCosts.slice(0, 2)).toEqual(['0', '0']);
  });

  it('books yearly tax and dividends in the period of the balance date', () => {
    const { value } = financialStatements(everything());
    // Start-up quarters end in June, September, December 2028 and March 2029: the first balance
    // date is in period 4 and the quarter to March 2029 belongs to the year 2029 (period 6).
    const balancePeriods = wide.balanceYears.map((y) => y.period);
    expect(balancePeriods).toEqual([4, 6, 7, 8]);
    const s = value.incomeStatement;
    s.incomeTax.forEach((tax, j) => {
      if (!balancePeriods.includes(j)) expect(tax).toBe('0');
    });
    s.dividends.forEach((dividend, j) => {
      if (!balancePeriods.includes(j)) expect(dividend).toBe('0');
    });
    // Tax holiday in the first year; everything is retained there, too.
    expect(value.taxYears[0]?.holiday).toBe(true);
    expect(s.incomeTax[4]).toBe('0');
    expect(s.dividends[4]).toBe('0');
    // The yearly profit is the sum of the periods of the year.
    const year2 = sum([s.grossProfit[5]!, s.grossProfit[6]!]).minus(s.investmentAllowance[6]!);
    expect(value.taxYears[1]?.profit).toBe(year2.toFixed());
    // Net profit less retained profit is what the shareholders receive.
    expect(sum(s.netProfit).minus(sum(s.retainedProfit)).toFixed()).toBe(
      sum(s.dividends).toFixed(),
    );
    const paid = value.dividends.shareholders.reduce(
      (total, h) => total.plus(sum(h.preferred)).plus(sum(h.ordinary)),
      new Decimal(0),
    );
    close(paid.toFixed(), sum(s.dividends).toFixed());
    // The partner repatriates everything, the others nothing.
    const partner = value.dividends.shareholders[2]!;
    expect(sum(partner.repatriated).toFixed()).toBe(
      sum(partner.preferred).plus(sum(partner.ordinary)).toFixed(),
    );
  });

  it('accepts a depreciation allowance that is used up by charges with endless decimals', () => {
    // Book value 5 600 at the end of the first start-up quarter; the declining-balance plant and
    // the studies over 36 months give charges that do not terminate.
    const { value } = financialStatements(
      everything({
        assetSales: [],
        allowances: { investment: on({}), depreciation: on({ 2: '5000' }) },
      }),
    );
    const b = value.balanceSheet;
    b.assets.total.forEach((total, j) => close(total, b.liabilities.total[j]!));
    b.assets.fixedAssets.forEach((fixed, j) =>
      expect(toDecimal(fixed).minus(b.assets.preProductionInterest[j]!).gt('-1e-24')).toBe(true),
    );
    // Nothing is left to depreciate once the allowance has used up the book value.
    close(value.incomeStatement.depreciation[n - 1]!, finance.interestDepreciation[n - 1]!);
    // The whole book value, and an amount whose charges leave a residue in the last digit.
    for (const allowance of ['3478', '5600']) {
      const sheet = financialStatements(
        everything({
          assetSales: [],
          allowances: { investment: on({}), depreciation: on({ 2: allowance }) },
        }),
      ).value.balanceSheet;
      sheet.assets.total.forEach((total, j) => close(total, sheet.liabilities.total[j]!));
    }
    fails(
      everything({
        assetSales: [],
        allowances: { investment: on({}), depreciation: on({ 2: '5600.000000000001' }) },
      }),
      'allowance.exceedsBookValue',
      'allowances.depreciation[2]',
    );
    fails(
      everything({
        assetSales: [],
        allowances: { investment: on({}), depreciation: on({ 2: '5601' }) },
      }),
      'allowance.exceedsBookValue',
      'allowances.depreciation[2]',
    );
  });

  it('analyses the selected break-even year as a whole', () => {
    const { value } = financialStatements(everything({ referenceYear: 1 }));
    const s = value.incomeStatement;
    // The second financial year is the quarter to March 2029 plus the rest of 2029.
    const revenue = sum([s.salesRevenue[5]!, s.salesRevenue[6]!]);
    const variable = sum([s.variableCosts[5]!, s.variableCosts[6]!]);
    const fixed = sum([s.fixedCosts[5]!, s.fixedCosts[6]!, s.depreciation[5]!, s.depreciation[6]!]);
    expect(value.breakEven.selectedYear).toBe(1);
    close(value.breakEven.selected.variableMargin, revenue.minus(variable).toFixed());
    expect(value.breakEven.selected.excludingFinance.fixedCosts).toBe(fixed.toFixed());
    // The depreciation of the year is booked in the period of the balance date only.
    expect(s.depreciation[5]).toBe('0');
  });

  it('keeps subsidies out of the equity outflow and refuses dividends on them', () => {
    const { value } = financialStatements(everything());
    expect(value.equity.outflow[1]).toBe('1000');
    expect(value.balanceSheet.liabilities.equity.SUBSIDY[n - 1]).toBe('200');
    const input = everything();
    input.profitDistribution.shareholders[1] = {
      ...input.profitDistribution.shareholders[1]!,
      equity: 'grant',
    };
    fails(input, 'dividends.subsidy', 'profitDistribution.shareholders[1].equity');
  });

  it('ties the residual values to the last balance sheet', () => {
    const { value } = financialStatements(everything());
    const b = value.balanceSheet;
    const last = n - 1;
    const netWorkingCapital = toDecimal(works.workingCapital.liquidation);
    const fixed = toDecimal(b.assets.fixedAssets[last]!);
    expect(value.equity.residualValue).toBe(
      fixed.plus(netWorkingCapital).minus(b.liabilities.longTermDebt[last]!).toFixed(),
    );
    expect(value.totalCapital.residualValue).toBe(
      fixed.minus(b.assets.preProductionInterest[last]!).plus(netWorkingCapital).toFixed(),
    );
  });
});
