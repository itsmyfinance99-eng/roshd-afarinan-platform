import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
import { EngineInputError } from '../errors';
import { projectModel, type ProjectInput } from './project';
import type { EconomicInput, EconomicLine } from './value-added';

/**
 * A steel mill with one construction year and three years of production (X.D.1, XII.A), at
 * constant prices and without stocks, so that every line can be worked out by hand. One dollar is
 * 10 NCU throughout.
 *
 * Investment in the construction year: imported machinery 900 (10 % import duty included),
 * a building 600 (half of it value added of a local contractor, and a fifth of the rest in a
 * second round), studies 300 and land 100, which is sold again for 100 in the last year. All but
 * the land is written off in the three production years: 600 a year.
 *
 * Finance: local shareholders 800, a foreign shareholder 300, a local grant 100, a foreign loan
 * of 500 at 10 % (repaid in halves in the last two years) and a local loan of 200 at 20 %.
 *
 * Each year 100 units are sold at home at 12 (plus 10 % sales tax, with a subsidy of 5 %) and 50
 * abroad at 15: a gross revenue of 2 070, of which 120 is sales tax, and a subsidy of 60.
 *
 *   cost item        a year  origin   in the value-added schedule
 *   ore                 300  local    materials; 10 % tax, 25 % value added included → 202.5
 *   spare parts         100  foreign  materials
 *   power                60  local    materials; 20 % subsidy on the input (12)
 *   factory services     50  local    materials
 *   workers             200  local    unskilled wages; 5 % tax → 190
 *   engineers           150  local    skilled wages
 *   foreign experts      80  foreign  wages; 25 % tax → 60 repatriated
 *   office staff         70  local    wages (skilled, as every wage outside the labour category)
 *   sales staff          20  local    wages
 *   licence              30  foreign  other (leasing)
 *   advertising          40  local    other
 *
 * Costs 1 100 and depreciation 600 leave, after interest of 90, 90 and 65, a profit of 220, 220
 * and 245; tax at 20 % is 44, 44 and 49. Half of the net profit is paid out — 88, 88 and 98 —
 * 70 % of it at home (5 % tax on dividends) and 30 % abroad (10 % tax).
 */
const PERIODS = 4;
const per = (values: Record<number, string>) =>
  Array.from({ length: PERIODS }, (_, j) => values[j] ?? '0');
const producing = (value: string) => per({ 1: value, 2: value, 3: value });
const none = { days: '0' };
const written = {
  method: 'LINEAR_TO_ZERO',
  lifeMonths: 36,
  salvageRate: '0',
  startPeriod: 1,
} as const;
const cost = (
  key: string,
  category: ProjectInput['operations']['costs'][number]['category'],
  origin: 'LOCAL' | 'FOREIGN',
  perYear: string,
): ProjectInput['operations']['costs'][number] => ({
  key,
  category,
  product: 'steel',
  currency: origin === 'FOREIGN' ? 'USD' : 'NCU',
  origin,
  standard: { mode: 'PER_UNIT', quantity: '0', price: '0', fixedCost: perYear },
  stockCoverage: none,
  payablesCoverage: none,
});
const loan = (rate: string, flows: { day: number; amount: string }[]) => ({
  type: 'PROFILE' as const,
  repaymentMonths: 12 as const,
  flows,
  rates: [{ fromDay: 1, rate }],
  capitalisedShare: '0',
  interestDueDay: 360,
});
const holder = (equity: string, ordinaryShare: string, repatriatedShare: string) => ({
  equity,
  preferredRate: '0',
  preferredAmount: '0',
  ordinaryShare,
  repatriatedShare,
});

