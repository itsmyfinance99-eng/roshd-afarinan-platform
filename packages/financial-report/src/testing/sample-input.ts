import type { ProjectInput } from '@roshd/financial-engine';

/**
 * A project that uses most features of the model at once (the input of the engine's
 * all-features acceptance test): inflation in two currencies, a foreign currency whose rate
 * moves, a start-up phase in quarters, two products with allocated indirect costs, the sale of an
 * asset, allowances, a foreign loan and preferred dividends. Test data only.
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

export const sampleInput: ProjectInput & { horizon: { calendar: 'GREGORIAN' } } = {
  horizon: {
    calendar: 'GREGORIAN',
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
