import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
import { projectModel, type ProjectInput } from '../model/project';

/**
 * A project that uses the features the UNIDO sample case does not (ST-36.01): inflation in two
 * currencies with item escalation, a foreign currency whose rate moves, declining-balance
 * depreciation, a start-up phase in quarters, two products with allocated indirect costs, the
 * sale of an asset, allowances, capitalised interest on a foreign loan and preferred dividends.
 *
 * No published COMFAR result exists for it, so this is not a comparison with COMFAR. It checks
 * that the engine stays consistent with itself when everything is combined: the balance sheet
 * balances, cash ties to the cash flow, allocations add up, debt is restated at the period's
 * rate, and the indicators agree with the flows they are computed from.
 */

// Two construction years (1991–1992), four start-up quarters in 1993, then 1994–1997.
// Periods: 0, 1 construction; 2–5 quarters; 6–9 years. Seven project years.
const PERIODS = 10;
const YEARS = 7;
const per = (values: Record<number, string>) =>
  Array.from({ length: PERIODS }, (_, j) => values[j] ?? '0');
const all = (value: string, n = PERIODS) => Array.from({ length: n }, () => value);
const producing = (quarter: string, year: string) =>
  Array.from({ length: PERIODS }, (_, j) => (j < 2 ? '0' : j < 6 ? quarter : year));
const none = { days: '0' };
const days = (value: number) => ({ days: String(value) });
const priced = { escalation: '0', firstYearEscalator: 0 };

