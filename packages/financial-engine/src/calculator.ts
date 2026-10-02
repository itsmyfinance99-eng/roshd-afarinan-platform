import {
  benefitCostRatio,
  breakEven,
  debtServiceCoverage,
  discountedPaybackPeriod,
  loanLifeCoverage,
  npvRatio,
  paybackPeriod,
  productBreakEven,
  wacc,
} from './indicators';
import { irr, mirr } from './irr';
import { npv } from './time-value';
import type { FinancialCalculator } from './types';
import { MODEL_VERSION } from './version';

/** The engine as one object, for adapters that bind the `FinancialCalculator` port. */
export const financialCalculator: FinancialCalculator = {
  modelVersion: MODEL_VERSION,
  npv,
  irr,
  mirr,
  paybackPeriod,
  discountedPaybackPeriod,
  npvRatio,
  benefitCostRatio,
  breakEven,
  productBreakEven,
  debtServiceCoverage,
  loanLifeCoverage,
  wacc,
};
