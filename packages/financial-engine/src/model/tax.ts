import { ZERO, toDecimal, toDecimalString, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import type { CalculationResult } from '../types';
import { MODEL_VERSION } from '../version';

/**
 * Income (corporate) tax (manual VII.S, XI.P; comfar-model-spec §4.10): a graduated scale of
 * brackets, a tax holiday at the start of production and losses carried forward for a number of
 * years. Tax is a yearly amount: one profit per financial year of production. Every condition is
 * entered by the user; nothing has a default.
 */

/** One value for every production year, or one value per year. */
export type PerYear = DecimalString | DecimalString[];

export interface TaxBracket {
  /** Profit above this limit, up to the next bracket's limit, is taxed at `rate`. The first is 0. */
  lowerLimit: DecimalString;
  /** Rate as a fraction, 0 ≤ rate < 1. */
  rate: PerYear;
}

export interface TaxConditions {
  brackets: TaxBracket[];
  /** Years from the start of production without income tax. */
  holidayYears: number;
  /** Years for which a loss may reduce later profits; 0 = losses are not carried forward. */
  lossCarryForwardYears: number;
}

export interface TaxYear {
  /** Profit (or loss) of the year before losses brought forward. */
  profit: DecimalString;
  /** Losses of earlier years deducted in this year. */
  deductibleLoss: DecimalString;
  /** Profit less the deductible loss; a loss stays negative. */
  taxableProfit: DecimalString;
  /** True within the tax holiday. */
  holiday: boolean;
  tax: DecimalString;
}

const MAX_YEARS = 50;

function wholeYears(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_YEARS) {
    throw new EngineInputError('horizon.outOfRange', field, { min: '0', max: String(MAX_YEARS) });
  }
}

/** Parses one value per year (or one for all years) with a check per value. */
export function perYear(
  value: PerYear,
  years: number,
  field: string,
  check: (value: Decimal, field: string) => void,
): Decimal[] {
  if (typeof value === 'string') {
    const parsed = toDecimal(value);
    check(parsed, field);
    return Array.from({ length: years }, () => parsed);
  }
  if (value.length !== years) {
    throw new EngineInputError('series.lengthMismatch', field, {
      expected: String(years),
      actual: String(value.length),
    });
  }
  return value.map((v, y) => {
    const parsed = toDecimal(v);
    check(parsed, `${field}[${y}]`);
    return parsed;
  });
}

/**
 * Tax on a graduated scale (manual table 22): every slice of the profit is taxed at the rate of
 * its own bracket. `limits` are the lower limits, ascending from 0.
 */
export function graduatedTax(profit: Decimal, limits: Decimal[], rates: Decimal[]): Decimal {
  let tax = ZERO;
  limits.forEach((lower, b) => {
    if (!profit.gt(lower)) return;
    const upper = limits[b + 1];
    const top = upper !== undefined && profit.gt(upper) ? upper : profit;
    tax = tax.plus(top.minus(lower).times(rates[b] ?? ZERO));
  });
  return tax;
}

/**
 * Income tax of every production year. `profits[y]` is the profit of financial year `y` after
 * allowances (a loss is negative). A loss reduces the profits of the following
 * `lossCarryForwardYears` years, the oldest loss first and in the earliest possible year (manual
 * table 23); what is left after that expires. Losses are also used up by the profits of holiday
 * years, because the deduction belongs to the taxable profit and the holiday only to the tax
 * (our reading; OQ-39).
 */
export function incomeTax(
  profits: DecimalString[],
  conditions: TaxConditions,
): CalculationResult<TaxYear[]> {
  const years = profits.length;
  wholeYears(conditions.holidayYears, 'holidayYears');
  wholeYears(conditions.lossCarryForwardYears, 'lossCarryForwardYears');
  if (conditions.brackets.length === 0) {
    throw new EngineInputError('tax.bracketsRequired', 'brackets');
  }
  const limits = conditions.brackets.map((b, i) => {
    const limit = toDecimal(b.lowerLimit);
    const previous = conditions.brackets[i - 1];
    if (i === 0 ? !limit.isZero() : !limit.gt(toDecimal(previous?.lowerLimit ?? '0'))) {
      throw new EngineInputError('tax.bracketLimits', `brackets[${i}].lowerLimit`);
    }
    return limit;
  });
  const rates = conditions.brackets.map((b, i) =>
    perYear(b.rate, years, `brackets[${i}].rate`, (rate, field) => {
      if (rate.isNegative() || !rate.lt(1)) {
        throw new EngineInputError('rate.notInUnitInterval', field);
      }
    }),
  );

  // Losses not yet used, oldest first.
  const losses: { year: number; left: Decimal }[] = [];
  const value = profits.map((p, y): TaxYear => {
    const profit = toDecimal(p);
    let deducted = ZERO;
    if (profit.gt(0)) {
      for (const loss of losses) {
        if (y - loss.year > conditions.lossCarryForwardYears) continue;
        const rest = profit.minus(deducted);
        const used = loss.left.gt(rest) ? rest : loss.left;
        loss.left = loss.left.minus(used);
        deducted = deducted.plus(used);
      }
    } else if (profit.isNegative() && conditions.lossCarryForwardYears > 0) {
      losses.push({ year: y, left: profit.neg() });
    }
    const taxable = profit.minus(deducted);
    const holiday = y < conditions.holidayYears;
    const tax =
      holiday || !taxable.gt(0)
        ? ZERO
        : graduatedTax(
            taxable,
            limits,
            rates.map((r) => r[y] ?? ZERO),
          );
    return {
      profit: toDecimalString(profit),
      deductibleLoss: toDecimalString(deducted),
      taxableProfit: toDecimalString(taxable),
      holiday,
      tax: toDecimalString(tax),
    };
  });
  return { value, modelVersion: MODEL_VERSION, warnings: [], defaultsUsed: [] };
}