const economic: EconomicInput = {
  discountRate: '0.08',
  costs: [
    { item: 'ore', taxesIncluded: '0.1', valueAddedIncluded: ['0.25'] },
    { item: 'power', taxesIncluded: '-0.2' },
    { item: 'factory-services', nature: 'MATERIALS' },
    { item: 'workers', skill: 'UNSKILLED', taxesIncluded: '0.05' },
    { item: 'engineers', skill: 'SKILLED' },
    { item: 'experts', skill: 'SKILLED', taxesIncluded: '0.25' },
    { item: 'office-staff', nature: 'WAGES' },
    { item: 'sales-staff', nature: 'WAGES' },
    { item: 'advertising', nature: 'OTHER' },
  ],
  investment: [
    { item: 'machinery', taxesIncluded: '0.1' },
    { item: 'building', valueAddedIncluded: ['0.5', '0.2'] },
  ],
  dividendTax: { local: '0.05', foreign: '0.1' },
};

const mill: ProjectInput = {
  horizon: {
    start: { year: 2027, month: 1 },
    balanceMonth: 12,
    construction: { periods: 1, periodMonths: 12 },
    startup: { periods: 0, periodMonths: 12 },
    productionYears: 3,
  },
  localCurrency: 'NCU',
  exchangeRates: { USD: per({ 0: '10', 1: '10', 2: '10', 3: '10' }) },
  investment: {
    items: [
      {
        key: 'machinery',
        group: 'MACHINERY',
        currency: 'USD',
        origin: 'FOREIGN',
        amounts: per({ 0: '90' }),
        depreciation: written,
      },
      {
        key: 'building',
        group: 'BUILDINGS',
        currency: 'NCU',
        origin: 'LOCAL',
        amounts: per({ 0: '600' }),
        depreciation: written,
      },
      {
        key: 'studies',
        group: 'PRE_PRODUCTION',
        currency: 'NCU',
        origin: 'LOCAL',
        amounts: per({ 0: '300' }),
        depreciation: written,
      },
      { key: 'land', group: 'LAND', currency: 'NCU', origin: 'LOCAL', amounts: per({ 0: '100' }) },
    ],
  },
  financing: {
    equity: [
      {
        key: 'home',
        class: 'ORDINARY',
        currency: 'NCU',
        origin: 'LOCAL',
        amounts: per({ 0: '800' }),
      },
      {
        key: 'abroad',
        class: 'ORDINARY',
        currency: 'USD',
        origin: 'FOREIGN',
        amounts: per({ 0: '30' }),
      },
      {
        key: 'grant',
        class: 'SUBSIDY',
        currency: 'NCU',
        origin: 'LOCAL',
        amounts: per({ 0: '100' }),
      },
    ],
    loans: [
      {
        key: 'export-credit',
        currency: 'USD',
        origin: 'FOREIGN',
        loan: loan('0.1', [
          { day: 360, amount: '50' },
          { day: 1080, amount: '-25' },
          { day: 1440, amount: '-25' },
        ]),
      },
      {
        key: 'bank',
        currency: 'NCU',
        origin: 'LOCAL',
        loan: loan('0.2', [
          { day: 360, amount: '200' },
          { day: 1440, amount: '-200' },
        ]),
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
            currency: 'NCU',
            quantities: producing('100'),
            price: '12',
            salesTaxRate: '0.1',
            subsidyRate: '0.05',
            subsidyAmount: '0',
            receivablesCoverage: none,
          },
          {
            key: 'export',
            market: 'EXPORT',
            currency: 'USD',
            quantities: producing('50'),
            price: '1.5',
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
        ...cost('ore', 'RAW_MATERIALS', 'LOCAL', '0'),
        standard: { mode: 'PER_UNIT', quantity: '1', price: '2', fixedCost: '0' },
      },
      cost('spare-parts', 'SPARE_PARTS', 'FOREIGN', '10'),
      cost('power', 'ENERGY', 'LOCAL', '60'),
      cost('factory-services', 'FACTORY_OVERHEADS', 'LOCAL', '50'),
      cost('workers', 'LABOUR', 'LOCAL', '200'),
      cost('engineers', 'LABOUR', 'LOCAL', '150'),
      cost('experts', 'LABOUR', 'FOREIGN', '8'),
      // An indirect cost: entered per period, and the only product takes all of it.
      {
        key: 'office-staff',
        category: 'ADMINISTRATIVE_OVERHEADS',
        currency: 'NCU',
        origin: 'LOCAL',
        adjustments: {
          quantities: producing('1'),
          prices: per({ 0: '70', 1: '70', 2: '70', 3: '70' }),
          variableShares: per({}),
        },
        payablesCoverage: none,
      },
      cost('sales-staff', 'MARKETING_OVERHEADS', 'LOCAL', '20'),
      cost('licence', 'LEASING', 'FOREIGN', '3'),
      cost('advertising', 'DIRECT_MARKETING', 'LOCAL', '40'),
    ],
    cash: { localCoverage: none, foreignCoverage: none, depositShare: '0', depositRate: '0' },
  },
  statements: {
    tax: {
      brackets: [{ lowerLimit: '0', rate: '0.2' }],
      holidayYears: 0,
      lossCarryForwardYears: 0,
    },
    assetSales: [{ item: 'land', period: 3, proceeds: '100' }],
    profitDistribution: {
      retainedShare: '0.5',
      shareholders: [holder('home', '0.7', '0'), holder('abroad', '0.3', '1')],
    },
    discounting: { totalCapitalRate: '0.1', equityRate: '0.1' },
    referenceYear: 0,
  },
  economic,
};

