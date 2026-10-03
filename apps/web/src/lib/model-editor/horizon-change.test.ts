import { describe, expect, it } from 'vitest';
import {
  canonical,
  currencyUses,
  removalNote,
  removeItem,
  renameItem,
  setInflation,
  setLocalCurrency,
} from './draft-ops';
import { droppedPeriods, frameOfHorizon, periodMap, resizeDraft, type Frame } from './frame';
import { describeIssue } from './issues';
import { getIn, type Draft } from './paths';

const horizon = (changes: Record<string, unknown> = {}) => ({
  calendar: 'SOLAR_HIJRI',
  start: { year: 1406, month: 1 },
  balanceMonth: 12,
  construction: { periods: 1, periodMonths: 12 },
  startup: { periods: 0, periodMonths: 12 },
  productionYears: 3,
  ...changes,
});
const frame = (changes: Record<string, unknown> = {}): Frame => {
  const result = frameOfHorizon(horizon(changes));
  if (!result) throw new Error('invalid horizon');
  return result;
};

/** A draft entered for one construction year and three production years. */
const draft = (): Draft => ({
  horizon: horizon(),
  localCurrency: 'IRR',
  exchangeRates: { USD: ['600', '610', '620', '630'] },
  investment: {
    items: [
      {
        key: 'machinery',
        currency: 'USD',
        amounts: ['1000', '0', '0', '50'],
        depreciation: { startPeriod: 1 },
      },
    ],
  },
  financing: {
    equity: [{ key: 'founders', currency: 'IRR', amounts: ['700', '0', '0', '0'] }],
    loans: [{ key: 'bank', currency: 'USD', depreciation: { startPeriod: 2 } }],
  },
  operations: {
    products: [
      {
        key: 'steel',
        production: { firstPeriod: 1, lastPeriod: 3 },
        sales: [
          {
            key: 'home',
            currency: 'IRR',
            quantities: ['0', '100', '200', '300'],
            price: ['', '10', '11', '12'],
          },
        ],
      },
    ],
    costs: [
      { key: 'ore', product: 'steel', currency: 'IRR' },
      {
        key: 'office',
        currency: 'IRR',
        allocation: { key: 'SHARES', shares: { steel: '1' } },
      },
    ],
    costCentres: [{ key: 'plant', products: ['steel'] }],
  },
  statements: {
    assetSales: [{ item: 'machinery', period: 3, proceeds: '10' }],
    profitDistribution: {
      retainedShare: ['1', '0.5', '0.4'],
      shareholders: [{ equity: 'founders', ordinaryShare: '1' }],
    },
    discounting: { totalCapitalRate: '0.2' },
    referenceYear: 2,
  },
});

