import {
  ALLOCATION_KEYS,
  COST_CATEGORIES,
  COST_CENTRE_GROUPS,
  EQUITY_CLASSES,
  INPUT_NATURES,
  INVESTMENT_GROUPS,
  LABOUR_SKILLS,
  TRADE_CATEGORIES,
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
  INPUT_NATURE_VALUES,
  INVESTMENT_GROUP_VALUES,
  LABOUR_SKILL_VALUES,
  TRADE_CATEGORY_VALUES,
  createFinancialModelSchema,
  calculationSize,
  projectInputSchema,
  updateFinancialModelSchema,
  MAX_INPUT_NOTES,
} from './financial-model-input';
import {
  ALLOCATION_KEY_LABELS_FA,
  COST_CATEGORY_LABELS_FA,
  COST_CENTRE_GROUP_LABELS_FA,
  DEPRECIATION_METHOD_LABELS_FA,
  EQUITY_CLASS_LABELS_FA,
  INVESTMENT_GROUP_LABELS_FA,
} from './financial-model-labels';

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
    expect(INPUT_NATURE_VALUES).toEqual(INPUT_NATURES);
    expect(LABOUR_SKILL_VALUES).toEqual(LABOUR_SKILLS);
    expect(TRADE_CATEGORY_VALUES).toEqual(TRADE_CATEGORIES);
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

describe('projectInputSchema: notes', () => {
  it('keeps the source and date of an assumption with the input', () => {
    const noted = clone();
    noted.notes = {
      'exchangeRates.USD': { source: '  بانک مرکزی  ', asOf: '۱۴۰۵/۰۶/۳۱' },
      'statements.tax': {},
    };
    const parsed = projectInputSchema.parse(noted);
    expect(parsed.notes).toEqual({
      'exchangeRates.USD': { source: 'بانک مرکزی', asOf: '۱۴۰۵/۰۶/۳۱' },
      'statements.tax': {},
    });
    // The engine ignores them.
    const engineInput: ProjectInput = parsed;
    expect(projectModel(engineInput).value.statements.totalCapital.npv).toBe(
      projectModel(projectInputSchema.parse(input)).value.statements.totalCapital.npv,
    );
  });

  it('bounds their number and length', () => {
    const long = clone();
    long.notes = { a: { source: 'x'.repeat(301) } };
    expect(projectInputSchema.safeParse(long).success).toBe(false);
    const many = clone();
    many.notes = Object.fromEntries(
      Array.from({ length: MAX_INPUT_NOTES + 1 }, (_, i) => [`k${i}`, { source: 's' }]),
    );
    expect(projectInputSchema.safeParse(many).success).toBe(false);
    const wrong = clone();
    wrong.notes = { a: 'text' };
    expect(projectInputSchema.safeParse(wrong).success).toBe(false);
  });
});

