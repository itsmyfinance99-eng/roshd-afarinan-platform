import type { DecimalString } from './decimal';

/** ISO 4217 code, e.g. "IRR", "USD", "EUR". Projects may define any currency (COMFAR VII.I). */
export type CurrencyCode = string;

export type PeriodUnit = 'month' | 'quarter' | 'half-year' | 'year';

export interface CashFlowSeries {
  currency: CurrencyCode;
  periodUnit: PeriodUnit;
  /** Index 0 is the first period of the planning horizon (usually investment, negative). */
  flows: DecimalString[];
}

export type Scenario = 'BASE' | 'OPTIMISTIC' | 'PESSIMISTIC' | (string & {});

/**
 * Something the user should know about a result: a value that does not exist (no IRR), is not
 * unique, or relied on a COMFAR default. `code` is stable for tests and translations; the UI
 * renders a Persian message from it.
 */
export interface CalculationWarning {
  code: string;
  /** Extra values for the message, e.g. { roots: "2" }. */
  params?: Record<string, string>;
}

/**
 * A COMFAR convention that kept its default because the user did not override it
 * (comfar-model-spec §3.1). Listed on every result so reports can show «پیش‌فرض COMFAR».
 */
export interface DefaultUsed {
  key:
    | 'mirr.rates'
    | 'discounting.referenceDate'
    | 'loan.firstRepaymentDate'
    | 'assets.residualValuePeriod'
    | 'breakEven.period'
    | 'cash.autoCoverage';
  /** The value applied, as text (e.g. a rate or a period key). */
  value: string;
}

export interface CalculationResult<T> {
  value: T;
  /** e.g. `0.1.0`; stored with every saved run so later model changes stay traceable. */
  modelVersion: string;
  warnings: CalculationWarning[];
  defaultsUsed: DefaultUsed[];
}

/**
 * Indicator contract (port) shared with the API (`apps/api/src/modules/financial-engine`).
 * Implemented by ST-33.02 … ST-33.04; signatures may still grow there.
 */
export interface FinancialCalculator {
  readonly modelVersion: string;
  npv(
    series: CashFlowSeries,
    discountRatePerPeriod: DecimalString,
  ): CalculationResult<DecimalString>;
  /** Undefined when no IRR exists; every root found is reported when there are several. */
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
