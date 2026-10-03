import { projectModel, type ProjectInput } from '@roshd/financial-engine';
import { describe, expect, it } from 'vitest';
import { analyse } from './analysis';
import {
  changeOf,
  parseSteps,
  percentAsFraction,
  sensitivityVariable,
  variablesOf,
} from './analysis-inputs';
import { frameOfHorizon } from './frame';
import {
  balanceSheetTable,
  cashFlowTable,
  discountedCashFlowTable,
  formatAmount,
  formatCell,
  incomeStatementTable,
  ratiosTable,
  tableColumns,
} from './statements';
import { defaultText, warningPlace, warningText } from './warnings';

const RESIDUAL = 'ارزش باقی‌مانده (دارایی‌ها و سرمایه در گردش)';
const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
const horizon = {
  start: { year: 1406, month: 1 },
  balanceMonth: 12,
  construction: { periods: 1, periodMonths: 12 as const },
  startup: { periods: 0, periodMonths: 12 as const },
  productionYears: 3,
};
const input: ProjectInput = {
  horizon,
  localCurrency: 'IRR',
  exchangeRates: { USD: ['600000', '600000', '600000', '600000'] },
  investment: {
    items: [
      {
        key: 'machinery',
        group: 'MACHINERY',
        currency: 'USD',
        origin: 'FOREIGN',
        amounts: at({ 0: '1000' }),
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 60,
          salvageRate: '0.1',
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
    discounting: { totalCapitalRate: '0.2', equityRate: '0.25' },
    referenceYear: 0,
  },
};
// What the API stores and returns: the result after a round trip through JSON.
const stored = JSON.parse(JSON.stringify(projectModel(input).value)) as ReturnType<
  typeof projectModel
>['value'];
const frame = frameOfHorizon({ calendar: 'SOLAR_HIJRI', ...horizon })!;

describe('statement tables', () => {
  const { statements } = stored;

  it('have one value per column in every row', () => {
    const tables = [
      incomeStatementTable(statements),
      cashFlowTable(statements),
      balanceSheetTable(statements),
      discountedCashFlowTable(statements, 'totalCapital'),
      discountedCashFlowTable(statements, 'equity'),
      ratiosTable(statements),
    ];
    for (const table of tables) {
      const columns = tableColumns(frame, table.salvageColumn);
      const rows = table.sections.flatMap((section) => section.rows);
      expect(rows.length).toBeGreaterThan(2);
      for (const row of rows) {
        expect(row.values, `${table.id}: ${row.label}`).toHaveLength(columns.length);
        expect(row.label).toMatch(/[؀-ۿ]/);
      }
      // Labels identify the rows of a table.
      expect(new Set(rows.map((row) => row.label)).size).toBe(rows.length);
    }
  });

  it('show the lines of the engine, not sums of their own', () => {
    const income = incomeStatementTable(statements).sections[0]!.rows;
    const row = (label: string) => income.find((r) => r.label === label)!.values;
    expect(row('درآمد فروش')).toBe(statements.incomeStatement.salesRevenue);
    expect(row('سود خالص')).toBe(statements.incomeStatement.netProfit);
    // 100 units at 10 000 000.
    expect(row('درآمد فروش')[1]).toBe('1000000000');
    const balance = balanceSheetTable(statements);
    const assets = balance.sections[0]!.rows.at(-1)!;
    const liabilities = balance.sections[1]!.rows.find(
      (r) => r.label === 'جمع بدهی‌ها و حقوق صاحبان سهام',
    )!;
    expect(assets.label).toBe('جمع دارایی‌ها');
    expect(assets.values).toEqual(liabilities.values);
    // Only the classes of equity the run has.
    expect(balance.sections[1]!.rows.filter((r) => r.label.startsWith('آورده: '))).toHaveLength(4);
  });

  it('adds the year after production when residual values return there', () => {
    const table = discountedCashFlowTable(statements, 'totalCapital');
    expect(table.salvageColumn).toBe(true);
    const columns = tableColumns(frame, true);
    expect(columns).toHaveLength(5);
    expect(columns.at(-1)).toEqual({ label: 'پس از تولید', group: 'ارزش باقی‌مانده' });
    expect(tableColumns(frame)).toHaveLength(4);
    const row = (label: string) => table.sections[0]!.rows.find((r) => r.label === label)!.values;
    // Flows are per period; the last column holds the residual value alone.
    expect(row('ورودی نقد').at(-1)).toBeNull();
    expect(row(RESIDUAL)).toEqual([null, null, null, null, statements.totalCapital.residualValue]);
    expect(row('جریان نقد خالص').at(-1)).toBe(statements.totalCapital.residualValue);
  });

  it('keeps the residual value in the last period when it returns there', () => {
    const atEnd = projectModel({
      ...input,
      statements: { ...input.statements, residualValueTiming: 'END_OF_PRODUCTION' },
    }).value.statements;
    const table = discountedCashFlowTable(atEnd, 'equity');
    expect(table.salvageColumn).toBe(false);
    const rows = table.sections[0]!.rows;
    const row = (label: string) => rows.find((r) => r.label === label)!.values;
    for (const r of rows) expect(r.values).toHaveLength(4);
    expect(row(RESIDUAL)).toEqual([null, null, null, atEnd.equity.residualValue]);
    // Inflow less outflow plus the residual value is the net flow of the last period.
    const net =
      Number(row('ورودی نقد')[3]) -
      Number(row('خروجی نقد')[3]) +
      Number(atEnd.equity.residualValue);
    expect(Number(row('جریان نقد خالص')[3])).toBeCloseTo(net, 4);
  });

  it('shows debt service only for a project with long-term loans', () => {
    expect(statements.debtService).toBeNull();
    expect(ratiosTable(statements).sections.map((section) => section.title)).toEqual([
      'نسبت‌های مالی',
      'نقطه سربه‌سر هر دوره تولید',
    ]);
    const withLoan = projectModel({
      ...input,
      financing: {
        ...input.financing,
        loans: [
          {
            key: 'bank',
            currency: 'IRR',
            origin: 'LOCAL',
            loan: {
              type: 'CONSTANT_PRINCIPAL',
              repaymentMonths: 12,
              flows: [{ day: 360, amount: '100000000' }],
              rates: [{ fromDay: 1, rate: '0.2' }],
              capitalisedShare: '0',
              numberOfRepayments: 2,
              firstRepaymentDay: 720,
            },
          },
        ],
      },
    }).value.statements;
    const sections = ratiosTable(withLoan).sections;
    expect(sections.at(-1)?.title).toBe('خدمت بدهی بلندمدت');
    for (const row of sections.at(-1)!.rows) expect(row.values).toHaveLength(4);
    expect(sections.at(-1)!.rows[2]!.values.some((value) => value !== null)).toBe(true);
  });

  it('puts the net worth in a section of its own', () => {
    const sections = balanceSheetTable(statements).sections;
    expect(sections.map((section) => section.title)).toEqual([
      'دارایی‌ها',
      'بدهی‌ها و حقوق صاحبان سهام',
      'ارزش ویژه',
    ]);
    expect(sections[1]!.rows.at(-1)?.label).toBe('جمع بدهی‌ها و حقوق صاحبان سهام');
    expect(sections[2]!.rows[0]!.values).toBe(statements.balanceSheet.netWorth);
  });

  it('formats amounts in the display unit, percentages and missing values', () => {
    expect(formatAmount('1250000000', '1')).toBe('۱٬۲۵۰٬۰۰۰٬۰۰۰');
    expect(formatAmount('1250000000', '1000000')).toBe('۱٬۲۵۰');
    expect(formatAmount('1250400000', '1000000000')).toBe('۱٫۳');
    expect(formatAmount('-600000000.4', '1')).toBe('-۶۰۰٬۰۰۰٬۰۰۰');
    expect(formatAmount('499', '1000')).toBe('۰٫۵');
    expect(formatCell('0.1875', 'percent', '1')).toBe('۱۸٫۷۵');
    expect(formatCell('1.4567', 'ratio', '1')).toBe('۱٫۴۶');
    expect(formatCell(null, 'ratio', '1')).toBe('—');
    expect(formatCell(undefined, 'amount', '1')).toBe('—');
  });
});

describe('warnings', () => {
  it('places a warning next to the indicator of its basis', () => {
    expect(warningPlace({ code: 'irr.noSignChange', params: { basis: 'equity' } })).toEqual({
      basis: 'equity',
      indicator: 'irr',
    });
    expect(
      warningPlace({ code: 'dynamicPayback.notReached', params: { basis: 'totalCapital' } }),
    ).toEqual({ basis: 'totalCapital', indicator: 'dynamicPayback' });
    expect(
      warningPlace({ code: 'payback.notReached', params: { basis: 'equity' } })?.indicator,
    ).toBe('payback');
    // Not about an indicator, or without a basis: shown with the general warnings.
    expect(warningPlace({ code: 'cash.underFinanced', params: { periods: '2' } })).toBeNull();
    expect(warningPlace({ code: 'irr.noSignChange' })).toBeNull();
    expect(warningPlace({ code: 'constructor.x', params: { basis: 'equity' } })).toBeNull();
  });

  it('gives Persian texts and names the basis', () => {
    expect(warningText({ code: 'payback.notReached', params: { basis: 'equity' } })).toBe(
      'آورده: سرمایه تا پایان افق طرح بازنمی‌گردد.',
    );
    expect(defaultText({ key: 'mirr.rates', value: 'irr', item: 'totalCapital' })).toContain(
      '(کل سرمایه)',
    );
    // A loan may be named like a basis.
    expect(defaultText({ key: 'loan.firstRepaymentDate', value: '720', item: 'equity' })).toContain(
      '«equity»',
    );
    expect(defaultText({ key: 'toString', value: 'x' })).toBe('toString');
  });
});

describe('analysis inputs', () => {
  it('offers the variables the model has', () => {
    expect(variablesOf(input)).toEqual([
      'salesPrice',
      'salesQuantity',
      'costPrice',
      'costQuantity',
      'investment',
      'exchangeRate',
      'discountRate',
    ]);
    const bare: ProjectInput = {
      ...input,
      exchangeRates: {},
      investment: { items: [] },
      operations: { ...input.operations, costs: [] },
    };
    expect(variablesOf(bare)).toEqual(['salesPrice', 'salesQuantity', 'discountRate']);
  });

  it('reads the steps as percentages and refuses what is unclear', () => {
    expect(parseSteps('-20, -10  ۱۰ ، 20%')).toEqual({
      ok: true,
      value: ['-0.2', '-0.1', '0.1', '0.2'],
    });
    expect(parseSteps('').ok).toBe(false);
    expect(parseSteps('10, abc').ok).toBe(false);
    expect(parseSteps('10, 0').ok).toBe(false);
    expect(parseSteps('10 10').ok).toBe(false);
    expect(parseSteps(Array.from({ length: 13 }, (_, i) => String(i + 1)).join(' ')).ok).toBe(
      false,
    );
    // A step is above −100 % and at most +1000 %.
    for (const outside of ['-100', '-120', '-100.5', '1000.5', '1001', '250000']) {
      expect(parseSteps(outside), outside).toMatchObject({ ok: false });
    }
    expect(parseSteps('-99.9 1000 0.001')).toEqual({
      ok: true,
      value: ['-0.999', '10', '0.00001'],
    });
    expect(percentAsFraction('۱۲٫۵')).toBe('0.125');
    expect(percentAsFraction('x')).toBeNull();
  });

  it('builds the changes of the engine', () => {
    expect(changeOf('salesPrice', '-0.1')).toEqual({ target: { kind: 'SALES' }, price: '-0.1' });
    expect(changeOf('salesQuantity', '0.2')).toEqual({
      target: { kind: 'SALES' },
      quantity: '0.2',
    });
    expect(sensitivityVariable('investment')).toEqual({
      key: 'investment',
      target: { kind: 'FIXED_INVESTMENT' },
      dimension: 'price',
    });
  });
});

describe('analysis', () => {
  const base = stored.statements.totalCapital.npv;

  it('compares scenarios with the base case of the run', () => {
    const outcome = analyse({
      kind: 'scenarios',
      input,
      scenarios: [
        { key: 'خوش‌بینانه', changes: [changeOf('salesPrice', '0.1')] },
        {
          key: 'بدبینانه',
          changes: [changeOf('salesPrice', '-0.1'), changeOf('investment', '0.2')],
        },
      ],
    });
    if (!outcome.ok || outcome.result.kind !== 'scenarios') throw new Error('failed');
    const { result } = outcome;
    expect(result.base.totalCapital.npv).toBe(base);
    const [good, bad] = result.scenarios;
    expect(Number(good!.indicators.totalCapital.npv)).toBeGreaterThan(Number(base));
    expect(Number(bad!.indicators.totalCapital.npv)).toBeLessThan(Number(base));
    expect(result.scenarios.map((s) => s.key)).toEqual(['خوش‌بینانه', 'بدبینانه']);
  });

  it('gives the points and tornado bars of a sensitivity analysis', () => {
    const outcome = analyse({
      kind: 'sensitivity',
      input,
      variables: variablesOf(input).map(sensitivityVariable),
      steps: ['-0.1', '0.1'],
    });
    if (!outcome.ok || outcome.result.kind !== 'sensitivity') throw new Error('failed');
    const { result } = outcome;
    expect(result.variables).toHaveLength(7);
    expect(result.variables[0]!.points.map((p) => p.change)).toEqual(['-0.1', '0.1']);
    const bars = result.tornado.totalCapital;
    expect(bars).toHaveLength(7);
    // Widest first; a higher sales price cannot lower the NPV.
    expect(Number(bars[0]!.swing)).toBeGreaterThanOrEqual(Number(bars[1]!.swing));
    const price = bars.find((bar) => bar.key === 'salesPrice')!;
    expect(Number(price.high.npv)).toBeGreaterThan(Number(price.low.npv));
  });

  it('returns the Persian message of a refused analysis', () => {
    const outcome = analyse({
      kind: 'sensitivity',
      input,
      variables: [sensitivityVariable('inflation')],
      steps: ['0.1'],
    });
    expect(outcome).toMatchObject({
      ok: false,
      message: 'هیچ قلمی در ورودی‌های طرح با این متغیر مطابقت ندارد.',
    });
    expect(
      analyse({
        kind: 'scenarios',
        input,
        scenarios: [{ key: 'a', changes: [changeOf('salesPrice', '-2')] }],
      }),
    ).toMatchObject({ ok: false, message: 'درصد تغییر نمی‌تواند کمتر از منفی ۱۰۰ درصد باشد.' });
  });
});
