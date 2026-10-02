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
