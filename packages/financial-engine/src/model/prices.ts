import { ONE, toDecimal, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import { priceEscalationFactors } from '../indexation';
import type { CurrencyCode } from '../types';
import { withField } from './asset-depreciation';
import type { PlanningHorizon } from './horizon';
import { ratesFor } from './rates';

/**
 * Current prices in project periods (manual VII.K, XI.C; comfar-model-spec §2.1, §4.5): an entered
 * price is the price at the start of the horizon in the item's currency. It follows the inflation
 * of that currency and the item's own escalation, year by year (years ending on balance dates,
 * the first possibly partial), and is converted at the exchange rate of the period.
 */

export interface PriceContext {
  horizon: PlanningHorizon;
  localCurrency: CurrencyCode;
  /** Local units per unit of each foreign currency, one rate per project period. */
  exchangeRates: Record<CurrencyCode, DecimalString[]>;
  /**
   * Inflation per currency and project year. Absent = the project is analysed at constant prices
   * (an explicit choice of the user, never assumed for a single currency).
   */
  inflation?: Record<CurrencyCode, DecimalString[]>;
}

export interface PricedItem {
  currency: CurrencyCode;
  /**
   * `E_j`: escalation relative to the currency's inflation, one rate or one per project year.
   * Required when the project has inflation ("0" is an explicit choice).
   */
  escalation?: DecimalString | DecimalString[];
  /** COMFAR's first-year escalator `e`; required with `escalation`. */
  firstYearEscalator?: number;
}

/**
 * Project year of each period: years end on balance dates and a period belongs to the year its
 * last day falls in (flows occur on the last day of a period).
 */
export function projectYears(horizon: PlanningHorizon): { ofPeriod: number[]; count: number } {
  const firstProductionBalance = horizon.balanceYears[0]?.endMonth ?? 12;
  // Months from the start of the horizon to the first balance date (1–12).
  const first = ((firstProductionBalance - 1) % 12) + 1;
  const ofPeriod = horizon.periods.map((p) => {
    // Whole years after the first balance date, rounded up (integer arithmetic only).
    const after = p.startMonth + p.months - first + 11;
    return after < 12 ? 0 : (after - (after % 12)) / 12;
  });
  return { ofPeriod, count: (ofPeriod[ofPeriod.length - 1] ?? 0) + 1 };
}

/** Checks the inflation paths once: one rate above −100 % per project year and currency. */
export function checkInflation(context: PriceContext): void {
  if (context.inflation === undefined) return;
  const { count } = projectYears(context.horizon);
  for (const [currency, path] of Object.entries(context.inflation)) {
    if (path.length !== count) {
      throw new EngineInputError('series.lengthMismatch', `inflation.${currency}`, {
        expected: String(count),
        actual: String(path.length),
      });
    }
    path.forEach((r, j) => {
      if (toDecimal(r).lte(-1)) {
        throw new EngineInputError('rate.notAboveMinus100', `inflation.${currency}[${j}]`);
      }
    });
  }
}

/**
 * Factor per period that turns a price entered in the item's currency into the current price in
 * local currency: the price factor of the period's project year times the period's exchange rate.
 */
export function currentPriceFactors(
  context: PriceContext,
  item: PricedItem,
  field: string,
): Decimal[] {
  const { horizon } = context;
  const years = projectYears(horizon);
  const rates = ratesFor(item.currency, context, horizon.periods.length, `${field}.currency`);
  const inflation =
    context.inflation !== undefined && Object.hasOwn(context.inflation, item.currency)
      ? context.inflation[item.currency]
      : undefined;
  if (context.inflation !== undefined && inflation === undefined) {
    throw new EngineInputError('operations.inflationMissing', `${field}.currency`, {
      currency: item.currency,
    });
  }
  let yearly: Decimal[] | undefined;
  const escalation = item.escalation;
  if (escalation === undefined) {
    if (inflation !== undefined) {
      throw new EngineInputError('operations.escalationRequired', `${field}.escalation`);
    }
  } else {
    yearly = withField(field, () =>
      priceEscalationFactors({
        inflation: inflation ?? Array.from({ length: years.count }, () => '0'),
        escalation,
        firstYearEscalator: item.firstYearEscalator ?? Number.NaN,
      }),
    ).value.map((f) => toDecimal(f));
  }
  return horizon.periods.map((_, j) =>
    (yearly?.[years.ofPeriod[j] ?? 0] ?? ONE).times(rates?.[j] ?? ONE),
  );
}
