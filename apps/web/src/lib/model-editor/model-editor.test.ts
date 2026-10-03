import { planHorizon, projectYears, type HorizonInput } from '@roshd/financial-engine';
import { describe, expect, it } from 'vitest';
import {
  addCurrency,
  emptyDraft,
  removeCurrency,
  removeItem,
  renameItem,
  setInflation,
  setLocalCurrency,
  withStructure,
} from './draft-ops';
import { frameOf, resizeDraft } from './frame';
import { checkDraft, describeIssue, enginePath } from './issues';
import {
  formatDecimalFa,
  fractionToPercent,
  normalizeDecimal,
  parseWhole,
  percentToFraction,
  roundDecimal,
  shiftDecimal,
} from './numbers';
import { append, getIn, removeAt, setIn, type Draft } from './paths';
import { calculate } from './summary';

const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
const horizon = {
  calendar: 'SOLAR_HIJRI',
  start: { year: 1406, month: 1 },
  balanceMonth: 12,
  construction: { periods: 1, periodMonths: 12 },
  startup: { periods: 0, periodMonths: 12 },
  productionYears: 3,
};
/** A small complete model: one machine, one product, one material. */
const complete = (): Draft => ({
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
});

describe('numbers', () => {
  it('reads Persian digits, «٫» and thousands separators', () => {
    expect(normalizeDecimal('۱٬۲۵۰٬۰۰۰٫۵')).toBe('1250000.5');
    expect(normalizeDecimal(' 1,250 ')).toBe('1250');
    expect(normalizeDecimal('007')).toBe('7');
    expect(normalizeDecimal('.5')).toBe('0.5');
    expect(normalizeDecimal('5.')).toBe('5');
    expect(normalizeDecimal('-0')).toBe('0');
    expect(normalizeDecimal('+12')).toBe('12');
  });

  it('refuses what is not a number instead of guessing', () => {
    for (const text of ['', '12%', '1 250', '0,18', '1e5', 'abc', '--1']) {
      expect(normalizeDecimal(text), text).toBeNull();
    }
  });

  it('shifts the decimal point exactly', () => {
    expect(fractionToPercent('0.18')).toBe('18');
    expect(fractionToPercent('0.185')).toBe('18.5');
    expect(fractionToPercent('1')).toBe('100');
    expect(fractionToPercent('-0.005')).toBe('-0.5');
    expect(percentToFraction('18')).toBe('0.18');
    expect(percentToFraction('7.25')).toBe('0.0725');
    expect(percentToFraction('100')).toBe('1');
    expect(percentToFraction('0')).toBe('0');
    expect(shiftDecimal('0.1', 1)).toBe('1');
    // No binary rounding: 0.07 × 100 is 7, not 7.000000000000001.
    expect(fractionToPercent('0.07')).toBe('7');
    for (const value of ['0.3333', '12.5', '0.0001', '-45.67']) {
      expect(percentToFraction(fractionToPercent(value))).toBe(value);
    }
  });

  it('formats with Persian digits and separators', () => {
    expect(formatDecimalFa('1250000.5')).toBe('۱٬۲۵۰٬۰۰۰٫۵');
    expect(formatDecimalFa('-1000')).toBe('-۱٬۰۰۰');
    expect(formatDecimalFa('999')).toBe('۹۹۹');
    expect(formatDecimalFa('1250000', false)).toBe('۱۲۵۰۰۰۰');
    expect(formatDecimalFa('12%')).toBe('12%');
    // What is shown can be typed back.
    expect(normalizeDecimal(formatDecimalFa('1250000.5'))).toBe('1250000.5');
  });

  it('rounds for display, half away from zero', () => {
    expect(roundDecimal('3864.04', 0)).toBe('3864');
    expect(roundDecimal('3864.5', 0)).toBe('3865');
    expect(roundDecimal('-3864.5', 0)).toBe('-3865');
    expect(roundDecimal('18.8049', 2)).toBe('18.8');
    expect(roundDecimal('0.995', 2)).toBe('1');
    expect(roundDecimal('-0.004', 2)).toBe('0');
    expect(roundDecimal('12', 2)).toBe('12');
    expect(roundDecimal('123456789012345678901234567890.55', 1)).toBe(
      '123456789012345678901234567890.6',
    );
  });

  it('parses whole numbers', () => {
    expect(parseWhole('۱۴۰۶')).toBe(1406);
    expect(parseWhole(' 12 ')).toBe(12);
    expect(parseWhole('1.5')).toBeNull();
    expect(parseWhole('')).toBeNull();
  });
});