const withEconomic = (change: Partial<EconomicInput>): ProjectInput => ({
  ...mill,
  economic: { ...economic, ...change },
});
const withCosts = (...entries: EconomicInput['costs']): ProjectInput =>
  withEconomic({
    costs: [...economic.costs.filter((c) => !entries.some((e) => e.item === c.item)), ...entries],
  });
const fails = (
  run: () => unknown,
  code: string,
  field: string,
  params: Record<string, string> = {},
) =>
  expect(run).toThrowError(new EngineInputError(code as EngineInputError['code'], field, params));
const close = (actual: string | null | undefined, expected: Decimal | string | number) =>
  expect(
    toDecimal(actual ?? 'NaN')
      .minus(expected)
      .abs()
      .lt('1e-20'),
    `${actual} ≈ ${String(expected)}`,
  ).toBe(true);
/** Present value at 8 % with the reference at the end of the first year. */
const present = (amounts: string[], rate = '1.08', first = 0) =>
  amounts.reduce(
    (sum, a, j) => sum.plus(new Decimal(a).div(new Decimal(rate).pow(j + first))),
    new Decimal(0),
  );
const total = (amounts: string[]) => amounts.reduce((s, a) => s.plus(a), new Decimal(0));
/** The line has these values, their sum and their present value. */
const expectLine = (line: EconomicLine | undefined, expected: string[]) => {
  expect(line?.values.length).toBe(expected.length);
  expected.forEach((value, j) => close(line?.values[j], value));
  close(line?.total, total(expected));
  close(line?.presentValue, present(expected));
};

