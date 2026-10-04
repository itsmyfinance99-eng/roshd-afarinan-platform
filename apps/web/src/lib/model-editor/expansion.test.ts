import { projectModel, type ProjectInput } from '@roshd/financial-engine';
import { describe, expect, it } from 'vitest';
import {
  emptyStartingBalances,
  removalNote,
  removeItem,
  renameItem,
  withStructure,
} from './draft-ops';
import { incremental } from './incremental';
import { checkDraft, describeIssue, enginePath } from './issues';
import { getIn, setIn, type Draft } from './paths';

const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
/** A small complete model of an existing enterprise: one machine, one product, one material. */
const existing = (): Draft => ({
  horizon: {
    calendar: 'SOLAR_HIJRI',
    start: { year: 1406, month: 1 },
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
        amounts: at({}),
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 60,
          salvageRate: '0',
          startPeriod: 1,
        },
      },
    ],
  },
  financing: {
    equity: [
      { key: 'founders', class: 'ORDINARY', currency: 'IRR', origin: 'LOCAL', amounts: at({}) },
    ],
    loans: [
      {
        key: 'bank',
        currency: 'IRR',
        origin: 'LOCAL',
        loan: {
          type: 'CONSTANT_PRINCIPAL',
          repaymentMonths: 12,
          flows: [],
          rates: [{ fromDay: 1, rate: '0.2' }],
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
            receivablesCoverage: none,
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
    ],
    cash: { localCoverage: none, foreignCoverage: none, depositShare: '0', depositRate: '0' },
  },
  statements: {
    tax: {
      brackets: [{ lowerLimit: '0', rate: '0.25' }],
      holidayYears: 0,
      lossCarryForwardYears: 0,
    },
    profitDistribution: { retainedShare: '1', shareholders: [] },
    discounting: { totalCapitalRate: '0.2', equityRate: '0.25' },
    referenceYear: 0,
  },
  startingBalances: {
    fixedAssets: [{ item: 'machinery', value: '1000' }],
    materials: [{ cost: 'ore', value: '40' }],
    workInProgress: [{ product: 'steel', value: '10' }],
    finishedProducts: [{ product: 'steel', quantity: '5', price: '6' }],
    receivables: { value: '100', collectionDays: 30 },
    payables: { value: '50', paymentDays: 60 },
    cashInHand: '0',
    shortTermDeposits: '0',
    cashSurplus: '20',
    loans: [{ loan: 'bank', balance: '300' }],
    equity: [{ equity: 'founders', value: '500' }],
  },
});

const engineInput = (draft: Draft): ProjectInput => {
  const check = checkDraft(draft);
  if (!check.ok) throw new Error(check.issues.map((issue) => issue.path).join(', '));
  return check.input;
};

