import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
import { EngineInputError } from '../errors';
import { projectModel, type ProjectInput } from './project';
import {
  applyChanges,
  criticalValues,
  goalSeek,
  scenarioAnalysis,
  sensitivityAnalysis,
  type ProjectChange,
  type SensitivityVariable,
} from './sensitivity';

// The project of statements.test.ts: one construction year and three production years.
// Machinery 1 000 (200 a year) and land 200; equity 800 and a loan of 500 at 10 % repaid in two
// instalments; 100 units a year at 10, ore 4 a unit, office 100 a year; receivables of 36 days;
// tax 10 % up to 100 and 20 % above; half of the profit retained; discount rate 10 %.
const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
const project: ProjectInput = {
  horizon: {
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
        amounts: at({ 0: '1000' }),
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

const salesPrice: SensitivityVariable = {
  key: 'salesPrice',
  target: { kind: 'SALES' },
  dimension: 'price',
};
const salesVolume: SensitivityVariable = {
  key: 'salesVolume',
  target: { kind: 'SALES', product: 'steel', line: 'home' },
  dimension: 'quantity',
};
const orePrice: SensitivityVariable = {
  key: 'orePrice',
  target: { kind: 'PRODUCTION_COSTS', category: 'RAW_MATERIALS' },
  dimension: 'price',
};
const investment: SensitivityVariable = {
  key: 'investment',
  target: { kind: 'FIXED_INVESTMENT' },
  dimension: 'price',
};
/** Present value at `rate` with the reference at the end of the first year (period 0). */
const present = (amounts: string[], rate = '1.1') =>
  amounts.reduce(
    (sum, a, j) => sum.plus(toDecimal(a).div(new Decimal(rate).pow(j))),
    new Decimal(0),
  );
const close = (actual: string | undefined, expected: Decimal | string, tolerance = '1e-20') =>
  expect(
    toDecimal(actual ?? 'NaN')
      .minus(expected)
      .abs()
      .lt(tolerance),
    `${actual} ≈ ${expected.toString()}`,
  ).toBe(true);
const npvWith = (changes: ProjectChange[]) =>
  projectModel(applyChanges(project, changes)).value.statements.totalCapital.npv;
const fails = (
  run: () => unknown,
  code: string,
  field: string,
  params: Record<string, string> = {},
) =>
  expect(run).toThrowError(new EngineInputError(code as EngineInputError['code'], field, params));

// Hand-computed cash flows of the total capital (see statements.test.ts for the base case).
const BASE = ['-1200', '410', '455', '450', '650'];
// Sales price +10 %: revenue 1 100, tax 60, 65, 70.
const PRICE_UP = ['-1200', '490', '535', '530', '650'];
// Sales price −10 %: revenue 900, tax 20, 25, 30.
const PRICE_DOWN = ['-1200', '330', '375', '370', '650'];
// Investment +25 %: 1 500, depreciation 250, tax 30, 35, 40, residual value 500 + 250 + 50.
const INVESTMENT_UP = ['-1500', '420', '465', '460', '800'];

describe('projectModel', () => {
  it('runs every schedule from the inputs', () => {
    const { value, warnings, defaultsUsed } = projectModel(project);
    expect(value.horizon.periods).toHaveLength(4);
    expect(value.investment.fixedInvestment).toEqual(at({ 0: '1200' }));
    expect(value.financing.totalSources).toEqual(at({ 0: '1300' }));
    expect(value.operations.sales.revenue).toEqual(at({ 1: '1000', 2: '1000', 3: '1000' }));
    expect(value.statements.totalCapital.net).toEqual(BASE);
    expect(warnings).toEqual([]);
    expect(defaultsUsed.map((d) => d.key)).toContain('cash.autoCoverage');
  });

  it('reports an input error with the section it is in', () => {
    expect(() =>
      projectModel({ ...project, horizon: { ...project.horizon, productionYears: 0 } }),
    ).toThrowError(/horizon\.productionYears/);
    expect(() =>
      projectModel({
        ...project,
        statements: { ...project.statements, referenceYear: 7 },
      }),
    ).toThrowError(/statements\.referenceYear/);
    expect(() =>
      projectModel({
        ...project,
        investment: { items: [{ ...project.investment.items[0]!, group: 'X' as never }] },
      }),
    ).toThrowError(/investment\.items\[0\]\.group/);
  });
});

describe('projectModel: shared inputs', () => {
  it('keeps the path of exchange rates and inflation, which belong to no section', () => {
    const usd = { ...project.investment.items[1]!, currency: 'USD' };
    const foreign = { ...project, investment: { items: [project.investment.items[0]!, usd] } };
    fails(
      () => projectModel({ ...foreign, exchangeRates: { USD: ['10'] } }),
      'series.lengthMismatch',
      'exchangeRates.USD',
      { expected: '4', actual: '1' },
    );
    fails(
      () => projectModel({ ...project, inflation: { IRR: ['0.1'] } }),
      'series.lengthMismatch',
      'inflation.IRR',
      { expected: '4', actual: '1' },
    );
    // A missing rate is reported at the item that needs it.
    fails(
      () => projectModel(foreign),
      'model.exchangeRateMissing',
      'investment.items[1].currency',
      {
        currency: 'USD',
      },
    );
  });

  it('computes only the indicators a search asks for', () => {
    const scoped = (indicatorScope: 'ALL' | 'NPV' | 'NPV_AND_IRR') =>
      projectModel({ ...project, statements: { ...project.statements, indicatorScope } }).value
        .statements.totalCapital;
    const all = projectModel(project).value.statements.totalCapital;
    expect(scoped('ALL')).toEqual(all);
    expect(scoped('NPV')).toMatchObject({ npv: all.npv, net: all.net });
    expect(scoped('NPV').irr).toBeUndefined();
    expect(scoped('NPV_AND_IRR').irr).toBe(all.irr);
    expect(scoped('NPV_AND_IRR').mirr).toBeUndefined();
    expect(scoped('NPV_AND_IRR').payback).toBeUndefined();
    fails(
      () =>
        projectModel({
          ...project,
          statements: { ...project.statements, indicatorScope: 'FOO' as never },
        }),
      'statements.option',
      'statements.indicatorScope',
    );
  });
});

describe('applyChanges', () => {
  it('scales quantities and prices of the chosen items and leaves the input untouched', () => {
    const changed = applyChanges(project, [
      { target: { kind: 'SALES' }, quantity: '-0.1', price: '0.1' },
      { target: { kind: 'PRODUCTION_COSTS', item: 'office' }, price: '0.5', quantity: '0.2' },
      { target: { kind: 'FIXED_INVESTMENT', group: 'LAND' }, price: '0.25' },
    ]);
    const line = changed.operations.products[0]!.sales[0]!;
    expect(line.quantities).toEqual(at({ 1: '90', 2: '90', 3: '90' }));
    expect(line.price).toBe('11');
    // The fixed cost of an item follows the price change only.
    expect(changed.operations.costs[1]!.standard).toMatchObject({ fixedCost: '150' });
    expect(changed.operations.costs[0]).toBe(project.operations.costs[0]);
    expect(changed.investment.items.map((i) => i.amounts[0])).toEqual(['1000', '250']);
    expect(project.operations.products[0]!.sales[0]!.price).toBe('10');
    expect(project.investment.items[1]!.amounts[0]).toBe('200');
  });

  it('multiplies two changes of the same item', () => {
    const changed = applyChanges(project, [
      { target: { kind: 'SALES' }, price: '0.1' },
      { target: { kind: 'SALES', line: 'home' }, price: '0.1' },
    ]);
    expect(changed.operations.products[0]!.sales[0]!.price).toBe('12.1');
  });

  it('changes discount rates relatively', () => {
    // 10 % × 1.1 = 11 %.
    close(npvWith([{ target: { kind: 'DISCOUNT_RATE' }, price: '0.1' }]), present(BASE, '1.11'));
  });

  it('refuses a change that matches nothing or makes no sense', () => {
    const run = (change: ProjectChange) => () => applyChanges(project, [change]);
    fails(
      run({ target: { kind: 'SALES', line: 'abroad' }, price: '0.1' }),
      'sensitivity.noMatch',
      'changes[0].target',
    );
    fails(
      run({ target: { kind: 'EXCHANGE_RATE' }, price: '0.1' }),
      'sensitivity.noMatch',
      'changes[0].target',
    );
    fails(
      run({ target: { kind: 'INFLATION' }, price: '0.1' }),
      'sensitivity.noMatch',
      'changes[0].target',
    );
    fails(
      run({ target: { kind: 'DISCOUNT_RATE' }, quantity: '0.1' }),
      'sensitivity.dimension',
      'changes[0].quantity',
    );
    fails(
      run({ target: { kind: 'SALES' }, price: '-1.5' }),
      'sensitivity.changeBelowMinus100',
      'changes[0].price',
    );
    fails(
      run({ target: { kind: 'TAX' as never } }),
      'sensitivity.target',
      'changes[0].target.kind',
    );
    fails(
      run({ target: { kind: 'FIXED_INVESTMENT', group: 'SHIPS' as never }, price: '0.1' }),
      'sensitivity.target',
      'changes[0].target.group',
    );
  });
});

describe('applyChanges: exchange rates and inflation', () => {
  const foreign: ProjectInput = {
    ...project,
    exchangeRates: { USD: ['10', '10', '10', '10'] },
    inflation: { IRR: ['0.2', '0.2', '0.2', '0.2'], USD: ['0.02', '0.02', '0.02', '0.02'] },
  };

  it('scales the rate path of one currency or of all', () => {
    const changed = applyChanges(foreign, [
      { target: { kind: 'EXCHANGE_RATE', currency: 'USD' }, price: '0.5' },
      { target: { kind: 'INFLATION', currency: 'IRR' }, price: '-0.5' },
    ]);
    expect(changed.exchangeRates.USD).toEqual(['15', '15', '15', '15']);
    expect(changed.inflation).toEqual({
      IRR: ['0.1', '0.1', '0.1', '0.1'],
      USD: ['0.02', '0.02', '0.02', '0.02'],
    });
    expect(
      applyChanges(foreign, [{ target: { kind: 'INFLATION' }, price: '1' }]).inflation?.USD,
    ).toEqual(['0.04', '0.04', '0.04', '0.04']);
  });
});

describe('scenarioAnalysis', () => {
  const { value, warnings, defaultsUsed } = scenarioAnalysis(project, [
    { key: 'optimistic', changes: [{ target: { kind: 'SALES' }, price: '0.1' }] },
    { key: 'pessimistic', changes: [{ target: { kind: 'FIXED_INVESTMENT' }, price: '0.25' }] },
  ]);

  it('calculates the base case and every scenario in full', () => {
    close(value.base.totalCapital.npv, present(BASE));
    expect(toDecimal(value.base.totalCapital.npv).toFixed(4)).toBe('330.8107');
    close(value.scenarios[0]!.indicators.totalCapital.npv, present(PRICE_UP));
    close(value.scenarios[1]!.indicators.totalCapital.npv, present(INVESTMENT_UP));
    expect(value.scenarios.map((s) => s.key)).toEqual(['optimistic', 'pessimistic']);
    expect(
      toDecimal(value.scenarios[0]!.indicators.totalCapital.irr!).gt(value.base.totalCapital.irr!),
    ).toBe(true);
    expect(value.base.totalCapital.paybackMonths).toBeDefined();
    expect(value.base.equity.npv).toBeDefined();
  });

  it('keeps the warnings of each scenario with it', () => {
    expect(warnings).toEqual([]);
    expect(value.scenarios[0]!.warnings).toEqual([]);
    // Investment of 1 500 against sources of 1 300: the plan is under-financed in construction.
    expect(value.scenarios[1]!.warnings).toEqual([
      { code: 'cash.underFinanced', params: { periods: '1' } },
    ]);
    expect(defaultsUsed.map((d) => d.key)).toContain('discounting.referenceDate');
  });

  it('names the scenario of an invalid change', () => {
    fails(
      () =>
        scenarioAnalysis(project, [
          { key: 'a', changes: [{ target: { kind: 'INFLATION' }, price: '0.1' }] },
        ]),
      'sensitivity.noMatch',
      'scenarios[0].changes[0].target',
    );
    fails(
      () =>
        scenarioAnalysis(project, [
          { key: 'a', changes: [] },
          { key: 'a', changes: [] },
        ]),
      'model.duplicateKey',
      'scenarios[1].key',
    );
  });
});

describe('sensitivityAnalysis', () => {
  const { value } = sensitivityAnalysis(project, {
    variables: [investment, salesPrice, orePrice],
    steps: ['0.1', '-0.1'],
  });

  it('changes one variable at a time by every step, in ascending order', () => {
    expect(value.variables.map((v) => v.key)).toEqual(['investment', 'salesPrice', 'orePrice']);
    const price = value.variables[1]!;
    expect(price.points.map((p) => p.change)).toEqual(['-0.1', '0.1']);
    close(price.points[0]!.indicators.totalCapital.npv, present(PRICE_DOWN));
    close(price.points[1]!.indicators.totalCapital.npv, present(PRICE_UP));
    close(value.base.totalCapital.npv, present(BASE));
  });

  it('gives tornado bars sorted by the swing of the NPV', () => {
    const bars = value.tornado.totalCapital;
    expect(bars.map((b) => b.key)).toEqual(['salesPrice', 'orePrice', 'investment']);
    const widest = bars[0]!;
    expect(widest.low.change).toBe('-0.1');
    close(widest.swing, present(PRICE_UP).minus(present(PRICE_DOWN)));
    // A higher ore price lowers the NPV: the bar still reports low and high by the change.
    const ore = bars[1]!;
    expect(toDecimal(ore.low.npv).gt(ore.high.npv)).toBe(true);
    expect(value.tornado.equity).toHaveLength(3);
  });

  it('spans the base case when all steps lie on one side, and keeps the warnings of a point', () => {
    const oneSided = sensitivityAnalysis(project, {
      variables: [investment],
      steps: ['0.25'],
    }).value;
    const bar = oneSided.tornado.totalCapital[0]!;
    expect(bar.low).toEqual({ change: '0', npv: oneSided.base.totalCapital.npv });
    expect(bar.high.change).toBe('0.25');
    close(bar.swing, present(BASE).minus(present(INVESTMENT_UP)));
    // Investment of 1 500 against sources of 1 300.
    expect(oneSided.variables[0]!.points[0]!.warnings).toEqual([
      { code: 'cash.underFinanced', params: { periods: '1' } },
    ]);
    expect(value.variables[1]!.points[0]!.warnings).toEqual([]);
  });

  it('refuses invalid variables and steps', () => {
    const run = (variables: SensitivityVariable[], steps: string[]) => () =>
      sensitivityAnalysis(project, { variables, steps });
    fails(run([], ['0.1']), 'sensitivity.noVariables', 'variables');
    fails(run([salesPrice], []), 'series.empty', 'steps');
    fails(run([salesPrice], ['0.1', '0.10']), 'sensitivity.duplicateStep', 'steps[1]');
    fails(run([salesPrice], ['-2']), 'sensitivity.changeBelowMinus100', 'steps[0]');
    fails(run([salesPrice, salesPrice], ['0.1']), 'model.duplicateKey', 'variables[1].key');
    fails(
      run([{ key: 'rate', target: { kind: 'DISCOUNT_RATE' }, dimension: 'quantity' }], ['0.1']),
      'sensitivity.dimension',
      'variables[0].dimension',
    );
    fails(
      run([{ key: 'fx', target: { kind: 'EXCHANGE_RATE' }, dimension: 'price' }], ['0.1']),
      'sensitivity.noMatch',
      'variables[0].target',
    );
  });
});

describe('criticalValues', () => {
  it('finds the change at which the NPV turns zero, or reports that there is none', () => {
    const { value, warnings } = criticalValues(project, {
      basis: 'totalCapital',
      variables: [
        { ...salesPrice, minChange: '-0.9', maxChange: '0.5' },
        { ...salesVolume, minChange: '-0.9', maxChange: '0' },
        { ...orePrice, minChange: '-0.5', maxChange: '3' },
        { ...investment, minChange: '-0.1', maxChange: '0.1' },
      ],
    });
    expect(value.map((v) => v.changes.length)).toEqual([1, 1, 1, 0]);
    const price = toDecimal(value[0]!.changes[0]!);
    expect(price.isNegative()).toBe(true);
    // The NPV at the critical change is zero (to the precision of the search).
    close(npvWith([{ target: salesPrice.target, price: value[0]!.changes[0]! }]), '0', '0.001');
    close(npvWith([{ target: salesVolume.target, quantity: value[1]!.changes[0]! }]), '0', '0.001');
    close(npvWith([{ target: orePrice.target, price: value[2]!.changes[0]! }]), '0', '0.001');
    // Volume has to fall further than price: variable costs fall with it.
    expect(toDecimal(value[1]!.changes[0]!).lt(price)).toBe(true);
    expect(toDecimal(value[2]!.changes[0]!).gt(0)).toBe(true);
    expect(warnings).toEqual([
      { code: 'sensitivity.noCriticalValue', params: { variable: 'investment' } },
    ]);
  });

  it('names the variable that matches nothing', () => {
    fails(
      () =>
        criticalValues(project, {
          basis: 'totalCapital',
          variables: [
            { ...salesPrice, minChange: '-0.5', maxChange: '0.5' },
            {
              key: 'fx',
              target: { kind: 'EXCHANGE_RATE' },
              dimension: 'price',
              minChange: '-0.5',
              maxChange: '0.5',
            },
          ],
        }),
      'sensitivity.noMatch',
      'variables[1].target',
    );
    fails(
      () =>
        goalSeek(project, {
          target: { indicator: 'NPV', basis: 'totalCapital', value: '400' },
          variables: [
            { key: 'fx', target: { kind: 'EXCHANGE_RATE' }, dimension: 'price', maxChange: '0.5' },
          ],
        }),
      'sensitivity.noMatch',
      'variables[0].target',
    );
  });

  it('refuses a range that does not contain the original value', () => {
    fails(
      () =>
        criticalValues(project, {
          basis: 'equity',
          variables: [{ ...salesPrice, minChange: '0.1', maxChange: '0.5' }],
        }),
      'sensitivity.range',
      'variables[0].minChange',
    );
    fails(
      () =>
        criticalValues(project, {
          basis: 'debt' as never,
          variables: [{ ...salesPrice, minChange: '-0.1', maxChange: '0.5' }],
        }),
      'sensitivity.goal',
      'options.basis',
    );
  });
});

describe('goalSeek', () => {
  it('finds the change of one variable that gives the desired NPV', () => {
    const { value, warnings } = goalSeek(project, {
      target: { indicator: 'NPV', basis: 'totalCapital', value: '400' },
      variables: [{ ...salesPrice, maxChange: '0.3' }],
    });
    expect(value.reached).toBe(true);
    expect(toDecimal(value.base!).toFixed(4)).toBe('330.8107');
    close(value.achieved, '400', '0.001');
    expect(value.changes).toHaveLength(1);
    const change = toDecimal(value.changes[0]!.change);
    expect(change.gt(0) && change.lt('0.1')).toBe(true);
    close(
      npvWith([{ target: salesPrice.target, price: value.changes[0]!.change }]),
      '400',
      '0.001',
    );
    expect(warnings).toEqual([]);
  });

  it('finds the change that gives the desired IRR on equity', () => {
    const { value } = goalSeek(project, {
      target: { indicator: 'IRR', basis: 'equity', value: '0.4' },
      variables: [{ ...salesPrice, maxChange: '1' }],
    });
    expect(value.reached).toBe(true);
    close(value.achieved, '0.4', '0.000001');
  });

  it('uses the variables in order: one at its limit, the next one closes the gap', () => {
    const { value } = goalSeek(project, {
      target: { indicator: 'NPV', basis: 'totalCapital', value: '400' },
      variables: [
        { ...orePrice, maxChange: '-0.01' },
        { ...salesPrice, maxChange: '0.3' },
      ],
    });
    expect(value.reached).toBe(true);
    expect(value.changes.map((c) => c.key)).toEqual(['orePrice', 'salesPrice']);
    expect(value.changes[0]!.change).toBe('-0.01');
    close(
      npvWith([
        { target: orePrice.target, price: '-0.01' },
        { target: salesPrice.target, price: value.changes[1]!.change },
      ]),
      '400',
      '0.001',
    );
  });

  it('reports a target that is out of reach or approached from the wrong side', () => {
    const far = goalSeek(project, {
      target: { indicator: 'NPV', basis: 'totalCapital', value: '100000' },
      variables: [{ ...salesPrice, maxChange: '0.3' }],
    });
    expect(far.value.reached).toBe(false);
    expect(far.value.changes).toEqual([
      { key: 'salesPrice', change: '0.3', achieved: far.value.achieved },
    ]);
    expect(far.warnings).toEqual([{ code: 'goalSeek.notReached' }]);
    const wrong = goalSeek(project, {
      target: { indicator: 'NPV', basis: 'totalCapital', value: '400' },
      variables: [{ ...salesPrice, maxChange: '-0.2' }],
    });
    expect(wrong.warnings).toEqual([
      { code: 'goalSeek.wrongDirection', params: { variable: 'salesPrice' } },
      { code: 'goalSeek.notReached' },
      // With prices 20 % lower the investment is not recovered within the horizon.
      { code: 'payback.notReached', params: { basis: 'totalCapital' } },
      { code: 'payback.notReached', params: { basis: 'equity' } },
    ]);
  });

  it('returns the defaults of the base case, exact values and the warnings of the plan found', () => {
    const model = projectModel(project);
    // A cheaper plant raises the NPV but is not needed here: a dearer one lowers it to 250.
    const { value, warnings, defaultsUsed } = goalSeek(project, {
      target: { indicator: 'NPV', basis: 'totalCapital', value: '250' },
      variables: [{ ...investment, maxChange: '0.5' }],
    });
    expect(defaultsUsed).toEqual(model.defaultsUsed);
    expect(value.base).toBe(model.value.statements.totalCapital.npv);
    expect(value.reached).toBe(true);
    close(value.achieved, '250', '0.001');
    // The dearer plant is no longer covered by the equity and the loan.
    expect(warnings).toEqual([{ code: 'cash.underFinanced', params: { periods: '1' } }]);
    const far = goalSeek(project, {
      target: { indicator: 'NPV', basis: 'totalCapital', value: '100000000000' },
      variables: [{ ...salesPrice, maxChange: '0.1' }],
    });
    expect(far.value.base).toBe(model.value.statements.totalCapital.npv);
    close(far.value.achieved, present(PRICE_UP));
  });

  it('needs no change when the target is already met and refuses invalid input', () => {
    const base = projectModel(project).value.statements.totalCapital.npv;
    const met = goalSeek(project, {
      target: { indicator: 'NPV', basis: 'totalCapital', value: base },
      variables: [{ ...salesPrice, maxChange: '0.3' }],
    });
    expect(met.value).toEqual({ reached: true, base, achieved: base, changes: [] });
    fails(
      () =>
        goalSeek(project, {
          target: { indicator: 'NPV', basis: 'totalCapital', value: '1' },
          variables: [{ ...salesPrice, maxChange: '0' }],
        }),
      'sensitivity.maxChange',
      'variables[0].maxChange',
    );
    fails(
      () =>
        goalSeek(project, {
          target: { indicator: 'ROI' as never, basis: 'totalCapital', value: '1' },
          variables: [{ ...salesPrice, maxChange: '0.1' }],
        }),
      'sensitivity.goal',
      'target.indicator',
    );
  });
});
