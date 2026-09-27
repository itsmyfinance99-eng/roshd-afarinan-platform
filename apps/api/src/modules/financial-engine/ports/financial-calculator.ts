/**
 * Financial engine contracts (EPIC-15, Phase 4). Interfaces only — no formulas yet.
 *
 * Design constraints (roadmap §9 Phase 4):
 * - framework-agnostic pure functions (no Nest, no Prisma, no UI),
 * - explicit currency/unit and period handling,
 * - documented precision strategy (decimal strings, never binary floating point in results),
 * - every result records the calculation model version for traceability.
 */

/** Decimal number serialised as a string, e.g. "12500000.00". */
export type DecimalString = string;

export type Currency = 'IRR' | 'USD' | 'EUR';
export type PeriodUnit = 'month' | 'quarter' | 'year';

export interface CashFlowSeries {
  currency: Currency;
  periodUnit: PeriodUnit;
  /** Index 0 is the initial period (usually the investment, negative). */
  flows: DecimalString[];
}

export type Scenario = 'BASE' | 'OPTIMISTIC' | 'PESSIMISTIC';

export interface CalculationResult<T> {
  value: T;
  /** e.g. `fin-engine@1.0.0`; stored with results so later model changes stay traceable. */
  modelVersion: string;
  warnings: string[];
}

export interface FinancialCalculator {
  readonly modelVersion: string;
  npv(
    series: CashFlowSeries,
    discountRatePerPeriod: DecimalString,
  ): CalculationResult<DecimalString>;
  /** Undefined value when IRR does not exist or is not unique (reported in warnings). */
  irr(series: CashFlowSeries): CalculationResult<DecimalString | undefined>;
  mirr(
    series: CashFlowSeries,
    financeRate: DecimalString,
    reinvestRate: DecimalString,
  ): CalculationResult<DecimalString | undefined>;
  paybackPeriod(series: CashFlowSeries): CalculationResult<DecimalString | undefined>;
  discountedPaybackPeriod(
    series: CashFlowSeries,
    discountRatePerPeriod: DecimalString,
  ): CalculationResult<DecimalString | undefined>;
  dscr(
    operatingCashFlow: DecimalString,
    debtService: DecimalString,
  ): CalculationResult<DecimalString | undefined>;
  breakEvenUnits(
    fixedCosts: DecimalString,
    pricePerUnit: DecimalString,
    variableCostPerUnit: DecimalString,
  ): CalculationResult<DecimalString | undefined>;
  wacc(input: {
    equity: DecimalString;
    debt: DecimalString;
    costOfEquity: DecimalString;
    costOfDebt: DecimalString;
    taxRate: DecimalString;
  }): CalculationResult<DecimalString>;
}

export interface SensitivityRequest {
  base: CashFlowSeries;
  /** Named driver → relative changes to evaluate, e.g. { price: ["-0.1", "0.1"] }. */
  drivers: Record<string, DecimalString[]>;
  scenario: Scenario;
}