describe('paths', () => {
  it('writes without touching the original and creates what is missing', () => {
    const draft: Draft = { a: { list: [{ x: '1' }] } };
    const next = setIn(draft, ['a', 'list', 1, 'x'], '2');
    expect(next).toEqual({ a: { list: [{ x: '1' }, { x: '2' }] } });
    expect(draft).toEqual({ a: { list: [{ x: '1' }] } });
    expect(getIn(next, ['a', 'list', 0])).toBe(getIn(draft, ['a', 'list', 0]));
    expect(setIn({}, ['b', 0, 'c'], 1)).toEqual({ b: [{ c: 1 }] });
  });

  it('removes a property with undefined and list items with removeAt', () => {
    expect(setIn({ a: 1, b: 2 }, ['a'], undefined)).toEqual({ b: 2 });
    expect(removeAt({ list: ['a', 'b', 'c'] }, ['list'], 1)).toEqual({ list: ['a', 'c'] });
    expect(append({}, ['list'], 'a')).toEqual({ list: ['a'] });
  });

  it('treats names like __proto__ as plain keys', () => {
    const next = setIn({}, ['shares', '__proto__'], '0.5');
    expect(Object.keys(getIn(next, ['shares']) as object)).toEqual(['__proto__']);
    expect(getIn(next, ['shares', '__proto__'])).toBe('0.5');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(getIn({}, ['constructor'])).toBeUndefined();
  });
});

