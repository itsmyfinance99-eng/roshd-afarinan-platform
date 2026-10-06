import { MATERIAL_COST_CATEGORIES } from '@roshd/validation';
import { ECONOMIC_SERIES_LISTS, fit, type Frame } from './frame';
import {
  append,
  getIn,
  listAt,
  recordAt,
  removeAt,
  setIn,
  textAt,
  type Draft,
  type Path,
} from './paths';

/**
 * Edits of the draft that touch more than one place: named items referred to elsewhere (a product
 * by its costs, a contribution by its dividends…) and currencies.
 */

/** A new, empty model: the structure of the input without any value. */
export function emptyDraft(): Draft {
  return {
    exchangeRates: {},
    investment: { items: [] },
    financing: { equity: [], loans: [] },
    operations: { products: [], costs: [], cash: {} },
    statements: {
      tax: { brackets: [] },
      profitDistribution: { shareholders: [] },
      discounting: {},
    },
  };
}

/** The draft with every section present, whatever was stored. */
export function withStructure(inputs: unknown): Draft {
  const stored =
    inputs !== null && typeof inputs === 'object' && !Array.isArray(inputs)
      ? (inputs as Draft)
      : {};
  let draft: Draft = stored;
  const ensure = (path: Path, fallback: unknown, list: boolean) => {
    const value = getIn(draft, path);
    const ok = list
      ? Array.isArray(value)
      : value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!ok) draft = setIn(draft, path, fallback);
  };
  ensure(['exchangeRates'], {}, false);
  ensure(['investment', 'items'], [], true);
  ensure(['financing', 'equity'], [], true);
  ensure(['financing', 'loans'], [], true);
  ensure(['operations', 'products'], [], true);
  ensure(['operations', 'costs'], [], true);
  ensure(['operations', 'cash'], {}, false);
  ensure(['statements', 'tax', 'brackets'], [], true);
  ensure(['statements', 'profitDistribution', 'shareholders'], [], true);
  ensure(['statements', 'discounting'], {}, false);
  // Starting balances exist for an expansion project only.
  if (getIn(draft, ['startingBalances']) !== undefined) {
    ensure(['startingBalances'], emptyStartingBalances(), false);
    for (const list of STARTING_LISTS) ensure(['startingBalances', list], [], true);
    ensure(['startingBalances', 'receivables'], {}, false);
    ensure(['startingBalances', 'payables'], {}, false);
  }
  // So has the economic analysis, and each of its optional parts.
  if (getIn(draft, ECONOMIC) !== undefined) {
    ensure(ECONOMIC, emptyEconomic(), false);
    ensure([...ECONOMIC, 'costs'], [], true);
    ensure([...ECONOMIC, 'investment'], [], true);
    ensure([...ECONOMIC, 'dividendTax'], {}, false);
    if (getIn(draft, INDIRECT) !== undefined) {
      ensure(INDIRECT, emptyIndirectForeignExchange(), false);
      for (const list of INDIRECT_LISTS) ensure([...INDIRECT, list], [], true);
    }
    if (getIn(draft, EMPLOYMENT) !== undefined) {
      ensure(EMPLOYMENT, emptyEmployment(), false);
      for (const group of EMPLOYMENT_GROUPS) {
        ensure([...EMPLOYMENT, group], {}, false);
        ensure([...EMPLOYMENT, group, 'unskilled'], {}, false);
        ensure([...EMPLOYMENT, group, 'skilled'], {}, false);
      }
    }
    if (getIn(draft, COST_BENEFIT) !== undefined) {
      ensure(COST_BENEFIT, emptyCostBenefit(), false);
      for (const list of COST_BENEFIT_LISTS) ensure([...COST_BENEFIT, list], [], true);
    }
  }
  return draft;
}

const ECONOMIC: Path = ['economic'];
const INDIRECT: Path = ['economic', 'indirectForeignExchange'];
const EMPLOYMENT: Path = ['economic', 'employment'];
const COST_BENEFIT: Path = ['economic', 'costBenefit'];
const INDIRECT_LISTS = ['outputs', 'inputs', 'otherInflows', 'otherOutflows'] as const;
const EMPLOYMENT_GROUPS = ['inputSupplying', 'outputUsing'] as const;
const COST_BENEFIT_LISTS = [
  'outputs',
  'costs',
  'investment',
  'foreignLoans',
  'indirectBenefits',
  'indirectCosts',
] as const;

