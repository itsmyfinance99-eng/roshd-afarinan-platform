/**
 * A small complete model (test data only), shared by the suites that calculate one.
 * One construction year and three production years. Machinery 1 000 (200 a year) and land 200;
 * equity 800 and a loan of 500 at 10 %; 100 units a year at 10, ore 4 a unit, office 100 a year;
 * tax 10 % up to 100 and 20 % above. NPV of the total capital at 10 %: 330.8107 (hand-computed in
 * the engine's tests).
 */
const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
export const modelInputs = {
  horizon: {
    calendar: 'GREGORIAN',
    start: { year: 2027, month: 1 },
    balanceMonth: 12,
    construction: { periods: 1, periodMonths: 12 },
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
        amounts: at({ 0: '۱٬۰۰۰' }),
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 60,
          salvageRate: '0',
          startPeriod: 1,
        },
      },
      { key: 'land', group: 'LAND', currency: 'IRR', origin: 'LOCAL', amounts: at({ 0: '200' }) },
    ],
  },
  financing: {
    equity: [
      {
        key: 'founders',
        class: 'ORDINARY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '800' }),
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
            quantities: at({ 1: '100', 2: '100', 3: '100' }),
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
  },
  statements: {
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
          repatriatedShare: '0',
        },
      ],
    },
    discounting: { totalCapitalRate: '0.1', equityRate: '0.1' },
    referenceYear: 1,
  },
};
