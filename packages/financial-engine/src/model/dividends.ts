import { ZERO, type Decimal } from '../decimal';

/**
 * Profit distribution of one production year (manual VII.R.4, XI.Q; comfar-model-spec §4.11).
 *
 * 1. Of a positive net profit the retained share stays in the project; the rest is payable as
 *    dividends. A loss is retained in full and nothing is payable.
 * 2. Preferred dividends = accumulated paid-in equity × rate + an absolute amount. When the
 *    payable profit does not cover them, joint-venture partners are served first: they get theirs
 *    in full and the other shareholders are reduced in proportion (case 2), or the partners
 *    themselves are reduced in proportion and the others get nothing (case 3).
 * 3. What is left after the preferred dividends is shared as ordinary dividends by percentage.
 */

export interface DividendShareholder {
  /** Joint-venture partners come first when preferred dividends must be reduced. */
  jointVenture: boolean;
  /** Paid-in equity accumulated up to and including the year. */
  accumulatedEquity: Decimal;
  preferredRate: Decimal;
  preferredAmount: Decimal;
  /** Share of the profit remaining after preferred dividends. */
  ordinaryShare: Decimal;
}

export interface ProfitDistribution {
  /** `DP_j`: net profit less the retained share (0 for a loss). */
  payable: Decimal;
  shareholders: { preferred: Decimal; ordinary: Decimal }[];
  /** Preferred and ordinary dividends of all shareholders. */
  dividends: Decimal;
}

export function distributeProfit(
  netProfit: Decimal,
  retainedShare: Decimal,
  shareholders: DividendShareholder[],
): ProfitDistribution {
  const payable = netProfit.gt(0) ? netProfit.minus(netProfit.times(retainedShare)) : ZERO;
  const entitled = shareholders.map((s) =>
    s.accumulatedEquity.times(s.preferredRate).plus(s.preferredAmount),
  );
  const total = (jointVenture: boolean) =>
    shareholders.reduce(
      (sum, s, i) => (s.jointVenture === jointVenture ? sum.plus(entitled[i] ?? ZERO) : sum),
      ZERO,
    );
  const partners = total(true);
  const others = total(false);

  // Reduction factors of the two groups (1 = paid in full).
  let partnerFactor: Decimal | undefined;
  let otherFactor: Decimal | undefined;
  if (payable.lt(partners)) {
    partnerFactor = payable.div(partners);
    otherFactor = ZERO;
  } else if (payable.lt(partners.plus(others))) {
    otherFactor = payable.minus(partners).div(others);
  }
  const preferred = shareholders.map((s, i) => {
    const factor = s.jointVenture ? partnerFactor : otherFactor;
    const full = entitled[i] ?? ZERO;
    return factor === undefined ? full : full.times(factor);
  });
  // A reduced group takes exactly what is payable, so nothing is left for ordinary dividends.
  const totalPreferred =
    partnerFactor !== undefined || otherFactor !== undefined ? payable : partners.plus(others);
  const remaining = payable.minus(totalPreferred);
  const ordinary = shareholders.map((s) => remaining.times(s.ordinaryShare));
  return {
    payable,
    shareholders: shareholders.map((_, i) => ({
      preferred: preferred[i] ?? ZERO,
      ordinary: ordinary[i] ?? ZERO,
    })),
    dividends: [...preferred, ...ordinary].reduce((sum, v) => sum.plus(v), ZERO),
  };
}