describe('value added of a project', () => {
  const { value: model, warnings } = projectModel(mill);
  const schedule = model.economic?.valueAdded;

  it('rests on the financial schedules worked out by hand', () => {
    const { statements, operations } = model;
    expect(operations.costs.sold.total.map(Number)).toEqual([0, 1100, 1100, 1100]);
    expect(statements.incomeStatement.incomeTax.map(Number)).toEqual([0, 44, 44, 49]);
    expect(statements.dividends.total.map(Number)).toEqual([0, 88, 88, 98]);
    expect(statements.cashFlow.outflows.financialCosts.map(Number)).toEqual([0, 90, 90, 65]);
    expect(statements.cashFlow.automaticOverdraft.map(Number)).toEqual([0, 0, 0, 0]);
    expect(warnings).toEqual([]);
  });

  it('deducts the material input from the value of output', () => {
    expectLine(schedule?.valueOfOutput.grossSalesRevenue, ['0', '2070', '2070', '2070']);
    expectLine(schedule?.valueOfOutput.otherIncome, ['0', '0', '0', '100']);
    expectLine(schedule?.valueOfOutput.total, ['0', '2070', '2070', '2170']);
    // Ore 300 × 0.9 × 0.75, spare parts 100, power 60 (a subsidy is not deducted), services 50.
    expectLine(schedule?.materialInput, ['0', '412.5', '412.5', '412.5']);
    expectLine(schedule?.grossDomesticValueAdded, ['0', '1657.5', '1657.5', '1757.5']);
  });

  it('deducts the investment net of taxes and of the value added included', () => {
    // Machinery 900 × 0.9, building 600 × 0.5 × 0.8, studies 300, land 100.
    expectLine(schedule?.investment.fixedAndPreProduction, ['1450', '0', '0', '0']);
    expectLine(schedule?.investment.inventoryIncrease, ['0', '0', '0', '0']);
    expectLine(schedule?.investment.total, ['1450', '0', '0', '0']);
    expectLine(schedule?.netDomesticValueAdded, ['-1450', '1657.5', '1657.5', '1757.5']);
  });

  it('deducts the payments that leave the country', () => {
    expectLine(schedule?.repatriated.wages, ['0', '60', '60', '60']);
    // 30 % of the dividends, less the tax of 10 % on them.
    expectLine(schedule?.repatriated.dividends, ['0', '23.76', '23.76', '26.46']);
    expectLine(schedule?.repatriated.interest, ['0', '50', '50', '25']);
    expectLine(schedule?.repatriated.others, ['0', '30', '30', '30']);
    expectLine(schedule?.repatriated.total, ['0', '163.76', '163.76', '141.46']);
    expectLine(schedule?.netNationalValueAdded, ['-1450', '1493.74', '1493.74', '1616.04']);
  });

  it('distributes the net national value added', () => {
    const distribution = schedule?.distribution;
    expectLine(distribution?.domesticWages, ['0', '430', '430', '430']);
    expectLine(distribution?.unskilledLabour, ['0', '190', '190', '190']);
    expectLine(distribution?.skilledLabour, ['0', '240', '240', '240']);
    // Dividends at home less 5 % tax, and the interest of the local loan.
    expectLine(distribution?.dividendsAndInterest, ['0', '98.52', '98.52', '105.17']);
    expectLine(distribution?.government, ['-10', '157.72', '157.72', '163.37']);
    expectLine(distribution?.others, ['-1440', '807.5', '807.5', '917.5']);
  });

  it('shows what the part of the government is made of', () => {
    const government = schedule?.government;
    expectLine(government?.incomeTax, ['0', '44', '44', '49']);
    expectLine(government?.salesTax, ['0', '120', '120', '120']);
    // Duty on the machinery; then ore 30, workers 10, experts 20 and the taxes on dividends.
    expectLine(government?.indirectTaxes, ['90', '65.72', '65.72', '66.37']);
    expectLine(government?.salesSubsidies, ['0', '60', '60', '60']);
    expectLine(government?.grants, ['100', '0', '0', '0']);
    expectLine(government?.inputSubsidies, ['0', '12', '12', '12']);
  });

  it('gives each part as a share of the net national value added', () => {
    const shares = schedule?.distribution.shares;
    const nnva = ['-1450', '1493.74', '1493.74', '1616.04'];
    const wages = ['0', '430', '430', '430'];
    close(shares?.domesticWages.values[1], new Decimal('430').div('1493.74'));
    close(shares?.domesticWages.values[0], 0);
    close(shares?.domesticWages.total, total(wages).div(total(nnva)));
    close(shares?.domesticWages.presentValue, present(wages).div(present(nnva)));
    close(shares?.government.values[3], new Decimal('163.37').div('1616.04'));
    close(shares?.others.values[0], new Decimal('1440').div('1450'));
    const sum = (['domesticWages', 'dividendsAndInterest', 'government', 'others'] as const).reduce(
      (s, name) => s.plus(shares?.[name].presentValue ?? 'NaN'),
      new Decimal(0),
    );
    close(sum.toString(), 1);
  });

  it('tests the efficiency at present value', () => {
    const nnva = present(['-1450', '1493.74', '1493.74', '1616.04']);
    close(schedule?.efficiency.absolute, nnva.div(present(['0', '430', '430', '430'])));
    close(schedule?.efficiency.perInvestment, nnva.div(1450));
    close(schedule?.efficiency.perSkilledLabour, nnva.div(present(['0', '240', '240', '240'])));
  });

  it('measures present values from the start of the first period when asked', () => {
    const start = projectModel({
      ...mill,
      statements: {
        ...mill.statements,
        discounting: { ...mill.statements.discounting, reference: 'START_OF_FIRST_PERIOD' },
      },
    }).value.economic?.valueAdded;
    close(
      start?.netNationalValueAdded.presentValue,
      present(['-1450', '1493.74', '1493.74', '1616.04'], '1.08', 1),
    );
  });

  it('takes a path of discount rates', () => {
    const path = projectModel(withEconomic({ discountRate: ['0.08', '0.08', '0.1', '0.1'] })).value
      .economic?.valueAdded;
    const expected = new Decimal('-1450')
      .plus(new Decimal('1493.74').div('1.08'))
      .plus(new Decimal('1493.74').div(new Decimal('1.08').times('1.1')))
      .plus(new Decimal('1616.04').div(new Decimal('1.08').times('1.1').times('1.1')));
    close(path?.netNationalValueAdded.presentValue, expected);
  });

  it('is left out when no economic analysis is asked for', () => {
    const { economic: _, ...financial } = mill;
    const plain = projectModel(financial);
    expect(plain.value.economic).toBeUndefined();
    expect(plain.value.statements).toEqual(model.statements);
  });

  it('counts an increase of the inventory as investment', () => {
    const stocked = projectModel({
      ...mill,
      operations: {
        ...mill.operations,
        costs: mill.operations.costs.map((c) =>
          c.key === 'ore' ? { ...c, stockCoverage: { days: '36' } } : c,
        ),
      },
    }).value;
    const inventory = stocked.operations.workingCapital.totals.inventory;
    // A tenth of a year's ore is kept in stock from the first year of production.
    expect(inventory.map(Number)).toEqual([0, 30, 30, 30]);
    const lines = stocked.economic?.valueAdded.investment;
    expectLine(lines?.inventoryIncrease, ['0', '30', '0', '0']);
    expectLine(lines?.total, ['1450', '30', '0', '0']);
  });

  it('warns when an efficiency test has no denominator', () => {
    const noWages = projectModel({
      ...mill,
      operations: {
        ...mill.operations,
        costs: mill.operations.costs.filter((c) => c.category !== 'LABOUR'),
      },
      economic: {
        ...economic,
        costs: [
          { item: 'factory-services', nature: 'MATERIALS' },
          { item: 'office-staff', nature: 'MATERIALS' },
          { item: 'sales-staff', nature: 'OTHER' },
          { item: 'advertising', nature: 'OTHER' },
        ],
        investment: [],
      },
    });
    const efficiency = noWages.value.economic?.valueAdded.efficiency;
    expect(efficiency?.absolute).toBeUndefined();
    expect(efficiency?.perSkilledLabour).toBeUndefined();
    expect(efficiency?.perInvestment).toBeDefined();
    expect(noWages.warnings.map((w) => w.code)).toEqual([
      'valueAdded.noDomesticWages',
      'valueAdded.noSkilledLabour',
    ]);
    const shares = noWages.value.economic?.valueAdded.distribution.shares;
    close(shares?.domesticWages.values[1], 0);
  });
});

