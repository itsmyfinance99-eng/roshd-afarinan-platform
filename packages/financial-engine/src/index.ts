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
export { EngineInputError, isEngineInputError } from './errors';
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
export {
  planHorizon,
  type BalanceYear,
  type HorizonInput,
  type HorizonPeriod,
  type PeriodLength,
  type PeriodPhase,
  type PlanningHorizon,
} from './model/horizon';
export {
  depreciateAcquisitions,
  type AssetBookValues,
  type AssetDepreciation,
} from './model/asset-depreciation';
export {
  INVESTMENT_GROUPS,
  investmentSchedule,
  type InvestmentGroup,
  type InvestmentInput,
  type InvestmentItem,
  type InvestmentItemSchedule,
  type InvestmentSchedule,
  type Origin,
  type OriginSplit,
} from './model/investment';
export {
  EQUITY_CLASSES,
  financingSchedule,
  type EquityClass,
  type EquityContribution,
  type FinancingInput,
  type FinancingLoan,
  type FinancingLoanSchedule,
  type FinancingSchedule,
} from './model/financing';
export {
  ALLOCATION_KEYS,
  COST_CATEGORIES,
  COST_CENTRE_GROUPS,
  operationsSchedule,
  type AllocationKey,
  type CostAllocation,
  type CostBreakdown,
  type CostCategory,
  type CostCentre,
  type CostCentreGroup,
  type CostItem,
  type Market,
  type OperationsInput,
  type OperationsProduct,
  type OperationsSchedule,
  type PerPeriod,
  type ProductSchedule,
  type RevenueLines,
  type SalesLine,
  type StandardCost,
  type WorkingCapitalSchedule,
} from './model/operations';
export {
  currentPriceFactors,
  projectYears,
  type PriceContext,
  type PricedItem,
} from './model/prices';
export { productionProgramme, type Programme, type ProgrammeInput } from './model/sales-programme';
export {
  coverageDays,
  workingCapitalValues,
  type Coverage,
  type WorkingCapitalItemInput,
} from './model/working-capital';
export {
  graduatedTax,
  incomeTax,
  type PerYear,
  type TaxBracket,
  type TaxConditions,
  type TaxYear,
} from './model/tax';
export {
  distributeProfit,
  type DividendShareholder,
  type ProfitDistribution,
} from './model/dividends';
export {
  financialStatements,
  type AssetSale,
  type BalanceSheet,
  type CashFlowForPlanning,
  type DiscountedCashFlow,
  type FinancialStatements,
  type IncomeStatement,
  type ResidualValueTiming,
  type ShareholderDividends,
  type StartingBalanceSheet,
  type StatementsInput,
} from './model/statements';
export type { StartingBalances } from './model/starting-balances';
export {
  incrementalAnalysis,
  type IncrementalAnalysis,
  type IncrementalCase,
  type IncrementalInput,
} from './model/incremental';
export { projectModel, type ProjectInput, type ProjectModel } from './model/project';
export {
  applyChanges,
  criticalValues,
  goalSeek,
  indicatorSummary,
  scenarioAnalysis,
  sensitivityAnalysis,
  type BasisIndicators,
  type ChangeDimension,
  type ChangeTarget,
  type CriticalValue,
  type CriticalVariable,
  type GoalSeekValue,
  type GoalSeekVariable,
  type GoalTarget,
  type IndicatorBasis,
  type IndicatorSummary,
  type ProjectChange,
  type ScenarioInput,
  type ScenarioResult,
  type SensitivityPoint,
  type SensitivityValue,
  type SensitivityVariable,
  type TornadoBar,
} from './model/sensitivity';
export { financialCalculator } from './calculator';