const input: ProjectInput = {
  horizon: {
    start: { year: 1991, month: 1 },
    balanceMonth: 12,
    construction: { periods: 2, periodMonths: 12 },
    startup: { periods: 4, periodMonths: 3 },
    productionYears: 5,
  },
  localCurrency: 'NCU',
  // The local currency loses about 15 % a year against the dollar.
  exchangeRates: { USD: ['100', '115', '120', '124', '128', '132', '152', '175', '201', '231'] },
  inflation: { NCU: all('0.2', YEARS), USD: all('0.03', YEARS) },
  investment: {
    items: [
      {
        key: 'land',
        group: 'LAND',
        currency: 'NCU',
        origin: 'LOCAL',
        amounts: per({ 0: '50000' }),
        ...priced,
      },
      {
        key: 'building',
        group: 'BUILDINGS',
        currency: 'NCU',
        origin: 'LOCAL',
        amounts: per({ 0: '200000', 1: '100000' }),
        escalation: '0.02',
        firstYearEscalator: 0,
        depreciation: {
          method: 'LINEAR_TO_SCRAP',
          lifeMonths: 240,
          salvageRate: '0.2',
          startPeriod: 2,
        },
      },
      {
        key: 'machinery',
        group: 'MACHINERY',
        currency: 'USD',
        origin: 'FOREIGN',
        amounts: per({ 0: '1500', 1: '2500' }),
        ...priced,
        depreciation: {
          method: 'DECLINING_BALANCE',
          lifeMonths: 96,
          salvageRate: '0.1',
          decliningRate: '0.3',
          startPeriod: 2,
        },
      },
      {
        key: 'vehicles',
        group: 'AUXILIARY_EQUIPMENT',
        currency: 'NCU',
        origin: 'LOCAL',
        amounts: per({ 1: '40000' }),
        ...priced,
        depreciation: {
          method: 'SUM_OF_YEARS_DIGITS',
          lifeMonths: 60,
          salvageRate: '0',
          startPeriod: 2,
        },
      },
      {
        key: 'studies',
        group: 'PRE_PRODUCTION',
        currency: 'NCU',
        origin: 'LOCAL',
        amounts: per({ 0: '20000' }),
        ...priced,
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 36,
          salvageRate: '0',
          startPeriod: 2,
        },
      },
    ],
  },
  financing: {
    equity: [
      {
        key: 'founders',
        class: 'ORDINARY',
        currency: 'NCU',
        origin: 'LOCAL',
        amounts: per({ 0: '300000', 1: '250000' }),
      },
      {
        key: 'fund',
        class: 'PREFERENCE',
        currency: 'NCU',
        origin: 'LOCAL',
        amounts: per({ 1: '100000' }),
      },
      {
        key: 'partner',
        class: 'JOINT_VENTURE',
        currency: 'USD',
        origin: 'FOREIGN',
        amounts: per({ 0: '800' }),
      },
    ],
    loans: [
      {
        key: 'export-credit',
        currency: 'USD',
        origin: 'FOREIGN',
        loan: {
          type: 'ANNUITY',
          repaymentMonths: 6,
          flows: [
            { day: 180, amount: '1000' },
            { day: 540, amount: '1500' },
          ],
          rates: [{ fromDay: 1, rate: '0.07' }],
          capitalisedShare: '1',
          capitaliseUntilDay: 720,
          numberOfRepayments: 8,
          firstRepaymentDay: 1080,
          fees: { agency: '0.01' },
        },
        depreciation: { method: 'LINEAR_TO_ZERO', lifeMonths: 60, startPeriod: 2 },
      },
    ],
  },
  operations: {
    products: [
      {
        key: 'fabric',
        nominalCapacity: '10000',
        sales: [
          {
            key: 'home',
            market: 'LOCAL',
            currency: 'NCU',
            capacityShares: producing('0.4', '0.7'),
            price: '60',
            ...priced,
            salesTaxRate: '0.09',
            subsidyRate: '0',
            subsidyAmount: '0',
            receivablesCoverage: days(45),
          },
          {
            key: 'export',
            market: 'EXPORT',
            currency: 'USD',
            capacityShares: producing('0.1', '0.2'),
            price: '0.5',
            ...priced,
            salesTaxRate: '0',
            subsidyRate: '0.03',
            subsidyAmount: '0',
            receivablesCoverage: days(60),
          },
        ],
        finishedGoodsCoverage: days(20),
        workInProgressCoverage: days(5),
      },
      {
        key: 'garments',
        nominalCapacity: '2000',
        production: { firstPeriod: 4, lastPeriod: 9 },
        sales: [
          {
            key: 'shops',
            market: 'LOCAL',
            currency: 'NCU',
            capacityShares: per({ 4: '0.3', 5: '0.5', 6: '0.8', 7: '0.9', 8: '0.9', 9: '0.9' }),
            price: '150',
            escalation: '-0.03',
            firstYearEscalator: 0,
            salesTaxRate: '0.09',
            subsidyRate: '0',
            subsidyAmount: '0',
            receivablesCoverage: days(30),
          },
        ],
        finishedGoodsCoverage: days(10),
        workInProgressCoverage: none,
      },
    ],
    costs: [
      {
        key: 'yarn',
        category: 'RAW_MATERIALS',
        product: 'fabric',
        currency: 'USD',
        origin: 'FOREIGN',
        ...priced,
        standard: {
          mode: 'AT_NOMINAL_CAPACITY',
          quantity: '10000',
          price: '0.12',
          variableShare: '1',
        },
        stockCoverage: days(60),
        payablesCoverage: days(30),
      },
      {
        key: 'cloth',
        category: 'RAW_MATERIALS',
        product: 'garments',
        currency: 'NCU',
        origin: 'LOCAL',
        ...priced,
        standard: { mode: 'PER_UNIT', quantity: '2', price: '25', fixedCost: '0' },
        stockCoverage: days(30),
        payablesCoverage: days(15),
      },
      {
        key: 'labour-fabric',
        category: 'LABOUR',
        product: 'fabric',
        currency: 'NCU',
        origin: 'LOCAL',
        escalation: '0.02',
        firstYearEscalator: 0,
        standard: {
          mode: 'AT_NOMINAL_CAPACITY',
          quantity: '1',
          price: '120000',
          variableShare: '0.4',
        },
        payablesCoverage: none,
      },
      {
        key: 'labour-garments',
        category: 'LABOUR',
        product: 'garments',
        currency: 'NCU',
        origin: 'LOCAL',
        escalation: '0.02',
        firstYearEscalator: 0,
        standard: { mode: 'PER_UNIT', quantity: '1', price: '30', fixedCost: '10000' },
        payablesCoverage: none,
      },
      // Indirect costs, entered as amounts per period at the prices of the start of the horizon.
      {
        key: 'energy',
        category: 'ENERGY',
        currency: 'NCU',
        origin: 'LOCAL',
        ...priced,
        adjustments: {
          quantities: producing('1', '4'),
          prices: all('6000'),
          variableShares: all('0.5'),
        },
        costCentre: 'boiler',
        allocation: { key: 'DIRECT_COST' },
        stockCoverage: none,
        payablesCoverage: days(30),
      },
      {
        key: 'administration',
        category: 'ADMINISTRATIVE_OVERHEADS',
        currency: 'NCU',
        origin: 'LOCAL',
        ...priced,
        adjustments: {
          quantities: producing('1', '4'),
          prices: all('9000'),
          variableShares: all('0'),
        },
        allocation: { key: 'SHARES', shares: { fabric: '0.75', garments: '0.25' } },
        payablesCoverage: none,
      },
      {
        key: 'marketing',
        category: 'MARKETING_OVERHEADS',
        currency: 'NCU',
        origin: 'LOCAL',
        ...priced,
        adjustments: {
          quantities: producing('1', '4'),
          prices: all('5000'),
          variableShares: all('0.2'),
        },
        allocation: { key: 'SALES' },
        payablesCoverage: none,
      },
    ],
    costCentres: [{ key: 'boiler', group: 'SERVICES' }],
    cash: {
      localCoverage: days(15),
      foreignCoverage: days(10),
      depositShare: '0.5',
      depositRate: '0.18',
    },
  },
  statements: {
    tax: {
      brackets: [
        { lowerLimit: '0', rate: '0.15' },
        { lowerLimit: '100000', rate: '0.25' },
      ],
      holidayYears: 1,
      lossCarryForwardYears: 3,
    },
    allowances: { investment: per({ 6: '20000' }), depreciation: per({ 6: '15000' }) },
    assetSales: [{ item: 'vehicles', period: 7, proceeds: '30000' }],
    profitDistribution: {
      retainedShare: ['1', '0.5', '0.5', '0.4', '0.4'],
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
          preferredRate: '0.12',
          preferredAmount: '0',
          ordinaryShare: '0',
          repatriatedShare: '0',
        },
        {
          equity: 'partner',
          preferredRate: '0.05',
          preferredAmount: '0',
          ordinaryShare: '0.3',
          repatriatedShare: '1',
        },
      ],
    },
    discounting: { totalCapitalRate: '0.3', equityRate: '0.35' },
    referenceYear: 2,
  },
};