describe('value added: adjustments and special cases', () => {
  it('takes a third round of value added and subsidies of any size on inputs', () => {
    const { value } = projectModel(
      withEconomic({
        costs: [
          ...economic.costs.filter((c) => c.item !== 'power' && c.item !== 'workers'),
          // The enterprise pays 60 for power worth 150: a subsidy of 150 % of what it pays.
          { item: 'power', taxesIncluded: '-1.5' },
          { item: 'workers', skill: 'UNSKILLED', taxesIncluded: '-0.1' },
        ],
        investment: [
          { item: 'machinery', taxesIncluded: '0.1' },
          { item: 'building', valueAddedIncluded: ['0.5', '0.2', '0.5'] },
          { item: 'studies', taxesIncluded: '-0.1' },
        ],
      }),
    );
    const schedule = value.economic?.valueAdded;
    // Machinery 810, building 600 × 0.5 × 0.8 × 0.5, studies 300 (a subsidy is not deducted), land.
    expectLine(schedule?.investment.fixedAndPreProduction, ['1330', '0', '0', '0']);
    expectLine(schedule?.materialInput, ['0', '412.5', '412.5', '412.5']);
    // Studies 30; then power 90 and workers 20 a year.
    expectLine(schedule?.government.inputSubsidies, ['30', '110', '110', '110']);
    // The workers keep their 200: the tax of 10 is gone from the indirect taxes.
    expectLine(schedule?.distribution.unskilledLabour, ['0', '200', '200', '200']);
    expectLine(schedule?.distribution.domesticWages, ['0', '440', '440', '440']);
    expectLine(schedule?.government.indirectTaxes, ['90', '55.72', '55.72', '56.37']);
    expectLine(schedule?.distribution.government, ['-40', '49.72', '49.72', '55.37']);
    expectLine(schedule?.netNationalValueAdded, ['-1330', '1493.74', '1493.74', '1616.04']);
  });

  it('does not charge a grant from abroad to the government', () => {
    const { value } = projectModel({
      ...mill,
      financing: {
        ...mill.financing,
        equity: mill.financing.equity.map((e) =>
          e.key === 'grant' ? { ...e, origin: 'FOREIGN' as const } : e,
        ),
      },
    });
    const schedule = value.economic?.valueAdded;
    expectLine(schedule?.government.grants, ['0', '0', '0', '0']);
    expectLine(schedule?.distribution.government, ['90', '157.72', '157.72', '163.37']);
  });

  it('counts interest of the construction phase once, as interest', () => {
    // The foreign loan is drawn half a year earlier: 2.5 dollars of interest fall due at the end
    // of construction and are added to the loan.
    const early = projectModel({
      ...mill,
      financing: {
        ...mill.financing,
        loans: mill.financing.loans.map((l) =>
          l.key === 'export-credit'
            ? {
                ...l,
                loan: {
                  ...l.loan,
                  flows: [
                    { day: 180, amount: '50' },
                    { day: 1080, amount: '-26.25' },
                    { day: 1440, amount: '-26.25' },
                  ],
                  capitalisedShare: '1',
                  capitaliseUntilDay: 360,
                },
              }
            : l,
        ),
      },
    }).value;
    expect(early.financing.loans[0]?.periods.map((p) => Number(p.capitalisedInterest))).toEqual([
      25, 0, 0, 0,
    ]);
    const schedule = early.economic?.valueAdded;
    // 25 capitalised, then 10 % of 525, 525 and 262.5.
    expectLine(schedule?.repatriated.interest, ['25', '52.5', '52.5', '26.25']);
    expectLine(schedule?.investment.total, ['1450', '0', '0', '0']);
  });

  it('measures the first increase of the inventory from the stock of an existing enterprise', () => {
    const expansion = projectModel({
      ...mill,
      operations: {
        ...mill.operations,
        costs: mill.operations.costs.map((c) =>
          c.key === 'ore' ? { ...c, stockCoverage: { days: '36' } } : c,
        ),
      },
      startingBalances: {
        fixedAssets: [],
        materials: [{ cost: 'ore', value: '50' }],
        workInProgress: [],
        finishedProducts: [],
        receivables: { value: '0', collectionDays: 0 },
        payables: { value: '0', paymentDays: 0 },
        cashInHand: '0',
        shortTermDeposits: '0',
        cashSurplus: '0',
        loans: [],
        equity: [],
      },
    }).value;
    const working = expansion.operations.workingCapital;
    expect(working.starting?.opening.materials).toBe('50');
    // A tenth of a year's ore (30) is needed: the stock of 50 is there before the project starts,
    // so holding it is no investment, and running it down to 30 in the first year of production
    // is a negative one.
    expect(working.totals.inventory.map(Number)).toEqual([50, 30, 30, 30]);
    expectLine(expansion.economic?.valueAdded.investment.inventoryIncrease, ['0', '-20', '0', '0']);
  });

  it('discounts periods shorter than a year by their months', () => {
    // Construction in two half-years: the land is bought in the first, the rest in the second.
    const first = <T>(values: T[], value: T) => [value, ...values];
    const later = (values: string[]) => first(values, '0');
    const written5 = { ...written, startPeriod: 2 };
    const halves: ProjectInput = {
      ...mill,
      horizon: { ...mill.horizon, construction: { periods: 2, periodMonths: 6 } },
      exchangeRates: { USD: first(mill.exchangeRates.USD ?? [], '10') },
      investment: {
        items: mill.investment.items.map((i) => ({
          ...i,
          amounts: i.key === 'land' ? ['100', '0', '0', '0', '0'] : later(i.amounts),
          ...(i.depreciation === undefined ? {} : { depreciation: written5 }),
        })),
      },
      financing: {
        equity: mill.financing.equity.map((e) => ({
          ...e,
          amounts: e.key === 'home' ? ['100', '700', '0', '0', '0'] : later(e.amounts),
        })),
        loans: mill.financing.loans,
      },
      operations: {
        ...mill.operations,
        products: mill.operations.products.map((p) => ({
          ...p,
          sales: p.sales.map((l) => ({ ...l, quantities: later(l.quantities ?? []) })),
        })),
        costs: mill.operations.costs.map((c) =>
          c.adjustments === undefined
            ? c
            : {
                ...c,
                adjustments: {
                  quantities: later(c.adjustments.quantities),
                  prices: first(c.adjustments.prices, '70'),
                  variableShares: later(c.adjustments.variableShares),
                },
              },
        ),
      },
      statements: {
        ...mill.statements,
        assetSales: [{ item: 'land', period: 4, proceeds: '100' }],
      },
    };
    const { value, warnings } = projectModel(halves);
    expect(warnings).toEqual([]);
    const nnva = value.economic?.valueAdded.netNationalValueAdded;
    const expected = ['-100', '-1350', '1493.74', '1493.74', '1616.04'];
    expected.forEach((v, j) => close(nnva?.values[j], v));
    // The reference is the end of the first year: the first half-year is half a year before it.
    const present = new Decimal('-100')
      .times(new Decimal('1.08').pow('0.5'))
      .minus(1350)
      .plus(new Decimal('1493.74').div('1.08'))
      .plus(new Decimal('1493.74').div(new Decimal('1.08').pow(2)))
      .plus(new Decimal('1616.04').div(new Decimal('1.08').pow(3)));
    close(nnva?.presentValue, present);
  });

  it('leaves out the test per unit of investment and the shares of a period without value added', () => {
    const whole = ['1'];
    const { value, warnings } = projectModel(
      withEconomic({
        investment: ['machinery', 'building', 'studies', 'land'].map((item) => ({
          item,
          valueAddedIncluded: whole,
        })),
      }),
    );
    const schedule = value.economic?.valueAdded;
    expectLine(schedule?.investment.total, ['0', '0', '0', '0']);
    expect(schedule?.efficiency.perInvestment).toBeUndefined();
    expect(schedule?.efficiency.absolute).toBeDefined();
    expect(warnings.map((w) => w.code)).toEqual(['valueAdded.noInvestment']);
    // Nothing is produced or invested in the construction year.
    expect(schedule?.distribution.shares.domesticWages.values[0]).toBeNull();
    expect(schedule?.distribution.shares.others.values[0]).toBeNull();
  });
});

