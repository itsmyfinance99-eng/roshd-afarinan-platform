/**
 * @roshd/financial-engine — deterministic, COMFAR-compatible financial and economic
 * calculations (ADR-0009, docs/product/comfar-model-spec.md). Pure TypeScript: no framework,
 * no database, no I/O, no binary floating point.
 */
export {
  Decimal,
  InvalidDecimalError,
  ONE,
  ZERO,
  isDecimalString,
  toDecimal,
  toDecimalString,
  type DecimalString,
} from './decimal';
export type {
  CalculationResult,
  CalculationWarning,
  CashFlowSeries,
  CurrencyCode,
  DefaultUsed,
  FinancialCalculator,
  PeriodUnit,
  Scenario,
  SensitivityRequest,
} from './types';
export { EngineInputError } from './errors';
export { MODEL_VERSION } from './version';
export {
  DEFAULT_DISCOUNT_REFERENCE,
  annualRateFromPeriod,
  assertTimedSeries,
  discountFactor,
  futureValue,
  nominalFromReal,
  npv,
  periodDiscountFactors,
  periodRateFromAnnual,
  presentValue,
  realFromNominal,
  type DiscountReference,
  type DiscountingOptions,
  type TimedSeries,
} from './time-value';
export { irr, mirr, signChanges, type IrrOptions, type MirrOptions } from './irr';
export {
  benefitCostRatio,
  breakEven,
  debtServiceCoverage,
  discountedPaybackPeriod,
  loanLifeCoverage,
  npvRatio,
  paybackPeriod,
  productBreakEven,
  wacc,
  type BenefitCostSeries,
  type BenefitCostValue,
  type BreakEvenInput,
  type BreakEvenPoint,
  type BreakEvenProductPoint,
  type BreakEvenProductSales,
  type BreakEvenValue,
  type CapitalSource,
  type DebtServiceCoverage,
  type DebtServiceCoverageValue,
  type DebtServicePeriod,
  type DynamicPaybackOptions,
  type LoanLifeInput,
  type NpvRatioValue,
  type PaybackOptions,
  type PaybackValue,
  type ProductBreakEvenInput,
  type ProductBreakEvenValue,
} from './indicators';
export {
  ENGINE_MESSAGES_FA,
  engineMessageFa,
  toPersianDigits,
  type EngineMessageCode,
} from './messages';
export {
  depreciationSchedule,
  revaluedDepreciation,
  type DepreciationInput,
  type DepreciationMethod,
  type DepreciationSchedule,
  type DepreciationYear,
  type RevaluedYear,
} from './depreciation';
export {
  applyFactors,
  convertCurrency,
  derivedExchangeRates,
  foreignLoanToLocal,
  indexFactorsFromLevels,
  inflationIndex,
  priceEscalationFactors,
  relativeInflationFactors,
  type EscalationInput,
  type ForeignLoanLocalPeriod,
  type ForeignLoanPeriod,
  type RelativeInflationInput,
} from './indexation';
export {
  defaultFirstRepaymentDay,
  loanPeriods,
  loanSchedule,
  sumLoanPeriods,
  type LoanEvent,
  type LoanEventKind,
  type LoanFees,
  type LoanFlow,
  type LoanInput,
  type LoanPeriod,
  type LoanRate,
  type LoanSchedule,
  type LoanType,
} from './loans';
export { financialCalculator } from './calculator';