/** The economic analysis without any value: the rate and the taxes are to be entered. */
export function emptyEconomic(): Draft {
  return { costs: [], investment: [], dividendTax: {} };
}

export function emptyIndirectForeignExchange(): Draft {
  return Object.fromEntries(INDIRECT_LISTS.map((list) => [list, []]));
}

export function emptyEmployment(): Draft {
  return Object.fromEntries(
    EMPLOYMENT_GROUPS.map((group) => [group, { unskilled: {}, skilled: {} }]),
  );
}

export function emptyCostBenefit(): Draft {
  return Object.fromEntries(COST_BENEFIT_LISTS.map((list) => [list, []]));
}

/**
 * Writes a value into the entry of a named item in a list of the economic analysis; the entry is
 * made when the item has none yet.
 */
export function setItemEntry(
  draft: Draft,
  list: Path,
  name: string,
  rest: Path,
  value: unknown,
): Draft {
  const entries = listAt(draft, list);
  const found = entries.findIndex((entry) => getIn(entry, ['item']) === name);
  if (found >= 0) return setIn(draft, [...list, found, ...rest], value);
  // Nothing to remove from an entry that does not exist.
  if (value === undefined) return draft;
  return setIn(append(draft, list, { item: name }), [...list, entries.length, ...rest], value);
}

const STARTING_LISTS = [
  'fixedAssets',
  'materials',
  'workInProgress',
  'finishedProducts',
  'loans',
  'equity',
] as const;

/** The starting balances of an existing enterprise without any value: all are to be entered. */
export function emptyStartingBalances(): Draft {
  return {
    ...Object.fromEntries(STARTING_LISTS.map((list) => [list, []])),
    receivables: {},
    payables: {},
  };
}

export type NamedKind = 'investment' | 'equity' | 'product' | 'costCentre' | 'cost' | 'loan';

const LISTS: Record<NamedKind, Path> = {
  investment: ['investment', 'items'],
  equity: ['financing', 'equity'],
  product: ['operations', 'products'],
  costCentre: ['operations', 'costCentres'],
  cost: ['operations', 'costs'],
  loan: ['financing', 'loans'],
};

/** Starting balances that belong to a named item: the list and the property holding its name. */
const STARTING: Record<NamedKind, readonly (readonly [list: string, property: string])[]> = {
  investment: [['fixedAssets', 'item']],
  equity: [['equity', 'equity']],
  product: [
    ['workInProgress', 'product'],
    ['finishedProducts', 'product'],
  ],
  costCentre: [],
  cost: [['materials', 'cost']],
  loan: [['loans', 'loan']],
};

/** Entries of the economic analysis that belong to a named item: the list and the property. */
const ECONOMIC_REFS: Record<NamedKind, readonly (readonly [list: Path, property: string])[]> = {
  investment: [
    [[...ECONOMIC, 'investment'], 'item'],
    [[...COST_BENEFIT, 'investment'], 'item'],
  ],
  equity: [],
  product: [
    [[...INDIRECT, 'outputs'], 'product'],
    [[...COST_BENEFIT, 'outputs'], 'product'],
  ],
  costCentre: [],
  cost: [
    [[...ECONOMIC, 'costs'], 'item'],
    [[...INDIRECT, 'inputs'], 'item'],
    [[...COST_BENEFIT, 'costs'], 'item'],
  ],
  loan: [],
};
/** Loans taken into the cost-benefit analysis: a list of their names. */
const FOREIGN_LOANS: Path = [...COST_BENEFIT, 'foreignLoans'];
/** Sales lines of the economic analysis: entries with the names of a product and of its line. */
const ECONOMIC_OUTPUTS: readonly Path[] = [
  [...INDIRECT, 'outputs'],
  [...COST_BENEFIT, 'outputs'],
];

const SHAREHOLDERS: Path = ['statements', 'profitDistribution', 'shareholders'];
const ASSET_SALES: Path = ['statements', 'assetSales'];
const COSTS: Path = ['operations', 'costs'];
const CENTRES: Path = ['operations', 'costCentres'];

