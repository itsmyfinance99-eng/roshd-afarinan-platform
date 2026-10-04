import { fit, type Frame } from './frame';
import { getIn, listAt, recordAt, removeAt, setIn, textAt, type Draft, type Path } from './paths';

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
  return draft;
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
    next = filterList(next, ['startingBalances', 'materials'], (balance) => {
      const cost = textAt(balance, ['cost']);
      return !direct.includes(cost) || kept.includes(cost);
    });
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
  return mapList(next, ['operations', 'products'], (product) => mapList(product, ['sales'], map));
}

/** Number of inputs entered in a currency. */
export function currencyUses(draft: Draft, code: string): number {
  let uses = 0;
  mapPriced(draft, (item) => {
    if (item.currency === code) uses += 1;
    return item;
  });
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
