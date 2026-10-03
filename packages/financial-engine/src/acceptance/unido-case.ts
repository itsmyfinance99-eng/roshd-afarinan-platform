import type { DecimalString } from '../decimal';
import type { ProjectInput } from '../model/project';

/**
 * Reference study for the acceptance test of the engine (ST-36.01): the sample case of annex I of
 * UNIDO's "Manual for the Preparation of Industrial Feasibility Studies" (W. Behrens and P. M.
 * Hawranek, newly revised and expanded edition, Vienna 1991), whose schedules X-1 to X-11 were
 * produced with COMFAR. A garment factory: two construction years (1991–1992), fifteen production
 * years (1993–2007), residual values in 2008. All amounts in thousands of national currency units.
 *
 * Only figures (inputs and results) are taken from the book; the notes on how each input was
 * read are ours.
 */

const PERIODS = 17;
const FIRST_PRODUCTION = 2;
/** Period index of a calendar year. */
const year = (calendar: number) => calendar - 1991;

/** One amount per period: zero except in the given years. */
function inYears(values: Record<number, string>): DecimalString[] {
  return Array.from({ length: PERIODS }, (_, j) => values[j + 1991] ?? '0');
}

/** Capacity utilisation: 55 %, 75 % and 90 % in the first three years, then full capacity. */
export const UTILISATION: DecimalString[] = Array.from({ length: PERIODS }, (_, j) => {
  if (j < FIRST_PRODUCTION) return '0';
  return ['0.55', '0.75', '0.9'][j - FIRST_PRODUCTION] ?? '1';
});

/** Straight-line depreciation from the start of production. */
const linear = (years: number, salvageRate = '0') => ({
  method: 'LINEAR_TO_ZERO' as const,
  lifeMonths: years * 12,
  salvageRate,
  startPeriod: FIRST_PRODUCTION,
});
const none = { days: '0' };
const days = (value: number) => ({ days: String(value) });

type Cost = ProjectInput['operations']['costs'][number];

/** A cost of the single product, stated per year at full capacity. */
function cost(
  key: string,
  category: Cost['category'],
  origin: Cost['origin'],
  amounts: { variable?: string; fixed?: string },
  coverage: { stock?: number; payables: number },
): Cost {
  return {
    key,
    category,
    product: 'garments',
    currency: 'NCU',
    origin,
    // One "unit" is the output of a year at full capacity.
    standard: {
      mode: 'PER_UNIT',
      quantity: '1',
      price: amounts.variable ?? '0',
      fixedCost: amounts.fixed ?? '0',
    },
    ...(coverage.stock === undefined ? {} : { stockCoverage: days(coverage.stock) }),
    payablesCoverage: days(coverage.payables),
  };
}

/**
 * The case as input of `projectModel`. `retainedShare` is the share of each production year's
 * net profit that stays in the project; the book pays a fixed dividend of 630 a year from 1995,
 * so the caller derives the shares from the net profit (which does not depend on them).
 */