const mapList = (draft: Draft, path: Path, map: (item: Draft) => Draft): Draft => {
  const list = getIn(draft, path);
  if (!Array.isArray(list)) return draft;
  return setIn(
    draft,
    path,
    list.map((item: unknown) =>
      item !== null && typeof item === 'object' ? map(item as Draft) : item,
    ),
  );
};

const filterList = (draft: Draft, path: Path, keep: (item: unknown) => boolean): Draft => {
  const list = getIn(draft, path);
  return Array.isArray(list) ? setIn(draft, path, list.filter(keep)) : draft;
};

/** Where the name of item `index` is stored. */
export const namePath = (kind: NamedKind, index: number): Path => [...LISTS[kind], index, 'key'];

/** Names of a kind already used by other items than `index`. */
export function otherNames(draft: Draft, kind: NamedKind, index: number): string[] {
  return listAt(draft, LISTS[kind])
    .filter((_, i) => i !== index)
    .map((item) => textAt(item, ['key']));
}

/**
 * Renames item `index` of a named list and everything that refers to its old name — also from or
 * to an empty name, so that clearing a name and typing another keeps the references. The editor
 * refuses a name another item has, which keeps every reference unambiguous.
 */
export function renameItem(draft: Draft, kind: NamedKind, index: number, name: string): Draft {
  const path: Path = [...LISTS[kind], index, 'key'];
  const old = textAt(draft, path);
  let next = setIn(draft, path, name);
  if (old === name || otherNames(draft, kind, index).includes(old)) return next;
  const swap = (item: Draft, property: string) =>
    item[property] === old ? { ...item, [property]: name } : item;
  for (const [list, property] of STARTING[kind]) {
    next = mapList(next, ['startingBalances', list], (balance) => swap(balance, property));
  }
  for (const [list, property] of ECONOMIC_REFS[kind]) {
    next = mapList(next, list, (entry) => swap(entry, property));
  }
  if (kind === 'loan') {
    const loans = getIn(next, FOREIGN_LOANS);
    if (Array.isArray(loans) && loans.includes(old)) {
      next = setIn(
        next,
        FOREIGN_LOANS,
        loans.map((loan: unknown) => (loan === old ? name : loan)),
      );
    }
  }
  if (kind === 'equity') next = mapList(next, SHAREHOLDERS, (h) => swap(h, 'equity'));
  if (kind === 'investment') next = mapList(next, ASSET_SALES, (s) => swap(s, 'item'));
  if (kind === 'costCentre') next = mapList(next, COSTS, (c) => swap(c, 'costCentre'));
  if (kind === 'product') {
    next = mapList(next, COSTS, (cost) => {
      const renamed = swap(cost, 'product');
      const shares = getIn(renamed, ['allocation', 'shares']);
      if (shares === null || typeof shares !== 'object' || !Object.hasOwn(shares, old)) {
        return renamed;
      }
      const entries = Object.entries(shares as Record<string, unknown>).map(
        ([product, share]): [string, unknown] => [product === old ? name : product, share],
      );
      return setIn(renamed, ['allocation', 'shares'], Object.fromEntries(entries));
    });
    next = mapList(next, CENTRES, (centre) =>
      Array.isArray(centre.products)
        ? { ...centre, products: centre.products.map((p: unknown) => (p === old ? name : p)) }
        : centre,
    );
  }
  return next;
}

/** What else goes when item `index` is removed, in words for the confirmation. */
export function removalNote(draft: Draft, kind: NamedKind, index: number): string {
  const name = textAt(draft, [...LISTS[kind], index, 'key']);
  if (otherNames(draft, kind, index).includes(name)) return '';
  const count = (path: Path, property: string) =>
    listAt(draft, path).filter((item) => getIn(item, [property]) === name).length;
  const notes: string[] = [];
  if (kind === 'product' && count(COSTS, 'product') > 0) {
    notes.push('هزینه‌های مستقیم این محصول هم حذف می‌شوند.');
  }
  if (kind === 'equity' && count(SHAREHOLDERS, 'equity') > 0) {
    notes.push('شرایط سود سهام این آورده هم حذف می‌شود.');
  }
  if (kind === 'investment' && count(ASSET_SALES, 'item') > 0) {
    notes.push('فروش این قلم هم حذف می‌شود.');
  }
  if (STARTING[kind].some(([list, property]) => count(['startingBalances', list], property) > 0)) {
    notes.push('مانده آغازین آن هم حذف می‌شود.');
  }
  // An entry that only names the item holds nothing the user entered.
  const adjusted = ECONOMIC_REFS[kind].some(([list, property]) =>
    listAt(draft, list).some(
      (entry) => getIn(entry, [property]) === name && Object.keys(entry as object).length > 1,
    ),
  );
  if (adjusted || (kind === 'loan' && listAt(draft, FOREIGN_LOANS).includes(name))) {
    notes.push('ورودی‌های تحلیل اقتصادی آن هم حذف می‌شود.');
  }
  return notes.join(' ');
}

