import type { FinancialCalculator } from '../types';

/**
 * Golden cases (ST-33.07). Every case calls one engine function with fixed input; the expected
 * values in `expected.json` come from `reference.py`, an independent implementation in Python
 * with exact rational arithmetic (docs/product/engine-golden-tests.md). The same cases run in Node
 * and in a browser, and the two outputs must be identical byte for byte.
 *
 * Amounts are in rials at realistic magnitudes (up to 10^13) to exercise the decimal precision.
 */

export type GoldenFunction = Exclude<keyof FinancialCalculator, 'modelVersion'>;

export interface GoldenCase {
  id: string;
  title: string;
  fn: GoldenFunction;
  args: unknown[];
}

/** A sample industrial project: two construction years, five production years, a salvage year. */
const PROJECT_MONTHS = [12, 12, 12, 12, 12, 12, 12, 12];
const PROJECT_FLOWS = [
  '-5200000000000',
  '-3100000000000',
  '1450000000000',
  '2380000000000',
  '2760000000000',
  '2890000000000',
  '2940000000000',
  '1200000000000',
];
const PROJECT_INVESTMENT = [
  '5200000000000',
  '3100000000000',
  '450000000000',
  '120000000000',
  '0',
  '0',
  '0',
  '-600000000000',
];

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: 'npv-textbook',
    title: 'NPV of −100, 60, 60 at 10 %, reference at the start',
    fn: 'npv',
    args: [
      { periodMonths: [12, 12, 12], amounts: ['-100', '60', '60'] },
      { annualRate: '0.1', reference: 'START_OF_FIRST_PERIOD' },
    ],
  },
  {
    id: 'npv-project',
    title: 'NPV of the sample project at 18 %, COMFAR reference (end of first year), salvage',
    fn: 'npv',
    args: [
      { periodMonths: PROJECT_MONTHS, amounts: PROJECT_FLOWS },
      { annualRate: '0.18', salvageValue: '900000000000' },
    ],
  },
  {
    id: 'npv-rate-path',
    title: 'NPV with half-year construction periods and a rate path',
    fn: 'npv',
    args: [
      {
        periodMonths: [6, 6, 12, 12, 12],
        amounts: ['-800000000', '-400000000', '450000000', '520000000', '610000000'],
      },
      { annualRate: ['0.25', '0.25', '0.22', '0.2', '0.2'], reference: 'START_OF_FIRST_PERIOD' },
    ],
  },
  {
    id: 'irr-project',
    title: 'IRR of the sample project with salvage',
    fn: 'irr',
    args: [
      { periodMonths: PROJECT_MONTHS, amounts: PROJECT_FLOWS },
      { salvageValue: '900000000000' },
    ],
  },
  {
    id: 'irr-uneven',
    title: 'IRR with quarterly construction periods',
    fn: 'irr',
    args: [
      { periodMonths: [3, 3, 3, 3, 12, 12], amounts: ['-40', '-40', '-20', '10', '60', '70'] },
    ],
  },
  {
    id: 'mirr-project',
    title: 'MIRR of the sample project, reinvestment 20 %, borrowing 15 %',
    fn: 'mirr',
    args: [
      { periodMonths: PROJECT_MONTHS, amounts: PROJECT_FLOWS },
      { reinvestmentRate: '0.2', borrowingRate: '0.15', salvageValue: '900000000000' },
    ],
  },
  {
    id: 'payback-project',
    title: 'Normal payback of the sample project',
    fn: 'paybackPeriod',
    args: [{ periodMonths: PROJECT_MONTHS, amounts: PROJECT_FLOWS }],
  },
  {
    id: 'dynamic-payback-project',
    title: 'Dynamic payback of the sample project at 12 % (at 18 % it is never reached)',
    fn: 'discountedPaybackPeriod',
    args: [{ periodMonths: PROJECT_MONTHS, amounts: PROJECT_FLOWS }, { annualRate: '0.12' }],
  },
  {
    id: 'npvr-project',
    title: 'NPV ratio of the sample project at 18 %',
    fn: 'npvRatio',
    args: [
      { periodMonths: PROJECT_MONTHS, amounts: PROJECT_FLOWS },
      PROJECT_INVESTMENT,
      { annualRate: '0.18' },
    ],
  },
  {
    id: 'bcr',
    title: 'Benefit-cost ratio at 12 %',
    fn: 'benefitCostRatio',
    args: [
      {
        periodMonths: [12, 12, 12, 12],
        benefits: ['0', '4100000000', '5200000000', '5600000000'],
        costs: ['7300000000', '2100000000', '2300000000', '2450000000'],
      },
      { annualRate: '0.12', reference: 'START_OF_FIRST_PERIOD' },
    ],
  },
  {
    id: 'break-even',
    title: 'Break-even of a production year, two products',
    fn: 'breakEven',
    args: [
      {
        salesRevenue: '6420000000000',
        variableCosts: '3870000000000',
        fixedCosts: '1130000000000',
        financialCosts: '310000000000',
        products: [
          { key: 'cathode', salesVolume: '18500', salesRevenue: '4810000000000' },
          { key: 'sulphuric-acid', salesVolume: '46000', salesRevenue: '1610000000000' },
        ],
      },
    ],
  },
  {
    id: 'product-break-even',
    title: 'Break-even of one product',
    fn: 'productBreakEven',
    args: [
      {
        salesRevenue: '4810000000000',
        salesVolume: '18500',
        variableCosts: '2950000000000',
        fixedCosts: '870000000000',
      },
    ],
  },
  {
    id: 'dscr',
    title: 'Debt-service coverage over four years',
    fn: 'debtServiceCoverage',
    args: [
      [
        { cashSurplus: '0', repayment: '0', interest: '0', otherFinancialCosts: '0' },
        {
          cashSurplus: '410000000000',
          repayment: '700000000000',
          interest: '520000000000',
          otherFinancialCosts: '12000000000',
        },
        {
          cashSurplus: '690000000000',
          repayment: '700000000000',
          interest: '390000000000',
          otherFinancialCosts: '9000000000',
        },
        {
          cashSurplus: '-35000000000',
          repayment: '700000000000',
          interest: '260000000000',
          otherFinancialCosts: '6000000000',
        },
      ],
    ],
  },
  {
    id: 'llcr',
    title: 'Loan life coverage with a rate path',
    fn: 'loanLifeCoverage',
    args: [
      {
        periodMonths: [12, 12, 12, 12],
        cashAvailable: ['1642000000000', '1789000000000', '931000000000', '2200000000000'],
        openingDebt: ['2800000000000', '2100000000000', '1400000000000', '0'],
        annualRate: ['0.18', '0.18', '0.2', '0.2'],
      },
    ],
  },
  {
    id: 'wacc',
    title: 'WACC of equity and two loans',
    fn: 'wacc',
    args: [
      {
        sources: [
          { kind: 'equity', amount: '3600000000000', cost: '0.32' },
          { kind: 'debt', amount: '2800000000000', cost: '0.18' },
          { kind: 'debt', amount: '1900000000000', cost: '0.23' },
        ],
        taxRate: '0.25',
      },
    ],
  },
  {
    id: 'depreciation-linear-scrap',
    title: 'Linear to scrap, 5 years 6 months, first year 6 months, scrap 10 %',
    fn: 'depreciationSchedule',
    args: [
      {
        method: 'LINEAR_TO_SCRAP',
        initialBookValue: '2750000000000',
        lifeMonths: 66,
        salvageRate: '0.1',
        firstYearMonths: 6,
      },
    ],
  },
  {
    id: 'depreciation-declining',
    title: 'Declining balance 30 %, 6 years, first year 9 months, scrap 5 %',
    fn: 'depreciationSchedule',
    args: [
      {
        method: 'DECLINING_BALANCE',
        initialBookValue: '1830000000000',
        lifeMonths: 72,
        salvageRate: '0.05',
        firstYearMonths: 9,
        decliningRate: '0.3',
      },
    ],
  },
  {
    id: 'depreciation-syd',
    title: 'Sum of years digits, 4 years 3 months, first year 5 months',
    fn: 'depreciationSchedule',
    args: [
      {
        method: 'SUM_OF_YEARS_DIGITS',
        initialBookValue: '960000000000',
        lifeMonths: 51,
        salvageRate: '0',
        firstYearMonths: 5,
      },
    ],
  },
  {
    id: 'depreciation-syd-salvage',
    title: 'Sum of years digits, 5 years 10 months, first year 7 months, scrap 6 %',
    fn: 'depreciationSchedule',
    args: [
      {
        method: 'SUM_OF_YEARS_DIGITS',
        initialBookValue: '1450000000000',
        lifeMonths: 70,
        salvageRate: '0.06',
        firstYearMonths: 7,
      },
    ],
  },
  {
    id: 'depreciation-linear-remainder',
    title: 'Linear to scrap, 5 years 3 months, first year 6 months: a partial last year',
    fn: 'depreciationSchedule',
    args: [
      {
        method: 'LINEAR_TO_SCRAP',
        initialBookValue: '640000000000',
        lifeMonths: 63,
        salvageRate: '0.05',
        firstYearMonths: 6,
      },
    ],
  },
  {
    id: 'depreciation-linear-zero',
    title: 'Linear to zero, 5 years 3 months, first year 6 months, stops at scrap 10 %',
    fn: 'depreciationSchedule',
    args: [
      {
        method: 'LINEAR_TO_ZERO',
        initialBookValue: '500000000000',
        lifeMonths: 63,
        salvageRate: '0.1',
        firstYearMonths: 6,
      },
    ],
  },
  {
    id: 'escalation',
    title: 'Current-price factors: inflation path, escalation 3 %, first-year escalator 2',
    fn: 'priceEscalationFactors',
    args: [
      {
        inflation: ['0.35', '0.32', '0.3', '0.28', '0.25'],
        escalation: '0.03',
        firstYearEscalator: 2,
      },
    ],
  },
  {
    id: 'exchange-rates',
    title: 'Exchange-rate path from relative inflation',
    fn: 'derivedExchangeRates',
    args: [
      {
        initialRate: '615000',
        localInflation: ['0.35', '0.32', '0.3', '0.28', '0.25'],
        foreignInflation: ['0.03', '0.025', '0.025', '0.02', '0.02'],
      },
    ],
  },
  {
    id: 'loan-annuity',
    title: 'Annuity loan: quarterly, rate path, interest capitalised during construction, fees',
    fn: 'loanSchedule',
    args: [
      {
        type: 'ANNUITY',
        repaymentMonths: 3,
        flows: [
          { day: 75, amount: '1200000000000' },
          { day: 250, amount: '900000000000' },
          { day: 410, amount: '700000000000' },
        ],
        rates: [
          { fromDay: 1, rate: '0.18' },
          { fromDay: 541, rate: '0.2' },
        ],
        capitalisedShare: '1',
        capitaliseUntilDay: 630,
        numberOfRepayments: 12,
        constructionEndDay: 720,
        fees: { agency: '0.002', commitment: '0.005', other: '0.01' },
      },
    ],
  },
  {
    id: 'loan-constant-principal',
    title: 'Constant principal loan: half-yearly, half of the interest capitalised',
    fn: 'loanSchedule',
    args: [
      {
        type: 'CONSTANT_PRINCIPAL',
        repaymentMonths: 6,
        flows: [
          { day: 45, amount: '850000000000' },
          { day: 300, amount: '650000000000' },
        ],
        rates: [{ fromDay: 1, rate: '0.23' }],
        capitalisedShare: '0.5',
        capitaliseUntilDay: 540,
        numberOfRepayments: 8,
        firstRepaymentDay: 900,
        fees: { guarantee: '0.01' },
      },
    ],
  },
  {
    id: 'loan-profile',
    title: 'Profile loan: yearly interest in month 6, irregular repayments',
    fn: 'loanSchedule',
    args: [
      {
        type: 'PROFILE',
        repaymentMonths: 12,
        flows: [
          { day: 20, amount: '500000000000' },
          { day: 200, amount: '300000000000' },
          { day: 610, amount: '-250000000000' },
          { day: 905, amount: '-300000000000' },
          { day: 1290, amount: '-250000000000' },
        ],
        rates: [
          { fromDay: 1, rate: '0.2' },
          { fromDay: 721, rate: '0.24' },
        ],
        capitalisedShare: '0',
        interestDueDay: 180,
        horizonEndDay: 1440,
      },
    ],
  },
];
