import {
  ALLOCATION_KEYS,
  COST_CATEGORIES,
  COST_CENTRE_GROUPS,
  EQUITY_CLASSES,
  INVESTMENT_GROUPS,
  projectModel,
  type DepreciationMethod,
  type ProjectInput,
} from '@roshd/financial-engine';
import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_KEY_VALUES,
  COST_CATEGORY_VALUES,
  COST_CENTRE_GROUP_VALUES,
  DEPRECIATION_METHOD_VALUES,
  EQUITY_CLASS_VALUES,
  INVESTMENT_GROUP_VALUES,
  createFinancialModelSchema,
  projectInputSchema,
  updateFinancialModelSchema,
} from './financial-model-input';

const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
const input = {
  horizon: {
    calendar: 'SOLAR_HIJRI',
    start: { year: 1406, month: 1 },
    balanceMonth: 12,
    construction: { periods: 1, periodMonths: 12 },
    startup: { periods: 0, periodMonths: 12 },
    productionYears: 3,
  },
  localCurrency: 'irr',
  exchangeRates: { USD: ['600000', '600000', '600000', '600000'] },
  investment: {
    items: [
      {
        key: 'machinery',
        group: 'MACHINERY',
        currency: 'USD',
        origin: 'FOREIGN',
        amounts: at({ 0: '۱٬۰۰۰' }),
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 60,
          salvageRate: '۰٫۱',
          startPeriod: 1,
        },
      },
    ],
  },
  financing: {
    equity: [
      {
        key: 'founders',
        class: 'ORDINARY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '700000000' }),
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
            quantities: at({ 1: '100', 2: '100', 3: '100' }),
            price: '10000000',
            salesTaxRate: '0',
            subsidyRate: '0',
            subsidyAmount: '0',
            receivablesCoverage: { shareOfYear: '0.1' },
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
        standard: { mode: 'PER_UNIT', quantity: '1', price: '4000000', fixedCost: '0' },
        stockCoverage: none,
        payablesCoverage: none,
      },
    ],
    cash: { localCoverage: none, foreignCoverage: none, depositShare: '0', depositRate: '0' },
  },
  statements: {
    tax: {
      brackets: [{ lowerLimit: '0', rate: '0.25' }],
      holidayYears: 0,
      lossCarryForwardYears: 3,
    },
    profitDistribution: { retainedShare: '1', shareholders: [] },
    discounting: { totalCapitalRate: '0.2', equityRate: ['0.25', '0.25', '0.25', '0.25'] },
    referenceYear: 0,
  },
};

// Loosely typed copies for building invalid inputs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;
const clone = (): Loose => JSON.parse(JSON.stringify(input)) as Loose;