/** Removes item `index` of a named list and everything that refers to it. */
export function removeItem(draft: Draft, kind: NamedKind, index: number): Draft {
  const name = textAt(draft, [...LISTS[kind], index, 'key']);
  const shared = otherNames(draft, kind, index).includes(name);
  let next = removeAt(draft, LISTS[kind], index);
  if (shared) return next;
  const refers = (property: string) => (item: unknown) => getIn(item, [property]) !== name;
  for (const [list, property] of STARTING[kind]) {
    next = filterList(next, ['startingBalances', list], refers(property));
  }
  for (const [list, property] of ECONOMIC_REFS[kind]) {
    next = filterList(next, list, refers(property));
  }
  if (kind === 'loan') next = filterList(next, FOREIGN_LOANS, (loan) => loan !== name);
  if (kind === 'equity') next = filterList(next, SHAREHOLDERS, refers('equity'));
  if (kind === 'investment') next = filterList(next, ASSET_SALES, refers('item'));
  if (kind === 'costCentre') {
    next = mapList(next, COSTS, (cost) => {
      if (cost.costCentre !== name) return cost;
      const { costCentre: _removed, ...rest } = cost;
      return rest;
    });
  }
  if (kind === 'product') {
    // The direct costs of a product have no meaning without it, nor has their starting stock.
    const direct = listAt(next, COSTS)
      .filter((cost) => getIn(cost, ['product']) === name)
      .map((cost) => textAt(cost, ['key']));
    next = filterList(next, COSTS, refers('product'));
    const kept = listAt(next, COSTS).map((cost) => textAt(cost, ['key']));
    const gone = (cost: string) => direct.includes(cost) && !kept.includes(cost);
    next = filterList(
      next,
      ['startingBalances', 'materials'],
      (balance) => !gone(textAt(balance, ['cost'])),
    );
    for (const [list, property] of ECONOMIC_REFS.cost) {
      next = filterList(next, list, (entry) => !gone(textAt(entry, [property])));
    }
    next = mapList(next, COSTS, (cost) => {
      const shares = getIn(cost, ['allocation', 'shares']);
      return shares !== null && typeof shares === 'object' && Object.hasOwn(shares, name)
        ? setIn(cost, ['allocation', 'shares', name], undefined)
        : cost;
    });
    next = mapList(next, CENTRES, (centre) =>
      Array.isArray(centre.products)
        ? { ...centre, products: centre.products.filter((p: unknown) => p !== name) }
        : centre,
    );
  }
  return next;
}

/**
 * The loans that can be taken into the cost-benefit analysis: those of foreign origin, and those
 * already chosen that are no longer foreign (or no longer there) — still listed, so that they can
 * be taken out again, because the calculation refuses them.
 */
export function foreignLoanChoices(draft: Draft): { name: string; foreign: boolean }[] {
  const foreign = listAt(draft, LISTS.loan)
    .filter((loan) => textAt(loan, ['key']) !== '' && getIn(loan, ['origin']) === 'FOREIGN')
    .map((loan) => textAt(loan, ['key']));
  const stale = listAt(draft, FOREIGN_LOANS).filter(
    (name): name is string => typeof name === 'string' && !foreign.includes(name),
  );
  return [
    ...foreign.map((name) => ({ name, foreign: true })),
    ...[...new Set(stale)].map((name) => ({ name, foreign: false })),
  ];
}

const salesPath = (product: number): Path => ['operations', 'products', product, 'sales'];

