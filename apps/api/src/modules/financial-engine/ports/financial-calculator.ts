/**
 * Financial engine port (EPIC-15, EPIC-33). The contract and the implementation live in the pure
 * workspace package `@roshd/financial-engine` (ADR-0009), which the web app uses as well, so live
 * previews and saved results cannot drift apart. The API re-exports the types it depends on.
 *
 * Design constraints (ADR-0009, docs/product/comfar-model-spec.md):
 * - framework-agnostic pure functions (no Nest, no Prisma, no UI),
 * - decimal strings at every boundary, never binary floating point,
 * - no economic defaults; six COMFAR conventions default but stay editable and are listed on results,
 * - every result records the model version for traceability.
 */
export type {
  CalculationResult,
  CalculationWarning,
  CashFlowSeries,
  CurrencyCode,
  DecimalString,
  DefaultUsed,
  FinancialCalculator,
  PeriodUnit,
  Scenario,
  SensitivityRequest,
} from '@roshd/financial-engine';

/** Injection token of the engine; bound to `financialCalculator` in the financial-model module. */
export const FINANCIAL_CALCULATOR = Symbol('FINANCIAL_CALCULATOR');