describe('a change of the horizon', () => {
  it('keeps the values of every phase when a construction period is added', () => {
    const next = frame({ construction: { periods: 2, periodMonths: 12 } });
    expect(periodMap(frame(), next)).toEqual([0, -1, 1, 2, 3]);
    const result = resizeDraft(draft(), next, frame());
    // Production values stay in production periods: nothing is sold during construction.
    expect(getIn(result, ['operations', 'products', 0, 'sales', 0, 'quantities'])).toEqual([
      '0',
      '0',
      '100',
      '200',
      '300',
    ]);
    expect(getIn(result, ['operations', 'products', 0, 'sales', 0, 'price'])).toEqual([
      '',
      '',
      '10',
      '11',
      '12',
    ]);
    // The rate of the new period is asked, never copied.
    expect(getIn(result, ['exchangeRates', 'USD'])).toEqual(['600', '', '610', '620', '630']);
    expect(getIn(result, ['investment', 'items', 0, 'amounts'])).toEqual([
      '1000',
      '0',
      '0',
      '0',
      '50',
    ]);
    // Inputs that name a period move with it.
    expect(getIn(result, ['investment', 'items', 0, 'depreciation', 'startPeriod'])).toBe(2);
    expect(getIn(result, ['financing', 'loans', 0, 'depreciation', 'startPeriod'])).toBe(3);
    expect(getIn(result, ['operations', 'products', 0, 'production'])).toEqual({
      firstPeriod: 2,
      lastPeriod: 4,
    });
    expect(getIn(result, ['statements', 'assetSales', 0, 'period'])).toBe(4);
    // Production years are the same years.
    expect(getIn(result, ['statements', 'profitDistribution', 'retainedShare'])).toEqual([
      '1',
      '0.5',
      '0.4',
    ]);
    expect(getIn(result, ['statements', 'referenceYear'])).toBe(2);
  });

  it('drops what belongs to removed periods and says how many', () => {
    const next = frame({ construction: { periods: 0, periodMonths: 12 }, productionYears: 2 });
    expect(droppedPeriods(frame(), next)).toBe(2);
    const result = resizeDraft(draft(), next, frame());
    expect(getIn(result, ['operations', 'products', 0, 'sales', 0, 'quantities'])).toEqual([
      '100',
      '200',
    ]);
    expect(getIn(result, ['exchangeRates', 'USD'])).toEqual(['610', '620']);
    expect(getIn(result, ['investment', 'items', 0, 'depreciation', 'startPeriod'])).toBe(0);
    // The sale was in the third production year, which no longer exists: it is asked again.
    expect(getIn(result, ['statements', 'assetSales', 0, 'period'])).toBeUndefined();
    expect(getIn(result, ['operations', 'products', 0, 'production'])).toEqual({ firstPeriod: 0 });
    expect(getIn(result, ['statements', 'referenceYear'])).toBeUndefined();
    expect(getIn(result, ['statements', 'profitDistribution', 'retainedShare'])).toEqual([
      '1',
      '0.5',
    ]);
  });

  it('keeps nothing of a phase whose period length changed', () => {
    const quarters = frame({ construction: { periods: 4, periodMonths: 3 } });
    expect(periodMap(frame(), quarters)).toEqual([-1, -1, -1, -1, 1, 2, 3]);
    const result = resizeDraft(draft(), quarters, frame());
    expect(getIn(result, ['investment', 'items', 0, 'amounts'])).toEqual([
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '50',
    ]);
    expect(droppedPeriods(frame(), quarters)).toBe(1);
  });

  it('replaces the first production year by a start-up phase and leaves the later years', () => {
    const next = frame({ startup: { periods: 2, periodMonths: 6 } });
    expect(next.periods.map((p) => p.phase)).toEqual([
      'CONSTRUCTION',
      'STARTUP',
      'STARTUP',
      'PRODUCTION',
      'PRODUCTION',
    ]);
    // The half-years are new; 1408 and 1409 keep their own values.
    expect(periodMap(frame(), next)).toEqual([0, -1, -1, 2, 3]);
    expect(droppedPeriods(frame(), next)).toBe(1);
    const result = resizeDraft(draft(), next, frame());
    expect(getIn(result, ['operations', 'products', 0, 'sales', 0, 'quantities'])).toEqual([
      '0',
      '0',
      '0',
      '200',
      '300',
    ]);
    expect(getIn(result, ['exchangeRates', 'USD'])).toEqual(['600', '', '', '620', '630']);
    // Depreciation started on the first day of production: it still does.
    expect(getIn(result, ['investment', 'items', 0, 'depreciation', 'startPeriod'])).toBe(1);
    // The loan's started with 1408, the production interval ran from the start to the end of 1409.
    expect(getIn(result, ['financing', 'loans', 0, 'depreciation', 'startPeriod'])).toBe(3);
    expect(getIn(result, ['operations', 'products', 0, 'production'])).toEqual({
      firstPeriod: 1,
      lastPeriod: 4,
    });
    // The sale at the end of 1409 stays at the end of 1409.
    expect(getIn(result, ['statements', 'assetSales', 0, 'period'])).toBe(4);
  });

  it('gives the first year back when the start-up phase is removed', () => {
    const withStartup = frame({ startup: { periods: 4, periodMonths: 3 } });
    const entered: Draft = {
      horizon: horizon({ startup: { periods: 4, periodMonths: 3 } }),
      exchangeRates: { USD: ['1', '2', '3', '4', '5', '6', '7'] },
      investment: {
        items: [
          {
            key: 'a',
            amounts: ['9', '0', '0', '0', '0', '0', '0'],
            depreciation: { startPeriod: 3 },
          },
        ],
      },
    };
    const result = resizeDraft(entered, frame(), withStartup);
    // The quarters are gone; the year that replaces them is asked, the later years keep theirs.
    expect(getIn(result, ['exchangeRates', 'USD'])).toEqual(['1', '', '6', '7']);
    expect(droppedPeriods(withStartup, frame())).toBe(4);
    // Depreciation started with the third quarter: no period begins there any more.
    expect(
      getIn(result, ['investment', 'items', 0, 'depreciation', 'startPeriod']),
    ).toBeUndefined();
  });

  it('keeps no production value when the financial year moves', () => {
    const june = frame({ balanceMonth: 6 });
    // Production starts in month 13; its first year is now six months long.
    expect(june.periods[1]?.months).toBe(6);
    const map = periodMap(frame(), june);
    expect(map[0]).toBe(0);
    expect(map.slice(1).every((from) => from === -1)).toBe(true);
    expect(droppedPeriods(frame(), june)).toBe(3);
  });

  it('keeps no production value when production starts inside the financial year', () => {
    const before = frame({ construction: { periods: 2, periodMonths: 6 } });
    const after = frame({ construction: { periods: 3, periodMonths: 6 } });
    // Half a year more of construction: the first production year is six months long now.
    expect(after.periods.map((p) => p.months)).toEqual([6, 6, 6, 6, 12, 12]);
    expect(periodMap(before, after)).toEqual([0, 1, -1, -1, -1, -1]);
    expect(droppedPeriods(before, after)).toBe(3);
  });

  it('asks again for a period input that pointed outside the horizon', () => {
    const wrong: Draft = {
      horizon: horizon(),
      investment: {
        items: [{ key: 'a', amounts: ['0', '0', '0', '0'], depreciation: { startPeriod: 9 } }],
      },
    };
    const result = resizeDraft(wrong, frame(), frame());
    expect(
      getIn(result, ['investment', 'items', 0, 'depreciation', 'startPeriod']),
    ).toBeUndefined();
  });

  it('changes nothing when the same horizon is applied', () => {
    const same = draft();
    expect(resizeDraft(same, frame(), frame())).toBe(same);
  });
});