/** Names of the other sales lines of a product. */
export function otherLineNames(draft: Draft, product: number, row: number): string[] {
  return listAt(draft, salesPath(product))
    .filter((_, i) => i !== row)
    .map((line) => textAt(line, ['key']));
}

/** Whether an entry of the economic analysis is about sales line `line` of `product`. */
const isLine = (product: string, line: string) => (entry: unknown) =>
  getIn(entry, ['product']) === product && getIn(entry, ['line']) === line;

/** Renames a sales line and the entries of the economic analysis that are about it. */
export function renameSalesLine(draft: Draft, product: number, row: number, name: string): Draft {
  const path: Path = [...salesPath(product), row, 'key'];
  const old = textAt(draft, path);
  let next = setIn(draft, path, name);
  if (old === name || otherLineNames(draft, product, row).includes(old)) return next;
  const about = isLine(textAt(draft, ['operations', 'products', product, 'key']), old);
  for (const list of ECONOMIC_OUTPUTS) {
    next = mapList(next, list, (entry) => (about(entry) ? { ...entry, line: name } : entry));
  }
  return next;
}

/** What else goes when a sales line is removed, in words for the confirmation. */
export function salesLineRemovalNote(draft: Draft, product: number, row: number): string {
  const old = textAt(draft, [...salesPath(product), row, 'key']);
  if (otherLineNames(draft, product, row).includes(old)) return '';
  const about = isLine(textAt(draft, ['operations', 'products', product, 'key']), old);
  return ECONOMIC_OUTPUTS.some((list) => listAt(draft, list).some(about))
    ? 'ورودی‌های تحلیل اقتصادی آن هم حذف می‌شود.'
    : '';
}

/** Removes a sales line and the entries of the economic analysis that are about it. */
export function removeSalesLine(draft: Draft, product: number, row: number): Draft {
  const old = textAt(draft, [...salesPath(product), row, 'key']);
  let next = removeAt(draft, salesPath(product), row);
  if (otherLineNames(draft, product, row).includes(old)) return next;
  const about = isLine(textAt(draft, ['operations', 'products', product, 'key']), old);
  for (const list of ECONOMIC_OUTPUTS) next = filterList(next, list, (entry) => !about(entry));
  return next;
}

const MATERIALS: readonly string[] = MATERIAL_COST_CATEGORIES;

/**
 * The natures a cost item may have in the value-added schedule, by its category (the engine's
 * rule, comfar-model-spec §6.1): a category with one nature needs no entry.
 */
export function naturesOf(category: string): readonly string[] {
  if (MATERIALS.includes(category)) return ['MATERIALS'];
  if (category === 'LABOUR' || category === 'LABOUR_OVERHEADS') return ['WAGES'];
  if (category === 'LEASING') return ['OTHER'];
  if (category === 'DIRECT_MARKETING' || category === 'MARKETING_OVERHEADS') {
    return ['WAGES', 'OTHER'];
  }
  return category === '' ? [] : ['MATERIALS', 'WAGES'];
}

/** The nature of a cost item: the one of its category, or the one chosen for it. */
export function natureOf(category: string, chosen: unknown): string | undefined {
  const allowed = naturesOf(category);
  if (allowed.length === 1) return allowed[0];
  return typeof chosen === 'string' && allowed.includes(chosen) ? chosen : undefined;
}

/**
 * Drops the economic adjustments of a cost item that its nature does not take — after its
 * category or its nature changed — so that no value stays where the form no longer shows it.
 */
export function tidyEconomicCost(draft: Draft, name: string): Draft {
  const list: Path = [...ECONOMIC, 'costs'];
  const index = listAt(draft, list).findIndex((entry) => getIn(entry, ['item']) === name);
  const cost = listAt(draft, COSTS).find((item) => getIn(item, ['key']) === name);
  if (index < 0 || cost === undefined) return draft;
  const category = textAt(cost, ['category']);
  const allowed = naturesOf(category);
  const entry: Path = [...list, index];
  let next = draft;
  const drop = (property: string) => {
    if (getIn(next, [...entry, property]) !== undefined) {
      next = setIn(next, [...entry, property], undefined);
    }
  };
  const chosen = getIn(next, [...entry, 'nature']);
  if (allowed.length === 1 || (typeof chosen === 'string' && !allowed.includes(chosen))) {
    drop('nature');
  }
  const nature = natureOf(category, getIn(next, [...entry, 'nature']));
  // While the nature is still to be chosen nothing is known about the rest.
  if (nature === undefined) return next;
  if (nature !== 'WAGES') {
    drop('skill');
    drop('workers');
  }
  if (nature !== 'MATERIALS') drop('valueAddedIncluded');
  if (nature === 'OTHER') drop('taxesIncluded');
  return next;
}

