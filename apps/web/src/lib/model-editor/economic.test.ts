import { COST_CATEGORY_VALUES } from '@roshd/validation';
import { describe, expect, it } from 'vitest';
import {
  currencyUses,
  emptyCostBenefit,
  emptyEconomic,
  emptyEmployment,
  emptyIndirectForeignExchange,
  foreignLoanChoices,
  natureOf,
  naturesOf,
  removalNote,
  removeItem,
  removeSalesLine,
  renameItem,
  renameSalesLine,
  salesLineRemovalNote,
  setItemEntry,
  setLocalCurrency,
  tidyEconomicCost,
  withStructure,
} from './draft-ops';
import { frameOf, resizeDraft } from './frame';
import { checkDraft, describeIssue, enginePath } from './issues';
import { getIn, setIn, type Draft } from './paths';
import { calculate } from './summary';

/** The economic analysis in the editor (ST-37.05): it follows the model it belongs to. */

const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
const valuation = {
  tradeClass: 'TRADABLE',
  adjustmentFactor: '0.9',
  foreignCurrencyExposure: '0.5',
};

/** A small complete model with every part of the economic analysis. */
const complete = (): Draft => ({
  horizon: {
    calendar: 'SOLAR_HIJRI',
    start: { year: 1406, month: 1 },
    balanceMonth: 12,
    construction: { periods: 1, periodMonths: 12 },
    startup: { periods: 0, periodMonths: 12 },
    productionYears: 3,
  },
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
      {
        key: 'workers',
        category: 'LABOUR',
        product: 'steel',
        currency: 'IRR',
        origin: 'LOCAL',
        standard: { mode: 'PER_UNIT', quantity: '1', price: '1000000', fixedCost: '0' },
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
  economic: {
    discountRate: ['0.1', '0.1', '0.12', '0.12'],
    costs: [
      { item: 'ore', taxesIncluded: '0.1', valueAddedIncluded: ['0.2'] },
      { item: 'workers', skill: 'UNSKILLED', workers: '12' },
    ],
    investment: [{ item: 'machinery', taxesIncluded: '0.05' }],
    dividendTax: { local: '0', foreign: '0' },
    indirectForeignExchange: {
      outputs: [
        {
          product: 'steel',
          line: 'home',
          trade: 'IMPORTABLE',
          share: '1',
          borderPriceFactor: '0.9',
        },
      ],
      inputs: [{ item: 'ore', trade: 'EXPORTABLE', share: '0.5', borderPriceFactor: '1.1' }],
      otherInflows: [{ key: 'tourism', currency: 'IRR', amounts: at({ 2: '1000' }) }],
      otherOutflows: [],
    },
    employment: {
      inputSupplying: {
        unskilled: { workers: '5', wageBill: '100' },
        skilled: { workers: '1', wageBill: '50' },
        investment: '1000',
      },
      outputUsing: {
        unskilled: { workers: '0', wageBill: '0' },
        skilled: { workers: '0', wageBill: '0' },
        investment: '0',
      },
    },
    costBenefit: {
      numeraire: 'LOCAL_DOMESTIC_PRICES',
      standardConversionFactor: '0.8',
      outputs: [{ product: 'steel', line: 'home', ...valuation }],
      costs: [{ item: 'ore', ...valuation }],
      investment: [{ item: 'machinery', ...valuation }],
      foreignLoans: [],
      indirectBenefits: [{ key: 'training', currency: 'IRR', amounts: at({ 1: '500', 3: '700' }) }],
      indirectCosts: [],
    },
  },
});

const economic = (draft: Draft, ...path: (string | number)[]) =>
  getIn(draft, ['economic', ...path]);
const itemsOf = (draft: Draft, ...path: string[]) =>
  (economic(draft, ...path) as { item?: string }[]).map((entry) => entry.item);

describe('economic analysis of a draft', () => {
  it('is accepted by the schema and calculated by the engine', () => {
    const check = checkDraft(complete());
    expect(check.ok).toBe(true);
    if (check.ok) expect(calculate(check.input).ok).toBe(true);
  });

  it('gets its structure when it is stored without one', () => {
    expect(economic(withStructure({}))).toBeUndefined();
    const bare = withStructure({
      economic: { indirectForeignExchange: {}, employment: {}, costBenefit: {} },
    });
    expect(economic(bare)).toEqual({
      ...emptyEconomic(),
      indirectForeignExchange: emptyIndirectForeignExchange(),
      employment: emptyEmployment(),
      costBenefit: emptyCostBenefit(),
    });
    // What is there stays.
    const kept = withStructure(complete());
    expect(economic(kept)).toEqual(economic(complete()));
  });

  it('follows a cost item that is renamed or removed', () => {
    const renamed = renameItem(complete(), 'cost', 0, 'pellets');
    expect(itemsOf(renamed, 'costs')).toEqual(['pellets', 'workers']);
    expect(itemsOf(renamed, 'indirectForeignExchange', 'inputs')).toEqual(['pellets']);
    expect(itemsOf(renamed, 'costBenefit', 'costs')).toEqual(['pellets']);
    expect(checkDraft(renamed).ok).toBe(true);

    expect(removalNote(complete(), 'cost', 0)).toContain('تحلیل اقتصادی');
    const removed = removeItem(complete(), 'cost', 0);
    expect(itemsOf(removed, 'costs')).toEqual(['workers']);
    expect(itemsOf(removed, 'indirectForeignExchange', 'inputs')).toEqual([]);
    expect(itemsOf(removed, 'costBenefit', 'costs')).toEqual([]);
  });

  it('does not mention an entry that only names its item', () => {
    let draft = setIn(complete(), ['economic', 'investment'], [{ item: 'machinery' }]);
    draft = setIn(draft, ['economic', 'costBenefit', 'investment'], []);
    expect(removalNote(draft, 'investment', 0)).not.toContain('تحلیل اقتصادی');
  });

  it('follows an investment item, a product and a loan', () => {
    const asset = renameItem(complete(), 'investment', 0, 'line');
    expect(itemsOf(asset, 'investment')).toEqual(['line']);
    expect(itemsOf(asset, 'costBenefit', 'investment')).toEqual(['line']);
    expect(itemsOf(removeItem(complete(), 'investment', 0), 'investment')).toEqual([]);

    const product = renameItem(complete(), 'product', 0, 'rebar');
    expect(economic(product, 'indirectForeignExchange', 'outputs', 0, 'product')).toBe('rebar');
    expect(economic(product, 'costBenefit', 'outputs', 0, 'product')).toBe('rebar');
    // The direct costs of a product go with it, and so do their economic entries.
    const gone = removeItem(complete(), 'product', 0);
    expect(economic(gone, 'costs')).toEqual([]);
    expect(economic(gone, 'indirectForeignExchange', 'outputs')).toEqual([]);
    expect(economic(gone, 'indirectForeignExchange', 'inputs')).toEqual([]);
    expect(economic(gone, 'costBenefit', 'outputs')).toEqual([]);
    expect(economic(gone, 'costBenefit', 'costs')).toEqual([]);

    let loans = setIn(complete(), ['financing', 'loans'], [{ key: 'credit' }, { key: 'bank' }]);
    loans = setIn(loans, ['economic', 'costBenefit', 'foreignLoans'], ['credit', 'bank']);
    expect(
      economic(renameItem(loans, 'loan', 0, 'export-credit'), 'costBenefit', 'foreignLoans'),
    ).toEqual(['export-credit', 'bank']);
    expect(removalNote(loans, 'loan', 1)).toContain('تحلیل اقتصادی');
    expect(economic(removeItem(loans, 'loan', 1), 'costBenefit', 'foreignLoans')).toEqual([
      'credit',
    ]);
  });

  it('follows a sales line that is renamed or removed', () => {
    const renamed = renameSalesLine(complete(), 0, 0, 'domestic');
    expect(getIn(renamed, ['operations', 'products', 0, 'sales', 0, 'key'])).toBe('domestic');
    expect(economic(renamed, 'indirectForeignExchange', 'outputs', 0, 'line')).toBe('domestic');
    expect(economic(renamed, 'costBenefit', 'outputs', 0, 'line')).toBe('domestic');
    expect(checkDraft(renamed).ok).toBe(true);
    expect(salesLineRemovalNote(complete(), 0, 0)).toContain('تحلیل اقتصادی');
    const removed = removeSalesLine(complete(), 0, 0);
    expect(economic(removed, 'indirectForeignExchange', 'outputs')).toEqual([]);
    expect(economic(removed, 'costBenefit', 'outputs')).toEqual([]);
    // A line of the same name of another product is another line.
    let two = setIn(complete(), ['operations', 'products', 1], {
      key: 'wire',
      sales: [{ key: 'home' }],
    });
    two = renameSalesLine(two, 1, 0, 'shops');
    expect(economic(two, 'costBenefit', 'outputs', 0, 'line')).toBe('home');
  });

  it('keeps a chosen loan in the list when it is no longer foreign', () => {
    let draft = setIn(
      complete(),
      ['financing', 'loans'],
      [
        { key: 'credit', origin: 'FOREIGN' },
        { key: 'bank', origin: 'LOCAL' },
        { key: '', origin: 'FOREIGN' },
      ],
    );
    expect(foreignLoanChoices(draft)).toEqual([{ name: 'credit', foreign: true }]);
    draft = setIn(draft, ['economic', 'costBenefit', 'foreignLoans'], ['credit', 'bank', 'gone']);
    // The calculation refuses «bank» and «gone»: they stay listed so that they can be taken out.
    expect(foreignLoanChoices(draft)).toEqual([
      { name: 'credit', foreign: true },
      { name: 'bank', foreign: false },
      { name: 'gone', foreign: false },
    ]);
    expect(foreignLoanChoices(setIn(draft, ['economic'], undefined))).toEqual([
      { name: 'credit', foreign: true },
    ]);
  });

  it('follows the code of the local currency and counts its uses', () => {
    // A sales line without economic entries is removed without a note about them.
    const plain = setIn(complete(), ['economic', 'costBenefit', 'outputs'], []);
    expect(
      salesLineRemovalNote(
        setIn(plain, ['economic', 'indirectForeignExchange', 'outputs'], []),
        0,
        0,
      ),
    ).toBe('');
    // The numeraire of the cost-benefit analysis is a use of its currency.
    expect(currencyUses(complete(), 'USD')).toBe(1);
    const numeraire = setIn(
      setIn(complete(), ['economic', 'costBenefit', 'numeraire'], 'FOREIGN_BORDER_PRICES'),
      ['economic', 'costBenefit', 'currency'],
      'USD',
    );
    expect(currencyUses(numeraire, 'USD')).toBe(2);
    expect(currencyUses(complete(), 'IRR')).toBe(6);
    const renamed = setLocalCurrency(complete(), 'IRT', frameOf(complete()));
    expect(economic(renamed, 'indirectForeignExchange', 'otherInflows', 0, 'currency')).toBe('IRT');
    expect(economic(renamed, 'costBenefit', 'indirectBenefits', 0, 'currency')).toBe('IRT');
  });

  it('keeps its series with their periods when the horizon changes', () => {
    const draft = complete();
    const previous = frameOf(draft);
    // One more year of construction: the production periods move with the start of production.
    const longer = setIn(draft, ['horizon', 'construction', 'periods'], 2);
    const frame = frameOf(longer);
    if (!frame || !previous) throw new Error('no frame');
    const resized = resizeDraft(longer, frame, previous);
    expect(economic(resized, 'discountRate')).toEqual(['0.1', '', '0.1', '0.12', '0.12']);
    expect(economic(resized, 'costBenefit', 'indirectBenefits', 0, 'amounts')).toEqual([
      '0',
      '0',
      '500',
      '0',
      '700',
    ]);
    expect(economic(resized, 'indirectForeignExchange', 'otherInflows', 0, 'amounts')).toEqual([
      '0',
      '0',
      '0',
      '1000',
      '0',
    ]);
    // One rate for the whole horizon stays one rate.
    const single = setIn(longer, ['economic', 'discountRate'], '0.1');
    expect(economic(resizeDraft(single, frame, previous), 'discountRate')).toBe('0.1');
  });

  it('writes the adjustments of an item into its entry, made when needed', () => {
    const list = ['economic', 'investment'] as const;
    const empty = setIn(complete(), list, []);
    // Clearing a field of an item without an entry makes none.
    expect(setItemEntry(empty, list, 'machinery', ['taxesIncluded'], undefined)).toBe(empty);
    const made = setItemEntry(empty, list, 'machinery', ['taxesIncluded'], '0.1');
    expect(getIn(made, list)).toEqual([{ item: 'machinery', taxesIncluded: '0.1' }]);
    const changed = setItemEntry(made, list, 'machinery', ['taxesIncluded'], '0.2');
    expect(getIn(changed, list)).toEqual([{ item: 'machinery', taxesIncluded: '0.2' }]);
  });

  it('drops the adjustments a new category or nature does not take', () => {
    const category = (draft: Draft, index: number, value: string) =>
      setIn(draft, ['operations', 'costs', index, 'category'], value);
    // Labour that becomes a material loses its skill and headcount.
    const material = tidyEconomicCost(category(complete(), 1, 'ENERGY'), 'workers');
    expect(economic(material, 'costs', 1)).toEqual({ item: 'workers' });
    // A material that becomes an overhead keeps everything until its nature is chosen…
    const overhead = category(complete(), 0, 'FACTORY_OVERHEADS');
    expect(tidyEconomicCost(overhead, 'ore')).toBe(overhead);
    // …and loses the value added included once it is wages.
    const wages = tidyEconomicCost(
      setIn(overhead, ['economic', 'costs', 0, 'nature'], 'WAGES'),
      'ore',
    );
    expect(economic(wages, 'costs', 0)).toEqual({
      item: 'ore',
      nature: 'WAGES',
      taxesIncluded: '0.1',
    });
    // A nature the new category also allows stays; one it does not allow goes.
    const marketing = tidyEconomicCost(category(wages, 0, 'MARKETING_OVERHEADS'), 'ore');
    expect(economic(marketing, 'costs', 0, 'nature')).toBe('WAGES');
    const administrative = tidyEconomicCost(
      category(
        setIn(marketing, ['economic', 'costs', 0, 'nature'], 'OTHER'),
        0,
        'ADMINISTRATIVE_OVERHEADS',
      ),
      'ore',
    );
    expect(economic(administrative, 'costs', 0, 'nature')).toBeUndefined();
    const leasing = tidyEconomicCost(category(wages, 0, 'LEASING'), 'ore');
    expect(economic(leasing, 'costs', 0)).toEqual({ item: 'ore' });
    // An item without an entry is left alone.
    expect(tidyEconomicCost(complete(), 'nothing')).toEqual(complete());
  });

  it('knows the nature of every category exactly as the engine does', () => {
    expect(natureOf('RAW_MATERIALS', undefined)).toBe('MATERIALS');
    expect(natureOf('FACTORY_OVERHEADS', undefined)).toBeUndefined();
    expect(natureOf('FACTORY_OVERHEADS', 'OTHER')).toBeUndefined();
    expect(natureOf('DIRECT_MARKETING', 'OTHER')).toBe('OTHER');
    expect(naturesOf('')).toEqual([]);
    for (const value of COST_CATEGORY_VALUES) {
      // The same item, in every category, with every nature and with none.
      let draft = setIn(complete(), ['operations', 'costs', 0, 'category'], value);
      if (!naturesOf(value).includes('MATERIALS') || naturesOf(value).length > 1) {
        draft = setIn(draft, ['operations', 'costs', 0, 'stockCoverage'], undefined);
      }
      draft = setIn(draft, ['economic', 'indirectForeignExchange', 'inputs'], []);
      const outcome = (nature?: string) => {
        const entry = { item: 'ore', ...(nature === undefined ? {} : { nature }) };
        const check = checkDraft(
          setIn(
            draft,
            ['economic', 'costs'],
            [entry, { item: 'workers', skill: 'SKILLED', workers: '1' }],
          ),
        );
        if (!check.ok) throw new Error(`${value}: ${check.issues[0]?.message}`);
        const result = calculate(check.input);
        return result.ok ? '' : result.message;
      };
      // Without a nature the engine asks for one exactly when the category leaves it open.
      expect(/مواد و خدمات است، دستمزد یا سایر/.test(outcome()), value).toBe(
        naturesOf(value).length > 1,
      );
      // And it takes exactly the natures the form offers.
      for (const nature of ['MATERIALS', 'WAGES', 'OTHER']) {
        const refused = /این نوع برای گروه هزینه این قلم مجاز نیست/.test(outcome(nature));
        expect(refused, `${value} as ${nature}`).toBe(!naturesOf(value).includes(nature));
      }
    }
    // Four calculations of the whole model for each of the twelve categories.
  }, 60_000);

  it('places what the calculation needs in the section, in words', () => {
    const draft = complete();
    const issue = describeIssue(enginePath('economic.costs[1].workers'), 'پیام', draft);
    expect(issue.section).toBe('economic');
    expect(issue.label).toBe('هزینه‌ها › «workers» › تعداد شاغلان');
    expect(describeIssue('economic.discountRate.2', 'پیام', draft).label).toBe(
      'نرخ تنزیل اقتصادی › ستون ۳',
    );
    expect(
      describeIssue('economic.costBenefit.outputs.0.adjustmentFactor', 'پیام', draft).label,
    ).toBe('هزینه-فایده › ستانده‌ها › «steel» › ضریب تعدیل');
    expect(
      describeIssue('economic.employment.outputUsing.skilled.wageBill', 'پیام', draft).label,
    ).toBe('اشتغال › مصرف‌کنندگان ستانده › نیروی ماهر › دستمزد سالانه');
    const loans = setIn(draft, ['economic', 'costBenefit', 'foreignLoans'], ['credit']);
    expect(describeIssue('economic.costBenefit.foreignLoans.0', 'پیام', loans).label).toBe(
      'هزینه-فایده › تسهیلات خارجی › «credit»',
    );
    // A missing rate is reported by the schema at its own field.
    const check = checkDraft(setIn(draft, ['economic', 'discountRate'], undefined));
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.issues.map((found) => [found.section, found.path])).toEqual([
        ['economic', 'economic.discountRate'],
      ]);
    }
  });

  it('reports the headcount the employment schedule needs at the wage item', () => {
    const draft = setIn(complete(), ['economic', 'costs', 1, 'workers'], undefined);
    const check = checkDraft(draft);
    if (!check.ok) throw new Error('not complete');
    const outcome = calculate(check.input);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(enginePath(outcome.field ?? '')).toBe('economic.costs.1.workers');
      expect(outcome.message).toContain('workers');
    }
  });
});
