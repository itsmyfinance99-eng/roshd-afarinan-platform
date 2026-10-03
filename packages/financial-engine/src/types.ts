import type { DecimalString } from './decimal';
import type { EngineMessageCode } from './messages';
import type { depreciationSchedule, revaluedDepreciation } from './depreciation';
import type {
  applyFactors,
  convertCurrency,
  derivedExchangeRates,
  foreignLoanToLocal,
  indexFactorsFromLevels,
  inflationIndex,
  priceEscalationFactors,
  relativeInflationFactors,
} from './indexation';
import type {
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
import type { irr, mirr } from './irr';
import type { loanPeriods, loanSchedule, sumLoanPeriods } from './loans';
import type { financingSchedule } from './model/financing';
import type { planHorizon } from './model/horizon';
import type { investmentSchedule } from './model/investment';
import type { operationsSchedule } from './model/operations';
import type { financialStatements } from './model/statements';
import type { incomeTax } from './model/tax';
import type { npv } from './time-value';

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
  /** Always has a Persian message in `ENGINE_MESSAGES_FA` (checked by the compiler). */
  code: EngineMessageCode;
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
  /** The input it applies to (e.g. a loan's key) when a result covers several. */
  item?: string;
}

export interface CalculationResult<T> {
  value: T;
  /** e.g. `0.1.0`; stored with every saved run so later model changes stay traceable. */
  modelVersion: string;
  warnings: CalculationWarning[];
  defaultsUsed: DefaultUsed[];
}

/**
 * Calculator contract (port) shared with the API (`apps/api/src/modules/financial-engine`). It is
 * derived from the implemented functions, so the port cannot drift from the engine.
 */
export interface FinancialCalculator {
  readonly modelVersion: string;
  npv: typeof npv;
  irr: typeof irr;
  mirr: typeof mirr;
  paybackPeriod: typeof paybackPeriod;
  discountedPaybackPeriod: typeof discountedPaybackPeriod;
  npvRatio: typeof npvRatio;
  benefitCostRatio: typeof benefitCostRatio;
  breakEven: typeof breakEven;
  productBreakEven: typeof productBreakEven;
  debtServiceCoverage: typeof debtServiceCoverage;
  loanLifeCoverage: typeof loanLifeCoverage;
  wacc: typeof wacc;
  depreciationSchedule: typeof depreciationSchedule;
  revaluedDepreciation: typeof revaluedDepreciation;
  priceEscalationFactors: typeof priceEscalationFactors;
  inflationIndex: typeof inflationIndex;
  indexFactorsFromLevels: typeof indexFactorsFromLevels;
  applyFactors: typeof applyFactors;
  relativeInflationFactors: typeof relativeInflationFactors;
  derivedExchangeRates: typeof derivedExchangeRates;
  convertCurrency: typeof convertCurrency;
  foreignLoanToLocal: typeof foreignLoanToLocal;
  loanSchedule: typeof loanSchedule;
  loanPeriods: typeof loanPeriods;
  sumLoanPeriods: typeof sumLoanPeriods;
  planHorizon: typeof planHorizon;
  investmentSchedule: typeof investmentSchedule;
  financingSchedule: typeof financingSchedule;
  operationsSchedule: typeof operationsSchedule;
  incomeTax: typeof incomeTax;
  financialStatements: typeof financialStatements;
}

export interface SensitivityRequest {
  base: CashFlowSeries;
  /** Named driver → relative changes to evaluate, e.g. { price: ["-0.1", "0.1"] }. */
  drivers: Record<string, DecimalString[]>;
  scenario: Scenario;
}