/** The currencies of the model: the local one first, then the foreign ones. */
export function currenciesOf(draft: Draft): string[] {
  const local = textAt(draft, ['localCurrency']);
  const foreign = Object.keys(recordAt(draft, ['exchangeRates']));
  return [...(local === '' ? [] : [local]), ...foreign.filter((code) => code !== local)];
}

export const inflationEnabled = (draft: Draft): boolean =>
  getIn(draft, ['inflation']) !== undefined;

export function addCurrency(draft: Draft, code: string, frame: Frame | null): Draft {
  let next = setIn(draft, ['exchangeRates', code], fit([], frame?.periods.length ?? 0, ''));
  if (inflationEnabled(next)) {
    next = setIn(next, ['inflation', code], fit([], frame?.projectYears.length ?? 0, ''));
  }
  return next;
}

/** Every input that is priced in a currency. */
function mapPriced(draft: Draft, map: (item: Draft) => Draft): Draft {
  let next = mapList(draft, ['investment', 'items'], map);
  next = mapList(next, ['financing', 'equity'], map);
  next = mapList(next, ['financing', 'loans'], map);
  next = mapList(next, COSTS, map);
  for (const list of ECONOMIC_SERIES_LISTS) next = mapList(next, list, map);
  return mapList(next, ['operations', 'products'], (product) => mapList(product, ['sales'], map));
}

/** Number of inputs entered in a currency. */
export function currencyUses(draft: Draft, code: string): number {
  let uses = 0;
  mapPriced(draft, (item) => {
    if (item.currency === code) uses += 1;
    return item;
  });
  // The numeraire of the cost-benefit analysis is in a currency too.
  if (getIn(draft, [...COST_BENEFIT, 'currency']) === code) uses += 1;
  return uses;
}

export function removeCurrency(draft: Draft, code: string): Draft {
  let next = setIn(draft, ['exchangeRates', code], undefined);
  if (inflationEnabled(next)) next = setIn(next, ['inflation', code], undefined);
  next = setIn(next, ['notes', `exchangeRates.${code}`], undefined);
  return setIn(next, ['notes', `inflation.${code}`], undefined);
}

/**
 * Changes the code of the local currency: every input entered in it, its inflation path and the
 * note of that path follow the new code.
 */
export function setLocalCurrency(draft: Draft, code: string, frame: Frame | null): Draft {
  const old = textAt(draft, ['localCurrency']);
  let next = setIn(draft, ['localCurrency'], code);
  if (old === code) return next;
  // Also from an empty code, so that clearing the code and typing another keeps the items.
  next = mapPriced(next, (item) => (item.currency === old ? { ...item, currency: code } : item));
  const note = getIn(next, ['notes', `inflation.${old}`]);
  if (note !== undefined) {
    next = setIn(next, ['notes', `inflation.${old}`], undefined);
    next = setIn(next, ['notes', `inflation.${code}`], note);
  }
  if (!inflationEnabled(next)) return next;
  const inflation = recordAt(next, ['inflation']);
  const path = Object.hasOwn(inflation, old)
    ? inflation[old]
    : fit([], frame?.projectYears.length ?? 0, '');
  next = setIn(next, ['inflation', old], undefined);
  return setIn(next, ['inflation', code], path);
}

/**
 * Turns the calculation with inflation on (a path per currency, to be filled) or off. The
 * escalation of prices stays: at constant prices it is a real price change.
 */
export function setInflation(draft: Draft, enabled: boolean, frame: Frame | null): Draft {
  if (!enabled) return setIn(draft, ['inflation'], undefined);
  const years = frame?.projectYears.length ?? 0;
  const paths = Object.fromEntries(currenciesOf(draft).map((code) => [code, fit([], years, '')]));
  return setIn(draft, ['inflation'], paths);
}

/** JSON with sorted keys: equal for equal content, whatever order the keys were stored in. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
