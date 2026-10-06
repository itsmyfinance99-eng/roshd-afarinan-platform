import { Decimal } from '../decimal';
import type { EconomicInput } from '../model/economic';
import type { ProjectInput } from '../model/project';

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
export const PERIODS = 4;
export const per = (values: Record<number, string>) =>
  Array.from({ length: PERIODS }, (_, j) => values[j] ?? '0');
export const producing = (value: string) => per({ 1: value, 2: value, 3: value });
export const none = { days: '0' };
export const written = {
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

export const economic: EconomicInput = {
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

export const mill: ProjectInput = {
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

export const withEconomic = (change: Partial<EconomicInput>): ProjectInput => ({
  ...mill,
  economic: { ...economic, ...change },
});
export const withCosts = (...entries: EconomicInput['costs']): ProjectInput =>
  withEconomic({
    costs: [...economic.costs.filter((c) => !entries.some((e) => e.item === c.item)), ...entries],
  });

/** Present value at 8 % with the reference at the end of the first year. */
export const present = (amounts: string[], rate = '1.08', first = 0) =>
  amounts.reduce(
    (sum, a, j) => sum.plus(new Decimal(a).div(new Decimal(rate).pow(j + first))),
    new Decimal(0),
  );
export const total = (amounts: string[]) => amounts.reduce((s, a) => s.plus(a), new Decimal(0));
