import {
  ONE,
  ZERO,
  toDecimal,
  toDecimalString,
  type Decimal,
  type DecimalString,
} from '../decimal';
import { EngineInputError } from '../errors';
import { periodDiscountFactors, type DiscountReference } from '../time-value';
import type { CurrencyCode } from '../types';
import type { FinancingSchedule } from './financing';
import type { PlanningHorizon } from './horizon';
import { uniqueKeys, type InvestmentSchedule, type Origin } from './investment';
import { MATERIALS, type CostCategory, type OperationsSchedule } from './operations';
import { discountRates, type FinancialStatements } from './statements';

/**
 * Economic analysis (manual VIII, X.D, XII; comfar-model-spec §6): the input the user adds to the
 * financial model, and what the economic schedules share — the nature and the adjustments of the
 * cost and investment items, and lines with totals and present values.
 */

/** What a cost item is in the value-added schedule: an intermediate input, wages, or neither. */
export const INPUT_NATURES = ['MATERIALS', 'WAGES', 'OTHER'] as const;
export type InputNature = (typeof INPUT_NATURES)[number];

export const LABOUR_SKILLS = ['SKILLED', 'UNSKILLED'] as const;
export type LabourSkill = (typeof LABOUR_SKILLS)[number];

/** Adjustment of a cost item of the financial input (COMFAR's ADJUSTMENT OF INPUTS window). */
export interface EconomicCostAdjustment {
  /** Key of the cost item. */
  item: string;
  /**
   * Required for factory and administrative overheads (materials and services, or wages) and for
   * marketing costs (wages, or other). The other categories have one nature and need none.
   */
  nature?: InputNature;
  /** Wages only; required for the labour category. Other wages count as skilled (X.D.1). */
  skill?: LabourSkill;
  /**
   * Indirect taxes and duties included in the financial value, as a fraction of it (at most 1); a
   * negative fraction is a subsidy on the input, of any size. Materials and wages only; none when
   * absent.
   */
  taxesIncluded?: DecimalString;
  /**
   * Value added included in the item, for up to three rounds of decomposition: each round is a
   * fraction of what the previous rounds left. Materials only; none when absent.
   */
  valueAddedIncluded?: DecimalString[];
}

/** Adjustment of a fixed-investment or pre-production item. */
export interface EconomicInvestmentAdjustment {
  /** Key of the investment item. */
  item: string;
  taxesIncluded?: DecimalString;
  valueAddedIncluded?: DecimalString[];
}

export interface EconomicInput {
  /** Economic rate of discount per year: one rate or one per project period. No default. */
  discountRate: DecimalString | DecimalString[];
  /** Cost items that are adjusted or need a nature; the others keep their financial value. */
  costs: EconomicCostAdjustment[];
  /** Investment items that are adjusted; the others keep their financial value. */
  investment: EconomicInvestmentAdjustment[];
  /** Additional tax on distributed dividends, as fractions ("0" is an explicit choice). */
  dividendTax: { local: DecimalString; foreign: DecimalString };
  /**
   * Indirect effects on the balance of payments (VIII.G–H, VIII.K): tradable outputs and inputs
   * and other indirect inflows and outflows of foreign exchange. None when absent.
   */
  indirectForeignExchange?: IndirectForeignExchangeInput;
  /** Jobs created by the project and around it (VIII.L); no employment schedule when absent. */
  employment?: EmploymentInput;
}

/** Jobs and their wage bill in the reference year, in local currency. */
export interface EmploymentGroupInput {
  workers: DecimalString;
  wageBill: DecimalString;
}

/** Employment in the projects that supply the inputs or use the outputs of the project. */
export interface IndirectEmploymentInput {
  unskilled: EmploymentGroupInput;
  skilled: EmploymentGroupInput;
  /** Additional investment these jobs need, in local currency. */
  investment: DecimalString;
}

export interface EmploymentInput {
  /**
   * Jobs within the project in the reference year. Their wage bill and the investment come from
   * the financial schedules.
   */
  direct: { unskilled: DecimalString; skilled: DecimalString };
  indirect: { inputSupplying: IndirectEmploymentInput; outputUsing: IndirectEmploymentInput };
}

/** How a local item would be traded without the project. */
export const TRADE_CATEGORIES = ['IMPORTABLE', 'EXPORTABLE'] as const;
export type TradeCategory = (typeof TRADE_CATEGORIES)[number];

interface Tradable {
  trade: TradeCategory;
  /** `f`: part of the item that is importable or exportable, 0 … 1. */
  share: DecimalString;
  /**
   * Border price (CIF for an importable, FOB for an exportable item) over the financial price:
   * COMFAR's adjustment factor. The financial price is the net sales price of an output and the
   * price paid for an input.
   */
  borderPriceFactor: DecimalString;
}

/** A sales line of the local market that replaces imports or could be exported. */
export interface TradableOutput extends Tradable {
  product: string;
  line: string;
}

