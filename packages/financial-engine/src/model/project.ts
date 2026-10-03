import type { DecimalString } from '../decimal';
import type { CalculationResult, CalculationWarning, CurrencyCode, DefaultUsed } from '../types';
import { MODEL_VERSION } from '../version';
import { withField } from './asset-depreciation';
import {
  financingSchedule,
  type EquityContribution,
  type FinancingLoan,
  type FinancingSchedule,
} from './financing';
import { planHorizon, type HorizonInput, type PlanningHorizon } from './horizon';
import { investmentSchedule, type InvestmentItem, type InvestmentSchedule } from './investment';
import { operationsSchedule, type OperationsInput, type OperationsSchedule } from './operations';
import { financialStatements, type FinancialStatements, type StatementsInput } from './statements';

/**
 * The whole financial model of a project in one call (comfar-model-spec §4): the planning
 * horizon, the investment, financing and operations schedules and the financial statements, from
 * the inputs the user entered. Scenarios, sensitivity analysis and goal seek (ST-34.05) change
 * these inputs and run the model again.
 */

export interface ProjectInput {
  horizon: HorizonInput;
  localCurrency: CurrencyCode;
  /** Local units per unit of each foreign currency, one rate per project period. */
  exchangeRates: Record<CurrencyCode, DecimalString[]>;
  /** Inflation per currency and project year; absent = constant prices. */
  inflation?: Record<CurrencyCode, DecimalString[]>;
  investment: { items: InvestmentItem[] };
  financing: { equity: EquityContribution[]; loans: FinancingLoan[] };
  operations: Pick<OperationsInput, 'products' | 'costs' | 'costCentres' | 'cash'>;
  statements: Omit<StatementsInput, 'horizon' | 'investment' | 'financing' | 'operations'>;
}

export interface ProjectModel {
  horizon: PlanningHorizon;
  investment: InvestmentSchedule;
  financing: FinancingSchedule;
  operations: OperationsSchedule;
  statements: FinancialStatements;
}

/** Runs every schedule of the project; input errors carry the path of the section they are in. */
export function projectModel(input: ProjectInput): CalculationResult<ProjectModel> {
  const warnings: CalculationWarning[] = [];
  const defaultsUsed: DefaultUsed[] = [];
  const collect = <T>(result: CalculationResult<T>): T => {
    warnings.push(...result.warnings);
    defaultsUsed.push(...result.defaultsUsed);
    return result.value;
  };
  const horizon = withField('horizon', () => planHorizon(input.horizon));
  const context = {
    horizon,
    localCurrency: input.localCurrency,
    exchangeRates: input.exchangeRates,
    ...(input.inflation === undefined ? {} : { inflation: input.inflation }),
  };
  const investment = collect(
    withField('investment', () =>
      investmentSchedule({ ...context, items: input.investment.items }),
    ),
  );
  const financing = collect(
    withField('financing', () =>
      financingSchedule({
        horizon,
        localCurrency: input.localCurrency,
        exchangeRates: input.exchangeRates,
        ...input.financing,
      }),
    ),
  );
  const operations = collect(
    withField('operations', () => operationsSchedule({ ...context, ...input.operations })),
  );
  const statements = collect(
    withField('statements', () =>
      financialStatements({ horizon, investment, financing, operations, ...input.statements }),
    ),
  );
  return {
    value: { horizon, investment, financing, operations, statements },
    modelVersion: MODEL_VERSION,
    warnings,
    defaultsUsed,
  };
}