describe('names and their references', () => {
  it('keeps the references when a name is cleared and typed again', () => {
    const cleared = renameItem(draft(), 'equity', 0, '');
    expect(getIn(cleared, ['statements', 'profitDistribution', 'shareholders', 0, 'equity'])).toBe(
      '',
    );
    const renamed = renameItem(cleared, 'equity', 0, 'owners');
    expect(getIn(renamed, ['statements', 'profitDistribution', 'shareholders'])).toEqual([
      { equity: 'owners', ordinaryShare: '1' },
    ]);
    const product = renameItem(renameItem(draft(), 'product', 0, ''), 'product', 0, 'rebar');
    expect(getIn(product, ['operations', 'costs', 0, 'product'])).toBe('rebar');
    expect(getIn(product, ['operations', 'costs', 1, 'allocation', 'shares'])).toEqual({
      rebar: '1',
    });
    expect(getIn(product, ['operations', 'costCentres', 0, 'products'])).toEqual(['rebar']);
    // An indirect cost has no product and is never taken for one with an empty name.
    expect(getIn(product, ['operations', 'costs', 1, 'product'])).toBeUndefined();
  });

  it('removes a product with its direct costs and every reference', () => {
    expect(removalNote(draft(), 'product', 0)).toBe('هزینه‌های مستقیم این محصول هم حذف می‌شوند.');
    const result = removeItem(draft(), 'product', 0);
    expect(getIn(result, ['operations', 'products'])).toEqual([]);
    expect(getIn(result, ['operations', 'costs'])).toEqual([
      { key: 'office', currency: 'IRR', allocation: { key: 'SHARES', shares: {} } },
    ]);
    expect(getIn(result, ['operations', 'costCentres', 0, 'products'])).toEqual([]);
    expect(removalNote(draft(), 'costCentre', 0)).toBe('');
  });
});

describe('currencies', () => {
  it('moves every input of the local currency to its new code', () => {
    const noted: Draft = { ...draft(), notes: { 'inflation.IRR': { source: 'بانک مرکزی' } } };
    const inflated = setInflation(noted, true, frame());
    const result = setLocalCurrency(inflated, 'IRT', frame());
    expect(result.localCurrency).toBe('IRT');
    expect(getIn(result, ['financing', 'equity', 0, 'currency'])).toBe('IRT');
    expect(getIn(result, ['operations', 'products', 0, 'sales', 0, 'currency'])).toBe('IRT');
    expect(getIn(result, ['operations', 'costs', 0, 'currency'])).toBe('IRT');
    // Inputs in another currency are not touched.
    expect(getIn(result, ['investment', 'items', 0, 'currency'])).toBe('USD');
    expect(Object.keys(getIn(result, ['inflation']) as object).sort()).toEqual(['IRT', 'USD']);
    expect(getIn(result, ['notes'])).toEqual({ 'inflation.IRT': { source: 'بانک مرکزی' } });
    expect(currencyUses(result, 'USD')).toBe(2);
    expect(currencyUses(result, 'IRR')).toBe(0);
  });

  it('keeps the items of the local currency when its code is cleared and typed again', () => {
    const cleared = setLocalCurrency(draft(), '', frame());
    expect(getIn(cleared, ['financing', 'equity', 0, 'currency'])).toBe('');
    const typed = setLocalCurrency(cleared, 'IRT', frame());
    expect(getIn(typed, ['financing', 'equity', 0, 'currency'])).toBe('IRT');
    expect(getIn(typed, ['operations', 'costs', 1, 'currency'])).toBe('IRT');
    expect(getIn(typed, ['investment', 'items', 0, 'currency'])).toBe('USD');
  });

  it('keeps the escalation of prices when inflation is turned off', () => {
    const escalated: Draft = {
      ...draft(),
      inflation: { IRR: ['0.3'] },
      investment: { items: [{ key: 'a', escalation: '0.02', firstYearEscalator: 0 }] },
    };
    const result = setInflation(escalated, false, frame());
    expect(result.inflation).toBeUndefined();
    expect(getIn(result, ['investment', 'items', 0, 'escalation'])).toBe('0.02');
  });
});

describe('helpers', () => {
  it('compares content whatever the order of the keys', () => {
    expect(canonical({ b: [1, { d: 1, c: 2 }], a: 'x' })).toBe(
      canonical({ a: 'x', b: [1, { c: 2, d: 1 }] }),
    );
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: '1' }));
    expect(canonical(undefined)).toBe('null');
  });

  it('does not read labels from the prototype of the label table', () => {
    const named: Draft = { operations: { products: [{ key: 'x' }] } };
    expect(describeIssue('operations.products.0.constructor', 'm', named).label).toBe(
      'محصولات › «x» › constructor',
    );
  });
});