/** A material input of local origin that induces imports or is diverted from exports. */
export interface TradableInput extends Tradable {
  /** Key of the cost item. */
  item: string;
}

/** An indirect inflow or outflow of foreign exchange entered by the user. */
export interface IndirectForeignExchangeItem {
  key: string;
  currency: CurrencyCode;
  /** Amounts per project period in the item's currency, at the prices of their period. */
  amounts: DecimalString[];
}

export interface IndirectForeignExchangeInput {
  outputs: TradableOutput[];
  inputs: TradableInput[];
  /** Benefits and merits. */
  otherInflows: IndirectForeignExchangeItem[];
  /** Costs and demerits. */
  otherOutflows: IndirectForeignExchangeItem[];
}

/** A line of an economic schedule: per project period, its sum and its present value. */
export interface EconomicLine {
  values: DecimalString[];
  total: DecimalString;
  presentValue: DecimalString;
}

/** A line of ratios; null where the denominator is zero. */
export interface EconomicShareLine {
  values: (DecimalString | null)[];
  total: DecimalString | null;
  presentValue: DecimalString | null;
}

export type Row = Decimal[];
export const at = (row: Row | undefined, j: number) => row?.[j] ?? ZERO;

/** The natures a category may have; a category with one nature needs no entry. */
function naturesOf(category: CostCategory): readonly InputNature[] {
  if (MATERIALS.has(category)) return ['MATERIALS'];
  if (category === 'LABOUR' || category === 'LABOUR_OVERHEADS') return ['WAGES'];
  if (category === 'LEASING') return ['OTHER'];
  if (category === 'DIRECT_MARKETING' || category === 'MARKETING_OVERHEADS') {
    return ['WAGES', 'OTHER'];
  }
  return ['MATERIALS', 'WAGES'];
}

interface Adjustment {
  /** Taxes and duties included (negative: a subsidy on the input). */
  tax: Decimal;
  /** Part of the value net of taxes that is deducted as an intermediate input. */
  rest: Decimal;
}

const NO_ADJUSTMENT: Adjustment = { tax: ZERO, rest: ONE };

function adjustment(
  entry: { taxesIncluded?: DecimalString; valueAddedIncluded?: DecimalString[] },
  field: string,
): Adjustment {
  let tax = ZERO;
  if (entry.taxesIncluded !== undefined) {
    tax = toDecimal(entry.taxesIncluded);
    if (tax.gt(1)) {
      throw new EngineInputError('economic.taxesIncluded', `${field}.taxesIncluded`);
    }
  }
  let rest = ONE;
  const rounds = entry.valueAddedIncluded ?? [];
  if (rounds.length > 3) {
    throw new EngineInputError('economic.rounds', `${field}.valueAddedIncluded`);
  }
  rounds.forEach((value, i) => {
    const share = toDecimal(value);
    if (share.isNegative() || share.gt(1)) {
      throw new EngineInputError('share.outOfRange', `${field}.valueAddedIncluded[${i}]`);
    }
    rest = rest.times(ONE.minus(share));
  });
  return { tax, rest };
}

export function entriesByItem<T extends { item: string }>(
  entries: T[],
  field: string,
  known: ReadonlySet<string>,
): Map<string, { entry: T; field: string }> {
  uniqueKeys(
    entries.map((e) => e.item),
    field,
    'item',
  );
  return new Map(
    entries.map((entry, i) => {
      if (!known.has(entry.item)) {
        throw new EngineInputError('economic.unknownItem', `${field}[${i}].item`);
      }
      return [entry.item, { entry, field: `${field}[${i}]` }];
    }),
  );
}

/** The calculated project an economic schedule is built from. */
export interface EconomicScheduleInput {
  horizon: PlanningHorizon;
  investment: InvestmentSchedule;
  financing: FinancingSchedule;
  operations: OperationsSchedule;
  statements: FinancialStatements;
  economic: EconomicInput;
  /** Reference date of the present values: the one of the financial statements. */
  reference?: DiscountReference;
}

/** A cost item with its nature and adjustments. */
export interface EconomicCost {
  key: string;
  origin: Origin;
  nature: InputNature;
  skill: LabourSkill | undefined;
  /** Taxes and duties included (negative: a subsidy on the input). */
  tax: Decimal;
  /** Part of the value net of taxes that is deducted as an intermediate input. */
  rest: Decimal;
  /** Cost of the products sold per period. */
  sold: Row;
}

export interface EconomicInvestment {
  key: string;
  origin: Origin;
  tax: Decimal;
  rest: Decimal;
  amounts: Row;
}

/**
 * What every economic schedule starts from: the checked adjustments of the cost and investment
 * items, the taxes on dividends, and lines with their totals and present values at the economic
 * rate of discount.
 */
