import { ZERO, type Decimal } from '../decimal';
import { EngineInputError } from '../errors';

/**
 * Production programme from the sales programme (manual XI.L; comfar-model-spec §4.6): production
 * is what is sold plus the change in the stock of finished products, which is kept at the entered
 * days of coverage. Quantities only; the stock is valued by the working-capital schedule.
 */

export interface ProgrammeInput {
  /** `S_j`: quantity sold per project period (all markets). */
  sales: Decimal[];
  /** Months of each period. */
  months: number[];
  /** `Mdc`: days of coverage of finished products (0 = no stock). */
  coverageDays: Decimal;
  /** First and last period (inclusive) in which the product is produced. */
  firstPeriod: number;
  lastPeriod: number;
}

export interface Programme {
  /** `B_j`: stock at the start of the period. */
  broughtForward: Decimal[];
  /** `P_j`. */
  produced: Decimal[];
  /** `C_j`: stock at the end of the period. */
  carried: Decimal[];
}

/**
 * - Sales up to the end of production: `RS_j = S_j / c`, `c = 30 × m / Mdc`; `X = B − S`;
 *   `C = max(X, RS)`; `P = S − B + C`. The last stock is liquidated in the scrap year.
 * - Sales ending before production ends: `RS_j = min(S_j / c, Σ_{i>j} S_i)`; when `S < B` nothing
 *   is produced (`C = B − S`), otherwise `C = RS` and `P = S + RS − B`.
 * - Outside the production interval sales come from stock only; selling more than the stock is
 *   refused (COMFAR cuts the sales silently).
 */
export function productionProgramme(input: ProgrammeInput, field: string): Programme {
  const { sales, months, coverageDays, firstPeriod, lastPeriod } = input;
  const futureSales = sales.map(() => ZERO);
  for (let j = sales.length - 2; j >= 0; j--) {
    futureSales[j] = (futureSales[j + 1] ?? ZERO).plus(sales[j + 1] ?? ZERO);
  }
  const endsEarly = (sales[lastPeriod] ?? ZERO).isZero();
  const broughtForward: Decimal[] = [];
  const produced: Decimal[] = [];
  const carried: Decimal[] = [];
  let stock = ZERO;
  sales.forEach((sold, j) => {
    let end: Decimal;
    if (j < firstPeriod || j > lastPeriod) {
      if (sold.gt(stock)) {
        throw new EngineInputError('production.salesOutsideInterval', `${field}[${j}]`);
      }
      end = stock.minus(sold);
    } else {
      const byCoverage = sold.times(coverageDays).div(30 * (months[j] ?? 12));
      if (endsEarly) {
        const required = byCoverage.lt(futureSales[j] ?? ZERO)
          ? byCoverage
          : (futureSales[j] ?? ZERO);
        end = sold.lt(stock) ? stock.minus(sold) : required;
      } else {
        const left = stock.minus(sold);
        end = left.gt(byCoverage) ? left : byCoverage;
      }
    }
    broughtForward.push(stock);
    produced.push(sold.minus(stock).plus(end));
    carried.push(end);
    stock = end;
  });
  return { broughtForward, produced, carried };
}