describe('projectInputSchema', () => {
  it('lists the same values as the engine', () => {
    expect(INVESTMENT_GROUP_VALUES).toEqual(INVESTMENT_GROUPS);
    expect(EQUITY_CLASS_VALUES).toEqual(EQUITY_CLASSES);
    expect(COST_CATEGORY_VALUES).toEqual(COST_CATEGORIES);
    expect(COST_CENTRE_GROUP_VALUES).toEqual(COST_CENTRE_GROUPS);
    expect([...ALLOCATION_KEY_VALUES, 'SHARES']).toEqual(ALLOCATION_KEYS);
    const methods: readonly DepreciationMethod[] = DEPRECIATION_METHOD_VALUES;
    expect(methods).toHaveLength(4);
  });

  it('normalises numbers and currency codes and gives an input the engine can run', () => {
    const parsed = projectInputSchema.parse(input);
    expect(parsed.localCurrency).toBe('IRR');
    expect(parsed.investment.items[0]?.amounts[0]).toBe('1000');
    expect(parsed.investment.items[0]?.depreciation?.salvageRate).toBe('0.1');
    // The schema output is assignable to the engine input: the compiler keeps the two in step.
    const engineInput: ProjectInput = parsed;
    const { value } = projectModel(engineInput);
    // 1 000 USD at 600 000.
    expect(value.investment.fixedInvestment[0]).toBe('600000000');
    expect(value.statements.incomeStatement.salesRevenue[1]).toBe('1000000000');
  });

  it('reports missing and malformed parts at their field, in Persian', () => {
    const issues = (value: unknown) =>
      projectInputSchema.safeParse(value).error?.issues.map((i) => i.path.join('.')) ?? [];
    expect(issues({})).toEqual(
      expect.arrayContaining(['horizon', 'localCurrency', 'investment', 'statements']),
    );
    const broken = clone();
    broken.investment.items[0].amounts[1] = '12%';
    broken.investment.items[0].group = 'SHIPS';
    broken.operations.products[0].sales[0].receivablesCoverage = { days: '30', shareOfYear: '0.1' };
    broken.statements.referenceYear = 1.5;
    expect(issues(broken)).toEqual(
      expect.arrayContaining([
        'investment.items.0.amounts.1',
        'investment.items.0.group',
        'operations.products.0.sales.0.receivablesCoverage',
        'statements.referenceYear',
      ]),
    );
    const result = projectInputSchema.safeParse(broken);
    expect(
      result.error?.issues.find((i) => i.path.join('.') === 'investment.items.0.amounts.1')
        ?.message,
    ).toBe('عدد معتبر وارد کنید (مثلاً ۰٫۱۸ یا ۱۲۵۰۰۰۰).');
  });

  it('drops properties it does not know and bounds list sizes', () => {
    const extra = clone();
    extra.statements.indicatorScope = 'NPV';
    extra.unknown = { a: 1 };
    const parsed = projectInputSchema.parse(extra) as Loose;
    expect(parsed.unknown).toBeUndefined();
    expect(parsed.statements.indicatorScope).toBeUndefined();
    const long = clone();
    long.investment.items[0].amounts = Array.from({ length: 601 }, () => '0');
    expect(projectInputSchema.safeParse(long).success).toBe(false);
  });
});

describe('projectInputSchema: size', () => {
  it('refuses an oversized calculation at the horizon', () => {
    const big = clone();
    // 500 monthly construction periods + three years = 503 periods, with 20 items.
    big.horizon.construction = { periods: 500, periodMonths: 1 };
    big.investment.items = Array.from({ length: 20 }, (_, i) => ({
      ...big.investment.items[0],
      key: `item-${i}`,
    }));
    const result = projectInputSchema.safeParse(big);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(['horizon']);
    expect(result.error?.issues[0]?.message).toContain('بیش از حد بزرگ');
  });
});

describe('projectInputSchema: horizon the engine refuses', () => {
  it('reports the horizon and does not throw', () => {
    const long = clone();
    long.horizon.productionYears = 50;
    const result = projectInputSchema.safeParse(long);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(['horizon.productionYears']);
  });
});

describe('financial model drafts', () => {
  it('refuses drafts that cannot be stored', () => {
    const draft = (inputs: unknown) =>
      createFinancialModelSchema.safeParse({ title: 'طرح فولاد', inputs }).success;
    expect(draft({ a: { b: [1, 'x', null, true] } })).toBe(true);
    expect(draft({ a: 'x\u0000y' })).toBe(false);
    expect(draft({ 'k\u0000': 1 })).toBe(false);
    let deep: unknown = 1;
    for (let i = 0; i < 20; i++) deep = { deep };
    expect(draft({ deep })).toBe(false);
    expect(
      updateFinancialModelSchema.safeParse({ title: 'طرح فولاد', inputs: {}, version: 2147483648 })
        .success,
    ).toBe(false);
  });

  it('accepts an incomplete draft and requires the version on a save', () => {
    expect(createFinancialModelSchema.parse({ title: '  طرح فولاد  ' })).toEqual({
      title: 'طرح فولاد',
      inputs: {},
    });
    expect(createFinancialModelSchema.safeParse({ title: 'طرح', inputs: [] }).success).toBe(false);
    expect(updateFinancialModelSchema.safeParse({ title: 'طرح فولاد', inputs: {} }).success).toBe(
      false,
    );
    expect(
      updateFinancialModelSchema.parse({ title: 'طرح فولاد', inputs: { a: 1 }, version: 3 }),
    ).toEqual({ title: 'طرح فولاد', inputs: { a: 1 }, version: 3 });
  });
});