describe('labels', () => {
  it('names every value of the lists in Persian', () => {
    const lists: [readonly string[], Record<string, string>][] = [
      [INVESTMENT_GROUP_VALUES, INVESTMENT_GROUP_LABELS_FA],
      [EQUITY_CLASS_VALUES, EQUITY_CLASS_LABELS_FA],
      [COST_CATEGORY_VALUES, COST_CATEGORY_LABELS_FA],
      [COST_CENTRE_GROUP_VALUES, COST_CENTRE_GROUP_LABELS_FA],
      [[...ALLOCATION_KEY_VALUES, 'SHARES'], ALLOCATION_KEY_LABELS_FA],
      [DEPRECIATION_METHOD_VALUES, DEPRECIATION_METHOD_LABELS_FA],
    ];
    for (const [values, labels] of lists) {
      expect(Object.keys(labels)).toEqual([...values]);
      for (const label of Object.values(labels)) expect(label).toMatch(/[\u0600-\u06FF]/);
    }
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

describe('projectInputSchema: shareholders', () => {
  it('passes refunds of equity and shares of the net worth to the engine', () => {
    const venture = clone();
    venture.financing.equity[0].refunds = ['0', '0', '0', '۱۰۰٬۰۰۰٬۰۰۰'];
    venture.statements.profitDistribution = {
      retainedShare: '0.5',
      shareholders: [
        {
          equity: 'founders',
          preferredRate: '0',
          preferredAmount: '0',
          ordinaryShare: '1',
          repatriatedShare: '0',
          netWorthShare: '1',
        },
      ],
    };
    const parsed = projectInputSchema.parse(venture);
    expect(parsed.financing.equity[0]?.refunds?.[3]).toBe('100000000');
    const engineInput: ProjectInput = parsed;
    const { statements } = projectModel(engineInput).value;
    expect(statements.cashFlow.outflows.equityRefunds[3]).toBe('100000000');
    expect(statements.shareholders?.[0]?.equity).toBe('founders');
    // Without them a model is as before.
    const plain = projectInputSchema.parse(input);
    expect(plain.financing.equity[0]?.refunds).toBeUndefined();
    expect(projectModel(plain).value.statements.shareholders).toBeUndefined();
  });
});

describe('projectInputSchema: economic analysis', () => {
  const economic = {
    discountRate: '۰٫۰۸',
    costs: [{ item: 'ore', taxesIncluded: '0.1', valueAddedIncluded: ['0.25'] }],
    investment: [{ item: 'machinery', taxesIncluded: '0.05' }],
    dividendTax: { local: '0', foreign: '0' },
  };

  it('passes the economic input to the engine', () => {
    const parsed = projectInputSchema.parse({ ...clone(), economic });
    expect(parsed.economic?.discountRate).toBe('0.08');
    const engineInput: ProjectInput = parsed;
    const { value } = projectModel(engineInput);
    // Machinery of 600 000 000 less the 5 % of duties included.
    expect(value.economic?.valueAdded.investment.fixedAndPreProduction.values[0]).toBe('570000000');
    // Without it a model is as before.
    expect(projectModel(projectInputSchema.parse(input)).value.economic).toBeUndefined();
  });

  it('counts the economic schedules in the size of a calculation', () => {
    const plain = projectInputSchema.parse(input);
    const periods = projectModel(plain).value.horizon.periods.length;
    const withEconomic = projectInputSchema.parse({ ...clone(), economic });
    expect(calculationSize(withEconomic) - calculationSize(plain)).toBe(70 * periods);
  });

  it('passes the indirect effects on foreign exchange to the engine', () => {
    const indirectForeignExchange = {
      outputs: [
        {
          product: 'steel',
          line: 'home',
          trade: 'IMPORTABLE',
          share: '۰٫۵',
          borderPriceFactor: '1',
        },
      ],
      inputs: [{ item: 'ore', trade: 'EXPORTABLE', share: '1', borderPriceFactor: '0.5' }],
      otherInflows: [{ key: 'visitors', currency: 'usd', amounts: ['0', '1', '1', '1'] }],
      otherOutflows: [{ key: 'fuel', currency: 'IRR', amounts: ['0', '5', '5', '5'] }],
    };
    const parsed = projectInputSchema.parse({
      ...clone(),
      economic: { ...economic, indirectForeignExchange },
    });
    expect(parsed.economic?.indirectForeignExchange?.outputs[0]?.share).toBe('0.5');
    expect(parsed.economic?.indirectForeignExchange?.otherInflows[0]?.currency).toBe('USD');
    // The tradable output, the tradable input and the entered inflow and outflow count in the
    // size of the calculation, per period.
    const bare = projectInputSchema.parse({ ...clone(), economic });
    const periods = projectModel(bare).value.horizon.periods.length;
    expect(calculationSize(parsed) - calculationSize(bare)).toBe(4 * periods);
    const engineInput: ProjectInput = parsed;
    const { value } = projectModel(engineInput);
    // Half of the sales at home of 1 000 000 000 a year replace imports.
    expect(value.economic?.foreignExchange.indirect.inflows.importableOutputs.values[1]).toBe(
      '500000000',
    );
    // One dollar is 600 000: the entered inflow is converted at the rate of its period.
    const { indirect } = value.economic?.foreignExchange ?? {};
    expect(indirect?.inflows.others.values).toEqual(['0', '600000', '600000', '600000']);
    expect(indirect?.outflows.others.values).toEqual(['0', '5', '5', '5']);
    const issues = projectInputSchema
      .safeParse({
        ...clone(),
        economic: {
          ...economic,
          indirectForeignExchange: {
            ...indirectForeignExchange,
            inputs: [{ item: 'ore', trade: 'IMPORTED', share: '1', borderPriceFactor: '1' }],
            otherInflows: undefined,
          },
        },
      })
      .error?.issues.map((i) => i.path.join('.'));
    expect(issues).toEqual([
      'economic.indirectForeignExchange.inputs.0.trade',
      'economic.indirectForeignExchange.otherInflows',
    ]);
  });

  it('passes the employment to the engine', () => {
    const group = { workers: '۱۰', wageBill: '0' };
    const indirect = { unskilled: group, skilled: group, investment: '0' };
    const employment = {
      direct: { unskilled: '۴۰', skilled: '25' },
      indirect: { inputSupplying: indirect, outputUsing: indirect },
    };
    const parsed = projectInputSchema.parse({ ...clone(), economic: { ...economic, employment } });
    expect(parsed.economic?.employment?.direct.unskilled).toBe('40');
    const engineInput: ProjectInput = parsed;
    const schedule = projectModel(engineInput).value.economic?.employment;
    expect(schedule?.total.jobs).toEqual({ unskilled: '60', skilled: '45', total: '105' });
    // Without it there is no employment schedule.
    const bare = projectInputSchema.parse({ ...clone(), economic });
    expect(projectModel(bare).value.economic?.employment).toBeUndefined();
    const issues = projectInputSchema
      .safeParse({
        ...clone(),
        economic: {
          ...economic,
          employment: {
            ...employment,
            direct: { unskilled: 'many' },
            indirect: { inputSupplying: indirect },
          },
        },
      })
      .error?.issues.map((i) => i.path.join('.'));
    expect(issues).toEqual([
      'economic.employment.direct.unskilled',
      'economic.employment.direct.skilled',
      'economic.employment.indirect.outputUsing',
    ]);
  });

  it('reports malformed parts at their field', () => {
    const issues = (value: unknown) =>
      projectInputSchema
        .safeParse({ ...clone(), economic: value })
        .error?.issues.map((i) => i.path.join('.')) ?? [];
    expect(issues({})).toEqual(
      expect.arrayContaining([
        'economic.discountRate',
        'economic.costs',
        'economic.investment',
        'economic.dividendTax',
      ]),
    );
    expect(
      issues({
        ...economic,
        costs: [
          {
            item: 'ore',
            nature: 'FUEL',
            skill: 'MASTER',
            valueAddedIncluded: ['0', '0', '0', '0'],
          },
        ],
      }),
    ).toEqual([
      'economic.costs.0.valueAddedIncluded',
      'economic.costs.0.nature',
      'economic.costs.0.skill',
    ]);
  });
});

describe('projectInputSchema: starting balances', () => {
  const balances = {
    fixedAssets: [{ item: 'machinery', value: '۲۰۰٬۰۰۰٬۰۰۰' }],
    materials: [{ cost: 'ore', value: '0' }],
    workInProgress: [],
    finishedProducts: [{ product: 'steel', quantity: '5', price: '5000000' }],
    receivables: { value: '0', collectionDays: 0 },
    payables: { value: '0', paymentDays: 90 },
    cashInHand: '0',
    shortTermDeposits: '0',
    cashSurplus: '1000000',
    loans: [],
    equity: [{ equity: 'founders', value: '100000000' }],
  };

  it('passes the balances of an existing enterprise to the engine', () => {
    const existing = clone();
    existing.startingBalances = balances;
    const parsed = projectInputSchema.parse(existing);
    expect(parsed.startingBalances?.fixedAssets[0]?.value).toBe('200000000');
    const engineInput: ProjectInput = parsed;
    const { statements } = projectModel(engineInput).value;
    // Machinery 200 m, five units at 5 m and 1 m of cash, against 100 m of equity.
    expect(statements.startingBalance?.assets.total).toBe('226000000');
    expect(statements.startingBalance?.liabilities.reserves).toBe('126000000');
    // A new project has none.
    expect(projectInputSchema.parse(input).startingBalances).toBeUndefined();
  });

  it('requires every balance and whole days', () => {
    const issues = (change: (b: Loose) => void) => {
      const existing = clone();
      existing.startingBalances = JSON.parse(JSON.stringify(balances)) as Loose;
      change(existing.startingBalances as Loose);
      return (
        projectInputSchema.safeParse(existing).error?.issues.map((i) => i.path.join('.')) ?? []
      );
    };
    expect(issues((b) => delete b.cashSurplus)).toEqual(['startingBalances.cashSurplus']);
    expect(issues((b) => delete b.loans)).toEqual(['startingBalances.loans']);
    expect(issues((b) => (b.payables.paymentDays = 1.5))).toEqual([
      'startingBalances.payables.paymentDays',
    ]);
    expect(issues((b) => (b.fixedAssets[0].value = 'x'))).toEqual([
      'startingBalances.fixedAssets.0.value',
    ]);
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