describe('starting balances in the editor', () => {
  it('starts an expansion project with every balance still to be entered', () => {
    const draft = setIn(existing(), ['startingBalances'], emptyStartingBalances());
    const check = checkDraft(draft);
    expect(check.ok).toBe(false);
    const paths = check.ok ? [] : check.issues.map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'startingBalances.receivables.value',
        'startingBalances.receivables.collectionDays',
        'startingBalances.payables.value',
        'startingBalances.cashInHand',
        'startingBalances.shortTermDeposits',
        'startingBalances.cashSurplus',
      ]),
    );
    const issue = check.ok ? undefined : check.issues[0];
    expect(issue?.section).toBe('startingBalance');
  });

  it('gives a stored draft with starting balances its lists', () => {
    const draft = withStructure({ startingBalances: { cashSurplus: '5' } });
    expect(getIn(draft, ['startingBalances', 'fixedAssets'])).toEqual([]);
    expect(getIn(draft, ['startingBalances', 'receivables'])).toEqual({});
    expect(getIn(draft, ['startingBalances', 'cashSurplus'])).toBe('5');
    // A new project stays without them.
    expect(getIn(withStructure({}), ['startingBalances'])).toBeUndefined();
  });

  it('accepts a complete draft as the input of the engine', () => {
    const { statements } = projectModel(engineInput(existing())).value;
    // Machinery 1 000, stocks 40 + 10 + 30, receivables 100 and cash 20.
    expect(statements.startingBalance?.assets.total).toBe('1200');
    expect(statements.startingBalance?.liabilities.reserves).toBe('350');
  });

  it('renames the items of the starting balances with their items', () => {
    let draft = existing();
    draft = renameItem(draft, 'investment', 0, 'line');
    draft = renameItem(draft, 'cost', 0, 'scrap');
    draft = renameItem(draft, 'product', 0, 'rebar');
    draft = renameItem(draft, 'loan', 0, 'credit');
    draft = renameItem(draft, 'equity', 0, 'owners');
    const balances = getIn(draft, ['startingBalances']);
    expect(getIn(balances, ['fixedAssets', 0, 'item'])).toBe('line');
    expect(getIn(balances, ['materials', 0, 'cost'])).toBe('scrap');
    expect(getIn(balances, ['workInProgress', 0, 'product'])).toBe('rebar');
    expect(getIn(balances, ['finishedProducts', 0, 'product'])).toBe('rebar');
    expect(getIn(balances, ['loans', 0, 'loan'])).toBe('credit');
    expect(getIn(balances, ['equity', 0, 'equity'])).toBe('owners');
    expect(checkDraft(draft).ok).toBe(true);
  });

  it('removes the starting balance of an item with the item, and says so first', () => {
    const draft = existing();
    expect(removalNote(draft, 'loan', 0)).toBe('مانده آغازین آن هم حذف می‌شود.');
    expect(removalNote(draft, 'product', 0)).toBe(
      'هزینه‌های مستقیم این محصول هم حذف می‌شوند. مانده آغازین آن هم حذف می‌شود.',
    );
    const removed = removeItem(removeItem(draft, 'loan', 0), 'investment', 0);
    expect(getIn(removed, ['startingBalances', 'loans'])).toEqual([]);
    expect(getIn(removed, ['startingBalances', 'fixedAssets'])).toEqual([]);
    expect(getIn(removed, ['startingBalances', 'materials'])).toHaveLength(1);
    const withoutProduct = removeItem(draft, 'product', 0);
    expect(getIn(withoutProduct, ['startingBalances', 'finishedProducts'])).toEqual([]);
    expect(getIn(withoutProduct, ['startingBalances', 'workInProgress'])).toEqual([]);
    // Its direct costs go with it, and so does their starting stock.
    expect(getIn(withoutProduct, ['operations', 'costs'])).toEqual([]);
    expect(getIn(withoutProduct, ['startingBalances', 'materials'])).toEqual([]);
  });

  it('names a row by the item it belongs to only where the row has no name of its own', () => {
    // A cost item without a name yet is a numbered row, not its product.
    const unnamed = setIn(existing(), ['operations', 'costs', 0, 'key'], '');
    expect(describeIssue('operations.costs.0.key', 'پیام', unnamed).label).toBe(
      'هزینه‌ها › ردیف ۱ › نام',
    );
    const sold = setIn(existing(), ['statements', 'assetSales'], [{ item: 'machinery' }]);
    expect(describeIssue('statements.assetSales.0.period', 'پیام', sold).label).toBe(
      'فروش دارایی › «machinery» › دوره',
    );
  });

  it('names the place of a refused starting balance', () => {
    const draft = existing();
    const issue = describeIssue(enginePath('startingBalances.fixedAssets[0].value'), 'پیام', draft);
    expect(issue.section).toBe('startingBalance');
    expect(issue.label).toBe('ترازنامه آغازین › دارایی‌های ثابت موجود › «machinery» › مبلغ');
  });
});

describe('incremental analysis of two runs', () => {
  const base = projectModel(engineInput(existing())).value;
  // With the project: twenty units more in every year of production.
  const expanded = setIn(
    existing(),
    ['operations', 'products', 0, 'sales', 0, 'quantities'],
    at({ 1: '120', 2: '120', 3: '120' }),
  );
  const input = engineInput(expanded);
  const project = projectModel(input).value;

  it('gives the difference with its warnings in Persian', () => {
    const outcome = incremental(project, base, input.statements.discounting);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // 20 units at 10 less 4 of ore and a quarter of tax: 90 a year, without any investment.
    expect(outcome.analysis.totalCapital.net.map(Number)).toEqual([0, 90, 90, 90, 0]);
    expect(outcome.analysis.totalCapital.startingBalance).toBe('0');
    expect(outcome.analysis.totalCapital.irr).toBeUndefined();
    expect(outcome.placed.map((warning) => warning.indicator)).toEqual(
      expect.arrayContaining(['irr', 'payback']),
    );
    expect(outcome.placed[0]?.text).toMatch(/[؀-ۿ]/);
  });

  it('says in Persian why two runs cannot be compared', () => {
    const later = setIn(existing(), ['horizon', 'start', 'year'], 1407);
    const other = projectModel(engineInput(later)).value;
    const outcome = incremental(project, other, input.statements.discounting);
    expect(outcome).toEqual({
      ok: false,
      message:
        'افق برنامه‌ریزی دو حالت «با طرح» و «بدون طرح» باید یکسان باشد (همان دوره‌ها و همان زمان بازگشت ارزش اسقاط).',
    });
    // Results stored with another shape end in a message, not in a broken page.
    const broken = incremental(project, {} as never, input.statements.discounting);
    expect(broken.ok).toBe(false);
  });
});
