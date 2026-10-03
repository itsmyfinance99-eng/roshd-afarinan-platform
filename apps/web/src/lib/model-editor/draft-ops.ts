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
    const ok = list ? Array.isArray(value) : value !== null && typeof value === 'object';
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
  return draft;
}

export type NamedKind = 'investment' | 'equity' | 'product' | 'costCentre';

const LISTS: Record<NamedKind, Path> = {
  investment: ['investment', 'items'],
  equity: ['financing', 'equity'],
  product: ['operations', 'products'],
  costCentre: ['operations', 'costCentres'],
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

/** Renames item `index` of a named list and everything that refers to its old name. */
export function renameItem(draft: Draft, kind: NamedKind, index: number, name: string): Draft {
  const path: Path = [...LISTS[kind], index, 'key'];
  const old = textAt(draft, path);
  let next = setIn(draft, path, name);
  if (old === '' || old === name) return next;
  // A name used twice refers to both items; the references stay with the first one.
  const others = listAt(draft, LISTS[kind]).filter(
    (item, i) => i !== index && textAt(item, ['key']) === old,
  );
  if (others.length > 0) return next;
  const swap = (item: Draft, property: string) =>
    item[property] === old ? { ...item, [property]: name } : item;
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

/** Removes item `index` of a named list and what belongs to it alone. */
export function removeItem(draft: Draft, kind: NamedKind, index: number): Draft {
  const name = textAt(draft, [...LISTS[kind], index, 'key']);
  let next = removeAt(draft, LISTS[kind], index);
  const still = listAt(next, LISTS[kind]).some((item) => textAt(item, ['key']) === name);
  if (still) return next;
  const drop = (path: Path, property: string) => {
    const list = getIn(next, path);
    if (Array.isArray(list)) {
      next = setIn(
        next,
        path,
        list.filter((item: unknown) => getIn(item, [property]) !== name),
      );
    }
  };
  if (kind === 'equity') drop(SHAREHOLDERS, 'equity');
  if (kind === 'investment') drop(ASSET_SALES, 'item');
  if (kind === 'costCentre') {
    next = mapList(next, COSTS, (cost) => {
      if (cost.costCentre !== name) return cost;
      const { costCentre: _removed, ...rest } = cost;
      return rest;
    });
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

export function removeCurrency(draft: Draft, code: string): Draft {
  let next = setIn(draft, ['exchangeRates', code], undefined);
  if (inflationEnabled(next)) next = setIn(next, ['inflation', code], undefined);
  next = setIn(next, ['notes', `exchangeRates.${code}`], undefined);
  return setIn(next, ['notes', `inflation.${code}`], undefined);
}

/** Changes the local currency; its inflation path (when inflation is on) follows the new code. */
export function setLocalCurrency(draft: Draft, code: string, frame: Frame | null): Draft {
  const old = textAt(draft, ['localCurrency']);
  let next = setIn(draft, ['localCurrency'], code);
  if (!inflationEnabled(next) || old === code) return next;
  const inflation = recordAt(next, ['inflation']);
  const path = Object.hasOwn(inflation, old)
    ? inflation[old]
    : fit([], frame?.projectYears.length ?? 0, '');
  next = setIn(next, ['inflation', old], undefined);
  return Object.hasOwn(recordAt(next, ['inflation']), code)
    ? next
    : setIn(next, ['inflation', code], path);
}

/** Turns the calculation with inflation on (a path per currency, to be filled) or off. */
export function setInflation(draft: Draft, enabled: boolean, frame: Frame | null): Draft {
  if (!enabled) return setIn(draft, ['inflation'], undefined);
  const years = frame?.projectYears.length ?? 0;
  const paths = Object.fromEntries(currenciesOf(draft).map((code) => [code, fit([], years, '')]));
  return setIn(draft, ['inflation'], paths);
}
