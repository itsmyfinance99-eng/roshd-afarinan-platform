import { ZERO, toDecimal, toDecimalString, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import type { CalculationResult, CurrencyCode } from '../types';
import { MODEL_VERSION } from '../version';
import {
  depreciateAcquisitions,
  periodAmounts,
  type AssetDepreciation,
} from './asset-depreciation';
import type { PlanningHorizon } from './horizon';

/**
 * Investment schedules (manual VII.N, X.C.1; comfar-model-spec §4.12): fixed investment and
 * pre-production expenditures item by item, in the item's currency and converted at the period's
 * exchange rate, with their depreciation booked at balance dates. Net working capital (ST-34.03)
 * and the interest of the construction phase (financing) are added by the callers.
 */

/** COMFAR's fixed-investment groups, plus pre-production expenditures. */
export const INVESTMENT_GROUPS = [
  'LAND',
  'SITE_PREPARATION',
  'BUILDINGS',
  'MACHINERY',
  'AUXILIARY_EQUIPMENT',
  'INCORPORATED_ASSETS',
  'CONTINGENCY',
  'OTHER_FIXED',
  'PRE_PRODUCTION',
] as const;
export type InvestmentGroup = (typeof INVESTMENT_GROUPS)[number];

/** Local or foreign content of an item, independent of the currency it is entered in. */
export type Origin = 'LOCAL' | 'FOREIGN';

export interface InvestmentItem {
  key: string;
  group: InvestmentGroup;
  currency: CurrencyCode;
  origin: Origin;
  /** Acquisitions per project period in the item's currency (flows on the period's last day). */
  amounts: DecimalString[];
  /** Without conditions the item is not depreciated (e.g. land). */
  depreciation?: AssetDepreciation;
}

export interface InvestmentInput {
  horizon: PlanningHorizon;
  localCurrency: CurrencyCode;
  /** Local units per unit of each foreign currency, one rate per project period. */
  exchangeRates: Record<CurrencyCode, DecimalString[]>;
  items: InvestmentItem[];
}

export interface InvestmentItemSchedule {
  key: string;
  group: InvestmentGroup;
  origin: Origin;
  /** Acquisitions per period in local currency. */
  amounts: DecimalString[];
  depreciation: DecimalString[];
  bookValue: DecimalString[];
}

export interface OriginSplit {
  foreign: DecimalString[];
  local: DecimalString[];
}

export interface InvestmentSchedule {
  items: InvestmentItemSchedule[];
  /** Acquisitions per group and period; every group is listed, zero when it has no items. */
  groups: Record<InvestmentGroup, DecimalString[]>;
  /** Total fixed investment (every group but pre-production) per period. */
  fixedInvestment: DecimalString[];
  fixedInvestmentByOrigin: OriginSplit;
  /** Pre-production expenditures net of interest (interest comes from the financing schedule). */
  preProduction: DecimalString[];
  preProductionByOrigin: OriginSplit;
  /** Fixed investment plus pre-production expenditures net of interest. */
  totalInvestment: DecimalString[];
  /** Depreciation of fixed assets and amortisation of pre-production expenditures per period. */
  depreciation: { fixed: DecimalString[]; preProduction: DecimalString[]; total: DecimalString[] };
  /** Book value at the end of each period. */
  bookValue: { fixed: DecimalString[]; preProduction: DecimalString[]; total: DecimalString[] };
}

/** Exchange rate per period for `currency` (1 for the local currency). */
export function ratesFor(
  currency: CurrencyCode,
  input: { localCurrency: CurrencyCode; exchangeRates: Record<CurrencyCode, DecimalString[]> },
  length: number,
  field: string,
): Decimal[] | undefined {
  if (currency === input.localCurrency) return undefined;
  const rates = Object.hasOwn(input.exchangeRates, currency)
    ? input.exchangeRates[currency]
    : undefined;
  if (rates === undefined) {
    throw new EngineInputError('model.exchangeRateMissing', field, { currency });
  }
  if (rates.length !== length) {
    throw new EngineInputError('series.lengthMismatch', `exchangeRates.${currency}`, {
      expected: String(length),
      actual: String(rates.length),
    });
  }
  return rates.map((r, j) => {
    const rate = toDecimal(r);
    if (!rate.gt(0)) {
      throw new EngineInputError('exchangeRate.notPositive', `exchangeRates.${currency}[${j}]`);
    }
    return rate;
  });
}

const ORIGINS: readonly string[] = ['LOCAL', 'FOREIGN'];

/** Rejects an origin other than local or foreign, so the two splits always add up to the total. */
export function checkOrigin(origin: string, field: string): void {
  if (!ORIGINS.includes(origin)) throw new EngineInputError('model.origin', field);
}

/** Rejects a key used twice, so every schedule line can be traced to one input. */
export function uniqueKeys(keys: string[], field: string): void {
  const seen = new Set<string>();
  keys.forEach((key, i) => {
    if (seen.has(key)) throw new EngineInputError('model.duplicateKey', `${field}[${i}].key`);
    seen.add(key);
  });
}

const sum = (rows: Decimal[][], length: number) =>
  Array.from({ length }, (_, j) => rows.reduce((s, row) => s.plus(row[j] ?? ZERO), ZERO));

const strings = (values: Decimal[]) => values.map((v) => toDecimalString(v));

/** Fixed investment and pre-production schedules with their depreciation, in local currency. */
export function investmentSchedule(input: InvestmentInput): CalculationResult<InvestmentSchedule> {
  const length = input.horizon.periods.length;
  uniqueKeys(
    input.items.map((i) => i.key),
    'items',
  );
  const parsed = input.items.map((item, i) => {
    const field = `items[${i}]`;
    if (!(INVESTMENT_GROUPS as readonly string[]).includes(item.group)) {
      throw new EngineInputError('investment.group', `${field}.group`);
    }
    checkOrigin(item.origin, `${field}.origin`);
    const own = periodAmounts(item.amounts, length, `${field}.amounts`);
    const rates = ratesFor(item.currency, input, length, `${field}.currency`);
    const local = rates === undefined ? own : own.map((a, j) => a.times(rates[j] ?? ZERO));
    const book = depreciateAcquisitions(
      input.horizon,
      local,
      item.depreciation,
      `${field}.depreciation`,
    );
    return { item, local, book };
  });

  const where = (test: (item: InvestmentItem) => boolean) => parsed.filter((p) => test(p.item));
  const isFixed = (item: InvestmentItem) => item.group !== 'PRE_PRODUCTION';
  const total = (rows: typeof parsed) =>
    sum(
      rows.map((r) => r.local),
      length,
    );
  const totalOf = (rows: typeof parsed, field: 'depreciation' | 'bookValue') =>
    sum(
      rows.map((r) => r.book[field].map((v) => toDecimal(v))),
      length,
    );

  const fixed = where(isFixed);
  const pre = where((item) => !isFixed(item));
  const groups = Object.fromEntries(
    INVESTMENT_GROUPS.map((g) => [g, strings(total(where((item) => item.group === g)))]),
  ) as Record<InvestmentGroup, DecimalString[]>;
  const split = (rows: typeof parsed): OriginSplit => ({
    foreign: strings(total(rows.filter((r) => r.item.origin === 'FOREIGN'))),
    local: strings(total(rows.filter((r) => r.item.origin === 'LOCAL'))),
  });

  const value: InvestmentSchedule = {
    items: parsed.map(({ item, local, book }) => ({
      key: item.key,
      group: item.group,
      origin: item.origin,
      amounts: strings(local),
      depreciation: book.depreciation,
      bookValue: book.bookValue,
    })),
    groups,
    fixedInvestment: strings(total(fixed)),
    fixedInvestmentByOrigin: split(fixed),
    preProduction: strings(total(pre)),
    preProductionByOrigin: split(pre),
    totalInvestment: strings(total(parsed)),
    depreciation: {
      fixed: strings(totalOf(fixed, 'depreciation')),
      preProduction: strings(totalOf(pre, 'depreciation')),
      total: strings(totalOf(parsed, 'depreciation')),
    },
    bookValue: {
      fixed: strings(totalOf(fixed, 'bookValue')),
      preProduction: strings(totalOf(pre, 'bookValue')),
      total: strings(totalOf(parsed, 'bookValue')),
    },
  };
  return { value, modelVersion: MODEL_VERSION, warnings: [], defaultsUsed: [] };
}