export function unidoCase(retainedShare: DecimalString[]): ProjectInput {
  return {
    horizon: {
      start: { year: 1991, month: 1 },
      balanceMonth: 12,
      construction: { periods: 2, periodMonths: 12 },
      startup: { periods: 0, periodMonths: 12 },
      productionYears: 15,
    },
    localCurrency: 'NCU',
    exchangeRates: {},
    investment: {
      // Schedules X-1/1 and X-1/2 (foreign components) and X-2/1.
      items: [
        {
          key: 'land',
          group: 'LAND',
          currency: 'NCU',
          origin: 'LOCAL',
          amounts: inYears({ 1991: '20' }),
        },
        {
          key: 'site-local',
          group: 'SITE_PREPARATION',
          currency: 'NCU',
          origin: 'LOCAL',
          amounts: inYears({ 1991: '50' }),
          depreciation: linear(10),
        },
        {
          key: 'site-foreign',
          group: 'SITE_PREPARATION',
          currency: 'NCU',
          origin: 'FOREIGN',
          amounts: inYears({ 1992: '10' }),
          depreciation: linear(10),
        },
        // 1 000 of the locally supplied civil works is depreciated at 5 % a year.
        {
          key: 'civil-works-5pc',
          group: 'BUILDINGS',
          currency: 'NCU',
          origin: 'LOCAL',
          amounts: inYears({ 1991: '1000' }),
          depreciation: linear(20),
        },
        {
          key: 'civil-works-local',
          group: 'BUILDINGS',
          currency: 'NCU',
          origin: 'LOCAL',
          amounts: inYears({ 1992: '1800' }),
          depreciation: linear(10),
        },
        {
          key: 'civil-works-foreign',
          group: 'BUILDINGS',
          currency: 'NCU',
          origin: 'FOREIGN',
          amounts: inYears({ 1992: '100' }),
          depreciation: linear(10),
        },
        // 10 % a year down to a salvage value of 10 %: nine years of 350.
        {
          key: 'machinery-foreign',
          group: 'MACHINERY',
          currency: 'NCU',
          origin: 'FOREIGN',
          amounts: inYears({ 1991: '1000', 1992: '1500' }),
          depreciation: linear(10, '0.1'),
        },
        {
          key: 'machinery-local',
          group: 'MACHINERY',
          currency: 'NCU',
          origin: 'LOCAL',
          amounts: inYears({ 1991: '500', 1992: '500' }),
          depreciation: linear(10, '0.1'),
        },
        {
          key: 'auxiliary',
          group: 'AUXILIARY_EQUIPMENT',
          currency: 'NCU',
          origin: 'LOCAL',
          amounts: inYears({ 1992: '500' }),
          depreciation: linear(10),
        },
        {
          key: 'overheads-local',
          group: 'INCORPORATED_ASSETS',
          currency: 'NCU',
          origin: 'LOCAL',
          amounts: inYears({ 1991: '430', 1992: '120' }),
          depreciation: linear(10),
        },
        {
          key: 'overheads-foreign',
          group: 'INCORPORATED_ASSETS',
          currency: 'NCU',
          origin: 'FOREIGN',
          amounts: inYears({ 1992: '180' }),
          depreciation: linear(10),
        },
        // Replacement in the sixth production year. The book depreciates its local part only
        // (60 a year from 1999); the foreign part returns in full with the residual value.
        {
          key: 'replacement-local',
          group: 'MACHINERY',
          currency: 'NCU',
          origin: 'LOCAL',
          amounts: inYears({ 1998: '600' }),
          depreciation: linear(10),
        },
        {
          key: 'replacement-foreign',
          group: 'MACHINERY',
          currency: 'NCU',
          origin: 'FOREIGN',
          amounts: inYears({ 1998: '400' }),
        },
        {
          key: 'pre-production-local',
          group: 'PRE_PRODUCTION',
          currency: 'NCU',
          origin: 'LOCAL',
          amounts: inYears({ 1991: '250', 1992: '10' }),
          depreciation: linear(10),
        },
        {
          key: 'pre-production-foreign',
          group: 'PRE_PRODUCTION',
          currency: 'NCU',
          origin: 'FOREIGN',
          amounts: inYears({ 1991: '41', 1992: '7' }),
          depreciation: linear(10),
        },
      ],
    },
    financing: {
      // Schedules X-7/1 and X-7/2.
      equity: [
        {
          key: 'local-investor',
          class: 'ORDINARY',
          currency: 'NCU',
          origin: 'LOCAL',
          amounts: inYears({ 1991: '2250', 1992: '550' }),
        },
        {
          key: 'foreign-partner',
          class: 'ORDINARY',
          currency: 'NCU',
          origin: 'FOREIGN',
          amounts: inYears({ 1991: '350', 1992: '350' }),
        },
      ],
      // The book assumes every disbursement in the middle of its year and charges interest on
      // the mean debt (note to schedule X-7/6): day 180 of the year on the 30/360 calendar.
      // Repayment in ten half-yearly instalments from the middle of the fourth year.
      loans: [
        {
          key: 'supplier-credit',
          currency: 'NCU',
          origin: 'FOREIGN',
          loan: {
            type: 'CONSTANT_PRINCIPAL',
            repaymentMonths: 6,
            flows: [
              { day: 180, amount: '720' },
              { day: 540, amount: '1880' },
            ],
            rates: [{ fromDay: 1, rate: '0.08' }],
            capitalisedShare: '0',
            numberOfRepayments: 10,
            firstRepaymentDay: 1260,
          },
          depreciation: {
            method: 'LINEAR_TO_ZERO',
            lifeMonths: 120,
            startPeriod: FIRST_PRODUCTION,
          },
        },
        {
          key: 'local-loan',
          currency: 'NCU',
          origin: 'LOCAL',
          loan: {
            type: 'CONSTANT_PRINCIPAL',
            repaymentMonths: 6,
            flows: [
              { day: 540, amount: '2800' },
              { day: 900, amount: '200' },
            ],
            rates: [{ fromDay: 1, rate: '0.1' }],
            capitalisedShare: '0',
            numberOfRepayments: 10,
            firstRepaymentDay: 1620,
          },
          depreciation: {
            method: 'LINEAR_TO_ZERO',
            lifeMonths: 120,
            startPeriod: FIRST_PRODUCTION,
          },
        },
        // Bank overdraft of the start-up years: drawn in mid-1993, repaid at the end of 1994
        // (300) and of 1995 (100); interest 24, 48 and 12.
        {
          key: 'overdraft',
          currency: 'NCU',
          origin: 'LOCAL',
          loan: {
            type: 'PROFILE',
            repaymentMonths: 12,
            flows: [
              { day: 900, amount: '400' },
              { day: 1440, amount: '-300' },
              { day: 1800, amount: '-100' },
            ],
            rates: [{ fromDay: 1, rate: '0.12' }],
            capitalisedShare: '0',
            interestDueDay: 1080,
          },
        },
      ],
    },
    operations: {
      products: [
        {
          key: 'garments',
          sales: [
            {
              key: 'all-markets',
              market: 'LOCAL',
              currency: 'NCU',
              // One unit is a year's output at full capacity, sold for 12 500.
              quantities: UTILISATION,
              price: '12500',
              salesTaxRate: '0',
              subsidyRate: '0',
              subsidyAmount: '0',
              receivablesCoverage: days(30),
            },
          ],
          finishedGoodsCoverage: days(15),
          workInProgressCoverage: days(9),
        },
      ],
      // Schedules X-3/1 to X-3/3 (costs at full capacity; variable or fixed; foreign or local)
      // and table 9 of annex I (days of coverage). Accounts payable: 15 days on factory costs.
      costs: [
        cost(
          'raw-material-a',
          'RAW_MATERIALS',
          'FOREIGN',
          { variable: '2300' },
          { stock: 90, payables: 15 },
        ),
        cost(
          'raw-material-b',
          'RAW_MATERIALS',
          'LOCAL',
          { variable: '2150' },
          { stock: 30, payables: 15 },
        ),
        cost(
          'factory-supplies',
          'FACTORY_SUPPLIES',
          'LOCAL',
          { variable: '450' },
          { stock: 30, payables: 15 },
        ),
        cost('spare-parts', 'SPARE_PARTS', 'LOCAL', { fixed: '250' }, { stock: 180, payables: 15 }),
        cost(
          'repair-maintenance',
          'FACTORY_OVERHEADS',
          'LOCAL',
          { variable: '350' },
          { payables: 15 },
        ),
        cost('royalties', 'FACTORY_OVERHEADS', 'FOREIGN', { fixed: '30' }, { payables: 15 }),
        cost('labour', 'LABOUR', 'LOCAL', { variable: '1250' }, { payables: 15 }),
        cost(
          'factory-overheads',
          'FACTORY_OVERHEADS',
          'LOCAL',
          { fixed: '1320' },
          { payables: 15 },
        ),
        cost(
          'administration',
          'ADMINISTRATIVE_OVERHEADS',
          'LOCAL',
          { fixed: '500' },
          { payables: 0 },
        ),
        cost('direct-marketing', 'DIRECT_MARKETING', 'FOREIGN', { fixed: '70' }, { payables: 0 }),
        cost(
          'marketing-local',
          'MARKETING_OVERHEADS',
          'LOCAL',
          { variable: '150', fixed: '150' },
          { payables: 0 },
        ),
        cost(
          'marketing-foreign',
          'MARKETING_OVERHEADS',
          'FOREIGN',
          { fixed: '30' },
          { payables: 0 },
        ),
      ].map((item) =>
        // Initial stock of raw materials bought in 1992 (schedule X-4: 400, of which 250 foreign).
        item.key === 'raw-material-a' || item.key === 'raw-material-b'
          ? {
              ...item,
              adjustments: {
                quantities: inYears({ 1992: item.key === 'raw-material-a' ? '250' : '150' }),
                prices: Array.from({ length: PERIODS }, () => '1'),
                variableShares: Array.from({ length: PERIODS }, () => '1'),
              },
            }
          : item,
      ),
      cash: { localCoverage: days(15), foreignCoverage: none, depositShare: '0', depositRate: '0' },
    },
    statements: {
      tax: {
        brackets: [{ lowerLimit: '0', rate: '0.5' }],
        holidayYears: 4,
        lossCarryForwardYears: 3,
      },
      profitDistribution: {
        retainedShare,
        shareholders: [
          {
            equity: 'local-investor',
            preferredRate: '0',
            preferredAmount: '0',
            ordinaryShare: '0.8',
            repatriatedShare: '0',
          },
          {
            equity: 'foreign-partner',
            preferredRate: '0',
            preferredAmount: '0',
            ordinaryShare: '0.2',
            repatriatedShare: '1',
          },
        ],
      },
      discounting: { totalCapitalRate: '0.12', equityRate: '0.12' },
      referenceYear: year(1996) - FIRST_PRODUCTION,
    },
  };
}
