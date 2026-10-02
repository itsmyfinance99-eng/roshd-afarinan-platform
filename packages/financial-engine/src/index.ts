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

/**
 * Version of the calculation model. Bump the minor version when a formula or default changes
 * results; every saved calculation run stores it (ADR-0009 §6).
 */
export const MODEL_VERSION = '0.1.0';