export function economicBase(input: EconomicScheduleInput) {
  const { horizon, investment, operations, economic } = input;
  const length = horizon.periods.length;
  const zero = (): Row => Array.from({ length }, () => ZERO);
  const row = (values: DecimalString[]): Row =>
    Array.from({ length }, (_, j) => toDecimal(values[j] ?? '0'));
  const add = (...rows: Row[]): Row =>
    Array.from({ length }, (_, j) => rows.reduce((s, r) => s.plus(at(r, j)), ZERO));
  const minus = (a: Row, ...rows: Row[]): Row =>
    Array.from({ length }, (_, j) => rows.reduce((s, r) => s.minus(at(r, j)), at(a, j)));
  const addTo = (target: Row, values: Row, factor: Decimal) =>
    values.forEach((v, j) => (target[j] = at(target, j).plus(v.times(factor))));

  const rates = discountRates(economic.discountRate, length, 'discountRate');
  const factors = periodDiscountFactors(
    horizon.periods.map((p) => p.months),
    { annualRate: rates, ...(input.reference === undefined ? {} : { reference: input.reference }) },
  );
  const sum = (values: Row) => values.reduce((s, v) => s.plus(v), ZERO);
  const present = (values: Row) =>
    values.reduce((s, v, j) => s.plus(v.div(factors[j] ?? ONE)), ZERO);
  const line = (values: Row): EconomicLine => ({
    values: values.map((v) => toDecimalString(v)),
    total: toDecimalString(sum(values)),
    presentValue: toDecimalString(present(values)),
  });
  const ratio = (numerator: Decimal, denominator: Decimal) =>
    denominator.isZero() ? null : toDecimalString(numerator.div(denominator));
  const shareLine = (part: Row, whole: Row): EconomicShareLine => ({
    values: part.map((v, j) => ratio(v, at(whole, j))),
    total: ratio(sum(part), sum(whole)),
    presentValue: ratio(present(part), present(whole)),
  });

  const dividendTaxes = (['local', 'foreign'] as const).map((side) => {
    const value = toDecimal(economic.dividendTax[side]);
    if (value.isNegative() || value.gt(1)) {
      throw new EngineInputError('share.outOfRange', `dividendTax.${side}`);
    }
    return value;
  });
  const dividendTax = { local: dividendTaxes[0] ?? ZERO, foreign: dividendTaxes[1] ?? ZERO };

  const costEntries = entriesByItem(
    economic.costs,
    'costs',
    new Set(operations.costs.items.map((c) => c.key)),
  );
  const costs = operations.costs.items.map((cost): EconomicCost => {
    const found = costEntries.get(cost.key);
    const entry = found?.entry;
    const field = found?.field ?? 'costs';
    const allowed = naturesOf(cost.category);
    let nature = allowed.length === 1 ? allowed[0] : undefined;
    if (entry?.nature !== undefined) {
      if (!allowed.includes(entry.nature)) {
        throw new EngineInputError('economic.nature', `${field}.nature`);
      }
      nature = entry.nature;
    }
    if (nature === undefined) {
      throw new EngineInputError(
        'economic.natureRequired',
        found === undefined ? field : `${field}.nature`,
        { item: cost.key },
      );
    }
    if (entry?.skill !== undefined) {
      if (nature !== 'WAGES') {
        throw new EngineInputError('economic.notApplicable', `${field}.skill`);
      }
      if (!(LABOUR_SKILLS as readonly string[]).includes(entry.skill)) {
        throw new EngineInputError('economic.skillRequired', `${field}.skill`, { item: cost.key });
      }
    } else if (cost.category === 'LABOUR') {
      throw new EngineInputError(
        'economic.skillRequired',
        found === undefined ? field : `${field}.skill`,
        { item: cost.key },
      );
    }
    if (nature !== 'MATERIALS' && entry?.valueAddedIncluded !== undefined) {
      throw new EngineInputError('economic.notApplicable', `${field}.valueAddedIncluded`);
    }
    if (nature === 'OTHER' && entry?.taxesIncluded !== undefined) {
      throw new EngineInputError('economic.notApplicable', `${field}.taxesIncluded`);
    }
    const { tax, rest } = entry === undefined ? NO_ADJUSTMENT : adjustment(entry, field);
    return {
      key: cost.key,
      origin: cost.origin,
      nature,
      skill: entry?.skill,
      tax,
      rest,
      sold: row(cost.sold),
    };
  });

  const investmentEntries = entriesByItem(
    economic.investment,
    'investment',
    new Set(investment.items.map((i) => i.key)),
  );
  const investments = investment.items.map((item): EconomicInvestment => {
    const found = investmentEntries.get(item.key);
    const { tax, rest } =
      found === undefined ? NO_ADJUSTMENT : adjustment(found.entry, found.field);
    return { key: item.key, origin: item.origin, tax, rest, amounts: row(item.amounts) };
  });

  return {
    length,
    zero,
    row,
    add,
    minus,
    addTo,
    present,
    line,
    shareLine,
    dividendTax,
    costs,
    investments,
  };
}

/** A subsidy on an input leaves its value as it is; taxes and duties included are taken out. */
export const netOfTax = (tax: Decimal) => (tax.isNegative() ? ONE : ONE.minus(tax));