const sum = (values: string[]) => values.reduce((s, v) => s.plus(v), new Decimal(0));
const close = (actual: string | Decimal, expected: string | Decimal, label: string) =>
  expect(
    toDecimal(String(actual))
      .minus(toDecimal(String(expected)))
      .abs()
      .lt('1e-18'),
    `${label}: ${String(actual)} vs ${String(expected)}`,
  ).toBe(true);

describe('all features together', () => {
  const { value, warnings } = projectModel(input);
  const { statements, operations, investment, financing } = value;
  const sheet = statements.balanceSheet;

  it('has the expected periods and warnings', () => {
    expect(value.horizon.periods.map((p) => p.months)).toEqual([
      12, 12, 3, 3, 3, 3, 12, 12, 12, 12,
    ]);
    // The plan is short of cash in two periods (covered by the labelled overdraft), and at the
    // discount rates entered the NPV is negative, so the dynamic payback is never reached.
    expect(warnings).toEqual([
      { code: 'cash.underFinanced', params: { periods: '3، 6' } },
      { code: 'dynamicPayback.notReached', params: { basis: 'totalCapital' } },
      { code: 'dynamicPayback.notReached', params: { basis: 'equity' } },
    ]);
    expect(statements.totalCapital.payback?.period).toBe(7);
    expect(statements.totalCapital.dynamicPayback).toBeUndefined();
    expect(toDecimal(statements.totalCapital.npv).isNegative()).toBe(true);
  });

  it('balances in every period and ties cash to the cash flow', () => {
    sheet.assets.total.forEach((total, j) =>
      close(total, sheet.liabilities.total[j]!, `period ${j}`),
    );
    // Cash is what the cash flow leaves: inflows less outflows, plus the labelled automatic
    // overdraft (drawn and repaid) and automatic equity, accumulated period by period.
    const flow = statements.cashFlow;
    let cash = new Decimal(0);
    flow.cashBalance.forEach((balance, j) => {
      cash = cash
        .plus(flow.inflows.total[j]!)
        .minus(flow.outflows.total[j]!)
        .plus(flow.automaticOverdraft[j]!)
        .plus(flow.automaticEquity[j]!);
      close(balance, cash, `cash at the end of period ${j}`);
      close(sheet.assets.cashSurplus[j]!, cash, `cash in the balance sheet of period ${j}`);
    });
    // The overdraft is drawn in the two periods of the warning and repaid by the end.
    expect(toDecimal(flow.automaticOverdraft[2]!).gt(0)).toBe(true);
    expect(toDecimal(flow.automaticOverdraft[5]!).gt(0)).toBe(true);
    close(sum(flow.automaticOverdraft), '0', 'overdraft repaid');
  });

  it('prices investment with inflation, escalation and the exchange rate of the period', () => {
    // 1 500 USD in 1991: × 1.03 (dollar inflation of the first year) × 100.
    close(
      investment.items[2]!.amounts[0]!,
      new Decimal(1500).times('1.03').times(100),
      'machinery 1991',
    );
    // 2 500 USD in 1992: × 1.03² × 115.
    close(
      investment.items[2]!.amounts[1]!,
      new Decimal(2500).times('1.0609').times(115),
      'machinery 1992',
    );
    // Building: local inflation 20 % plus 2 % escalation a year.
    close(
      investment.items[1]!.amounts[1]!,
      new Decimal(100000).times('1.2').times('1.22'),
      'building 1992',
    );
  });

  it('charges a year of depreciation at the balance date of a start-up year', () => {
    const charge = statements.incomeStatement.depreciation;
    // Quarters 1–3 of 1993 carry none; the fourth holds the year's charge.
    expect(charge.slice(2, 5)).toEqual(['0', '0', '0']);
    expect(toDecimal(charge[5]!).gt(0)).toBe(true);
    // Declining balance at 30 % on the machinery in its first year (book value before salvage).
    const machinery = investment.items[2]!;
    const cost = sum(machinery.amounts);
    close(machinery.depreciation[5]!, cost.times('0.3'), 'machinery first year');
    // Never below the salvage value.
    expect(toDecimal(machinery.bookValue[9]!).gte(cost.times('0.1'))).toBe(true);
    // Sum of the years' digits on the vehicles (57 600 over five years): 5/15, 4/15, … 1/15.
    expect(investment.items[3]!.depreciation.slice(5)).toEqual([
      '19200',
      '15360',
      '11520',
      '7680',
      '3840',
    ]);
  });

  it('allocates every indirect cost to the products without a remainder', () => {
    const produced = operations.costs.produced.total;
    const byProduct = operations.products.map((p) => p.costs.produced.total);
    produced.forEach((total, j) =>
      close(sum(byProduct.map((row) => row[j]!)), total, `allocation in period ${j}`),
    );
    // Administration: three quarters to fabric by the user's shares (fourth quarter of 1993).
    const admin = operations.costs.items.find((i) => i.key === 'administration')!;
    const fabric = operations.products[0]!.costs.produced.categories.ADMINISTRATIVE_OVERHEADS;
    close(fabric[5]!, toDecimal(admin.total[5]!).times('0.75'), 'administration to fabric');
    // Garments are not produced in the first two quarters: they carry nothing by direct cost.
    expect(operations.products[1]!.costs.produced.categories.ENERGY.slice(2, 4)).toEqual([
      '0',
      '0',
    ]);
  });

  it('restates the foreign loan at the rate of each period and books the difference', () => {
    const loan = financing.loans[0]!;
    // Capitalised interest of construction raises the debt above the 2 500 USD drawn.
    expect(toDecimal(loan.periods[1]!.endingBalance).gt(new Decimal(2500).times(115))).toBe(true);
    loan.periods.forEach((p, j) =>
      close(
        toDecimal(p.beginningBalance)
          .plus(p.disbursement)
          .minus(p.repayment)
          .plus(p.capitalisedInterest)
          .plus(p.exchangeAdjustment),
        p.endingBalance,
        `loan period ${j}`,
      ),
    );
    expect(sum(loan.periods.map((p) => p.exchangeAdjustment)).gt(0)).toBe(true);
    // 1 000 USD drawn at 100 with a fee of 1 % and 35 USD of interest capitalised.
    expect(loan.periods[0]).toMatchObject({ fees: '1000', endingBalance: '103500' });
    // The 1 035 USD owed are worth 15 more each at the rate of 1992 (115).
    expect(loan.periods[1]?.exchangeAdjustment).toBe('15525');
    // Nothing moves in the first quarter of 1993: the debt in USD is restated from 115 to 120.
    close(
      loan.periods[2]!.endingBalance,
      toDecimal(loan.periods[1]!.endingBalance).div(115).times(120),
      'debt at the rate of the first quarter',
    );
    expect(loan.periods[2]?.endingBalance).toBe('319346.145');
    // Repaid in full within the horizon.
    expect(loan.periods[9]!.endingBalance).toBe('0');
    expect(sum(sheet.assets.exchangeLosses).gt(0)).toBe(true);
  });

  it('books the sale of the vehicles and stops depreciating them', () => {
    const vehicles = investment.items[3]!;
    const book = toDecimal(vehicles.bookValue[7]!);
    const result = new Decimal(30000).minus(book);
    const income = statements.incomeStatement;
    close(
      toDecimal(income.extraordinaryIncome[7]!).minus(income.extraordinaryLoss[7]!),
      result,
      'result of the sale',
    );
    expect(statements.cashFlow.inflows.otherIncome[7]).toBe('30000');
    // The schedule of the item itself goes on; the statements drop it after the sale.
    const others = investment.items.filter((i) => i.key !== 'vehicles');
    const expected = sum(others.map((i) => i.depreciation[8]!)).plus(
      financing.interestDepreciation[8]!,
    );
    close(income.depreciation[8]!, expected, 'depreciation after the sale');
  });

  it('applies allowances, the tax holiday, the loss carried forward and the brackets', () => {
    const income = statements.incomeStatement;
    const [first, second, ...later] = statements.taxYears;
    // 1993 is a loss inside the holiday; the loss is carried to 1994.
    expect(first?.holiday).toBe(true);
    expect(first?.tax).toBe('0');
    expect(toDecimal(first!.profit).isNegative()).toBe(true);
    // 1994: the depreciation allowance is inside the gross profit, the investment allowance is
    // deducted from it, and so is the loss of 1993.
    expect(income.depreciationAllowance[6]).toBe('15000');
    expect(income.investmentAllowance[6]).toBe('20000');
    close(second!.profit, toDecimal(income.grossProfit[6]!).minus(20000), 'profit of 1994');
    close(second!.deductibleLoss, toDecimal(first!.profit).neg(), 'loss brought forward');
    close(
      second!.taxableProfit,
      toDecimal(second!.profit).minus(second!.deductibleLoss),
      'taxable profit of 1994',
    );
    later.forEach((year) => expect(year.deductibleLoss).toBe('0'));
    // 15 % up to 100 000 and 25 % above it; every year after the holiday is above the limit.
    [second!, ...later].forEach((year) => {
      const taxable = toDecimal(year.taxableProfit);
      expect(year.holiday).toBe(false);
      expect(taxable.gt(100000)).toBe(true);
      close(year.tax, new Decimal(15000).plus(taxable.minus(100000).times('0.25')), 'tax');
    });
    // Interest on short-term deposits is income of every production period.
    income.depositInterest.slice(2).forEach((v) => expect(toDecimal(v).gt(0)).toBe(true));
  });

  it('pays preferred dividends first and shares the rest by the ordinary shares', () => {
    const income = statements.incomeStatement;
    const [founders, fund, partner] = statements.dividends.shareholders;
    expect([founders?.equity, fund?.equity, partner?.equity]).toEqual([
      'founders',
      'fund',
      'partner',
    ]);
    // The fund holds preference capital only: 12 % of 100 000; the partner 5 % of 80 000.
    expect(fund?.preferred.slice(6)).toEqual(['12000', '12000', '12000', '12000']);
    expect(partner?.preferred.slice(6)).toEqual(['4000', '4000', '4000', '4000']);
    expect(sum(founders!.preferred).isZero()).toBe(true);
    expect(sum(fund!.ordinary).isZero()).toBe(true);
    for (let j = 6; j < PERIODS; j += 1) {
      // What is left after the preferred dividends: 70 % to the founders, 30 % to the partner.
      const rest = toDecimal(income.dividends[j]!).minus(16000);
      close(founders!.ordinary[j]!, rest.times('0.7'), `founders in period ${j}`);
      close(partner!.ordinary[j]!, rest.times('0.3'), `partner in period ${j}`);
    }
    // Nothing is paid for the loss of 1993.
    expect(sum(income.dividends.slice(0, 6)).isZero()).toBe(true);
  });

  it('gives indicators that agree with their own flows', () => {
    const flow = statements.totalCapital;
    // NPV = sum of the present values; NPV at the IRR is zero.
    close(flow.npv, sum(flow.presentValue), 'npv');
    expect(flow.irr).toBeDefined();
    {
      const months = [...value.horizon.periods.map((p) => p.months), 12];
      let elapsed = 0;
      const atIrr = flow.net.reduce((total, amount, j) => {
        elapsed += months[j]!;
        return total.plus(
          toDecimal(amount).div(toDecimal(flow.irr!).plus(1).pow(new Decimal(elapsed).div(12))),
        );
      }, new Decimal(0));
      const scale = flow.net.reduce((s, a) => s.plus(toDecimal(a).abs()), new Decimal(0));
      expect(atIrr.abs().div(scale).lt('1e-9'), `NPV at IRR: ${atIrr.toFixed(6)}`).toBe(true);
    }
    // The residual value of the equity is the last balance sheet without cash.
    const last = 9;
    close(
      statements.equity.residualValue,
      toDecimal(sheet.assets.fixedAssets[last]!)
        .plus(operations.workingCapital.liquidation)
        .minus(sheet.liabilities.longTermDebt[last]!),
      'equity residual value',
    );
  });
});