describe('frame', () => {
  it('has no frame for an incomplete horizon', () => {
    expect(frameOf({})).toBeNull();
    expect(frameOf({ horizon: { ...horizon, productionYears: 0 } })).toBeNull();
  });

  it('labels periods and years by their last month', () => {
    const frame = frameOf({ horizon })!;
    expect(frame.periods.map((p) => [p.group, p.label])).toEqual([
      ['ساخت', '۱۴۰۶/۱۲'],
      ['تولید', '۱۴۰۷/۱۲'],
      ['تولید', '۱۴۰۸/۱۲'],
      ['تولید', '۱۴۰۹/۱۲'],
    ]);
    expect(frame.productionYears.map((y) => y.label)).toEqual(['۱۴۰۷/۱۲', '۱۴۰۸/۱۲', '۱۴۰۹/۱۲']);
    expect(frame.projectYears).toHaveLength(4);
    expect(frame.totalMonths).toBe(48);
  });

  it('counts project years as the engine does', () => {
    const cases = [
      horizon,
      {
        ...horizon,
        start: { year: 1406, month: 7 },
        construction: { periods: 3, periodMonths: 6 },
      },
      {
        ...horizon,
        start: { year: 2026, month: 3 },
        balanceMonth: 6,
        construction: { periods: 5, periodMonths: 3 },
        startup: { periods: 4, periodMonths: 3 },
        productionYears: 6,
      },
      { ...horizon, construction: { periods: 0, periodMonths: 12 } },
      {
        ...horizon,
        start: { year: 1406, month: 12 },
        construction: { periods: 14, periodMonths: 1 },
      },
    ];
    for (const input of cases) {
      const plan = planHorizon(input as HorizonInput);
      const frame = frameOf({ horizon: input })!;
      expect(frame.projectYears).toHaveLength(projectYears(plan).count);
      expect(frame.periods).toHaveLength(plan.periods.length);
      // The last project year ends where the horizon ends.
      expect(frame.projectYears.at(-1)?.label).toBe(frame.periods.at(-1)?.label);
    }
  });

  it('resizes every series when the horizon changes', () => {
    const longer = { ...complete(), horizon: { ...horizon, productionYears: 5 } };
    const next = resizeDraft(longer, frameOf(longer)!);
    // Amounts get zeros, rates stay empty for the user to fill.
    expect(getIn(next, ['investment', 'items', 0, 'amounts'])).toEqual([
      '1000',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);
    expect(getIn(next, ['exchangeRates', 'USD'])).toEqual([
      '600000',
      '600000',
      '600000',
      '600000',
      '',
      '',
    ]);
    expect(getIn(next, ['operations', 'products', 0, 'sales', 0, 'quantities'])).toHaveLength(6);
    // A single value is not turned into a path.
    expect(getIn(next, ['operations', 'products', 0, 'sales', 0, 'price'])).toBe('10000000');
    expect(getIn(next, ['statements', 'discounting', 'totalCapitalRate'])).toBe('0.2');
    const shorter = { ...complete(), horizon: { ...horizon, productionYears: 1 } };
    expect(
      getIn(resizeDraft(shorter, frameOf(shorter)!), ['financing', 'equity', 0, 'amounts']),
    ).toEqual(['700000000', '0']);
    // Nothing changes when the lengths already fit.
    expect(resizeDraft(complete(), frameOf(complete())!)).toEqual(complete());
  });
});

describe('draft operations', () => {
  it('gives every stored draft the structure of the editor', () => {
    expect(withStructure(null)).toEqual(emptyDraft());
    expect(withStructure([1])).toEqual(emptyDraft());
    const stored = withStructure({ localCurrency: 'IRR', investment: { items: [{ key: 'a' }] } });
    expect(stored.localCurrency).toBe('IRR');
    expect(getIn(stored, ['investment', 'items'])).toEqual([{ key: 'a' }]);
    expect(getIn(stored, ['financing', 'loans'])).toEqual([]);
  });

  it('renames a product everywhere it is used', () => {
    let draft = complete();
    draft = setIn(draft, ['operations', 'costs', 1], {
      key: 'office',
      allocation: { key: 'SHARES', shares: { steel: '1' } },
    });
    draft = setIn(draft, ['operations', 'costCentres'], [{ key: 'plant', products: ['steel'] }]);
    const next = renameItem(draft, 'product', 0, 'rebar');
    expect(getIn(next, ['operations', 'products', 0, 'key'])).toBe('rebar');
    expect(getIn(next, ['operations', 'costs', 0, 'product'])).toBe('rebar');
    expect(getIn(next, ['operations', 'costs', 1, 'allocation', 'shares'])).toEqual({ rebar: '1' });
    expect(getIn(next, ['operations', 'costCentres', 0, 'products'])).toEqual(['rebar']);
  });

  it('keeps dividends and asset sales with their renamed or removed items', () => {
    let draft = complete();
    draft = setIn(
      draft,
      ['statements', 'profitDistribution', 'shareholders'],
      [{ equity: 'founders', ordinaryShare: '1' }],
    );
    draft = setIn(draft, ['statements', 'assetSales'], [{ item: 'machinery', period: 2 }]);
    const renamed = renameItem(renameItem(draft, 'equity', 0, 'owners'), 'investment', 0, 'line');
    expect(getIn(renamed, ['statements', 'profitDistribution', 'shareholders', 0, 'equity'])).toBe(
      'owners',
    );
    expect(getIn(renamed, ['statements', 'assetSales', 0, 'item'])).toBe('line');
    const removed = removeItem(removeItem(renamed, 'equity', 0), 'investment', 0);
    expect(getIn(removed, ['statements', 'profitDistribution', 'shareholders'])).toEqual([]);
    expect(getIn(removed, ['statements', 'assetSales'])).toEqual([]);
  });

  it('adds and removes currencies with their paths', () => {
    const frame = frameOf(complete());
    let draft = setInflation(complete(), true, frame);
    expect(getIn(draft, ['inflation'])).toEqual({ IRR: ['', '', '', ''], USD: ['', '', '', ''] });
    draft = addCurrency(draft, 'EUR', frame);
    expect(getIn(draft, ['exchangeRates', 'EUR'])).toEqual(['', '', '', '']);
    expect(getIn(draft, ['inflation', 'EUR'])).toHaveLength(4);
    draft = setIn(draft, ['inflation', 'IRR', 0], '0.3');
    draft = setLocalCurrency(draft, 'IRT', frame);
    expect(getIn(draft, ['inflation', 'IRT'])).toEqual(['0.3', '', '', '']);
    expect(getIn(draft, ['inflation', 'IRR'])).toBeUndefined();
    draft = removeCurrency(draft, 'USD');
    expect(Object.keys(getIn(draft, ['exchangeRates']) as object)).toEqual(['EUR']);
    expect(getIn(draft, ['inflation', 'USD'])).toBeUndefined();
    expect(getIn(setInflation(draft, false, frame), ['inflation'])).toBeUndefined();
  });
});

describe('issues', () => {
  it('accepts a complete draft as the input of the engine', () => {
    const check = checkDraft(complete());
    expect(check.ok).toBe(true);
  });

  it('places every missing input in its section, in words', () => {
    const check = checkDraft(emptyDraft());
    expect(check.ok).toBe(false);
    if (check.ok) return;
    const sections = new Set(check.issues.map((issue) => issue.section));
    expect(sections.has('assumptions')).toBe(true);
    expect(sections.has('workingCapital')).toBe(true);
    expect(check.issues.every((issue) => issue.message !== '')).toBe(true);

    const draft = complete();
    const broken = setIn(
      setIn(draft, ['investment', 'items', 0, 'amounts', 2], '12%'),
      ['operations', 'costs', 0, 'payablesCoverage'],
      undefined,
    );
    const result = checkDraft(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      {
        path: 'investment.items.0.amounts.2',
        section: 'investment',
        label: '«machinery» › مبلغ‌ها › ستون ۳',
        message: 'عدد معتبر وارد کنید (مثلاً ۰٫۱۸ یا ۱۲۵۰۰۰۰).',
      },
      expect.objectContaining({
        path: 'operations.costs.0.payablesCoverage',
        section: 'workingCapital',
        label: 'هزینه‌ها › «ore» › حساب‌های پرداختنی',
      }),
    ]);
  });

  it('reads the field paths of the engine', () => {
    expect(enginePath('investment.items[2].depreciation.startPeriod')).toBe(
      'investment.items.2.depreciation.startPeriod',
    );
    const issue = describeIssue('statements.profitDistribution.shareholders', 'x', complete());
    expect(issue.section).toBe('financing');
    expect(describeIssue('statements.tax.brackets.0.rate', 'x', complete()).label).toBe(
      'مالیات › پله‌ها › ردیف ۱ › نرخ',
    );
  });
});

describe('live calculation', () => {
  it('runs the engine on a complete draft and summarises the result', () => {
    const check = checkDraft(complete());
    if (!check.ok) throw new Error('incomplete');
    const outcome = calculate(check.input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { summary } = outcome;
    expect(summary.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Number(summary.totalCapital.npv)).toBeGreaterThan(0);
    expect(summary.totalCapital.irr).toBeDefined();
    expect(summary.totalCapital.paybackMonths).toBeDefined();
    // Conventions left open are listed by name.
    expect(summary.defaults).toContain('تاریخ مرجع تنزیل: پایان سال اول');
    expect(summary.warnings.every((warning) => !/^[a-z]+\./i.test(warning))).toBe(true);
  });

  it('returns the field and the Persian message of an input the engine refuses', () => {
    const draft = setIn(complete(), ['investment', 'items', 0, 'depreciation', 'startPeriod'], 0);
    const check = checkDraft(draft);
    if (!check.ok) throw new Error('incomplete');
    expect(calculate(check.input)).toEqual({
      ok: false,
      field: 'investment.items[0].depreciation.startPeriod',
      message:
        'شروع استهلاک باید اولین روز یکی از دوره‌های بهره‌برداری (راه‌اندازی یا تولید) باشد.',
    });
  });
});