describe('economic input the engine refuses', () => {
  it('needs a nature for overheads and marketing costs', () => {
    fails(
      () =>
        projectModel(
          withEconomic({ costs: economic.costs.filter((c) => c.item !== 'office-staff') }),
        ),
      'economic.natureRequired',
      'economic.costs',
      { item: 'office-staff' },
    );
    fails(
      () => projectModel(withCosts({ item: 'sales-staff' })),
      'economic.natureRequired',
      'economic.costs[8].nature',
      { item: 'sales-staff' },
    );
  });

  it('refuses a nature the category cannot have', () => {
    fails(
      () => projectModel(withCosts({ item: 'ore', nature: 'WAGES' })),
      'economic.nature',
      'economic.costs[8].nature',
    );
    fails(
      () => projectModel(withCosts({ item: 'office-staff', nature: 'OTHER' })),
      'economic.nature',
      'economic.costs[8].nature',
    );
    fails(
      () => projectModel(withCosts({ item: 'sales-staff', nature: 'MATERIALS' })),
      'economic.nature',
      'economic.costs[8].nature',
    );
    fails(
      () => projectModel(withCosts({ item: 'licence', nature: 'WAGES' })),
      'economic.nature',
      'economic.costs[9].nature',
    );
  });

  it('needs the skill of every labour item, and of wages only', () => {
    fails(
      () => projectModel(withCosts({ item: 'workers' })),
      'economic.skillRequired',
      'economic.costs[8].skill',
      { item: 'workers' },
    );
    fails(
      () =>
        projectModel(withEconomic({ costs: economic.costs.filter((c) => c.item !== 'engineers') })),
      'economic.skillRequired',
      'economic.costs',
      { item: 'engineers' },
    );
    fails(
      () => projectModel(withCosts({ item: 'workers', skill: 'MASTER' as 'SKILLED' })),
      'economic.skillRequired',
      'economic.costs[8].skill',
      { item: 'workers' },
    );
    fails(
      () => projectModel(withCosts({ item: 'ore', skill: 'SKILLED' })),
      'economic.notApplicable',
      'economic.costs[8].skill',
    );
  });

  it('refuses adjustments an item cannot have', () => {
    fails(
      () =>
        projectModel(withCosts({ item: 'workers', skill: 'SKILLED', valueAddedIncluded: ['0.1'] })),
      'economic.notApplicable',
      'economic.costs[8].valueAddedIncluded',
    );
    fails(
      () => projectModel(withCosts({ item: 'advertising', nature: 'OTHER', taxesIncluded: '0.1' })),
      'economic.notApplicable',
      'economic.costs[8].taxesIncluded',
    );
  });

  it('checks the taxes and the value added included', () => {
    fails(
      () => projectModel(withCosts({ item: 'ore', taxesIncluded: '1.01' })),
      'economic.taxesIncluded',
      'economic.costs[8].taxesIncluded',
    );
    fails(
      () =>
        projectModel(withCosts({ item: 'ore', valueAddedIncluded: ['0.1', '0.1', '0.1', '0.1'] })),
      'economic.rounds',
      'economic.costs[8].valueAddedIncluded',
    );
    fails(
      () => projectModel(withCosts({ item: 'ore', valueAddedIncluded: ['0.1', '1.2'] })),
      'share.outOfRange',
      'economic.costs[8].valueAddedIncluded[1]',
    );
    fails(
      () => projectModel(withEconomic({ investment: [{ item: 'land', taxesIncluded: '2' }] })),
      'economic.taxesIncluded',
      'economic.investment[0].taxesIncluded',
    );
  });

  it('refuses unknown and repeated items', () => {
    fails(
      () => projectModel(withCosts({ item: 'coal' })),
      'economic.unknownItem',
      'economic.costs[9].item',
    );
    fails(
      () => projectModel(withEconomic({ costs: [...economic.costs, { item: 'ore' }] })),
      'model.duplicateKey',
      'economic.costs[9].item',
    );
    fails(
      () => projectModel(withEconomic({ investment: [{ item: 'ore' }] })),
      'economic.unknownItem',
      'economic.investment[0].item',
    );
  });

  it('checks the rate of discount and the taxes on dividends', () => {
    fails(
      () => projectModel(withEconomic({ discountRate: '-1' })),
      'rate.notAboveMinus100',
      'economic.discountRate',
    );
    fails(
      () => projectModel(withEconomic({ discountRate: ['0.1'] })),
      'rate.pathLengthMismatch',
      'economic.discountRate',
      { expected: '4', actual: '1' },
    );
    fails(
      () => projectModel(withEconomic({ dividendTax: { local: '0', foreign: '1.5' } })),
      'share.outOfRange',
      'economic.dividendTax.foreign',
    );
  });
});
