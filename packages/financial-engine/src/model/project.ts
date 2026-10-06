import { toDecimalString, type DecimalString } from '../decimal';
import type { CalculationResult, CalculationWarning, CurrencyCode, DefaultUsed } from '../types';
import { MODEL_VERSION } from '../version';
import { EngineInputError } from '../errors';
import {
  financingSchedule,
  type EquityContribution,
  type FinancingLoan,
  type FinancingSchedule,
} from './financing';
import { planHorizon, type HorizonInput, type PlanningHorizon } from './horizon';
import { investmentSchedule, type InvestmentItem, type InvestmentSchedule } from './investment';
import { operationsSchedule, type OperationsInput, type OperationsSchedule } from './operations';
import { startingAmount, type StartingBalances } from './starting-balances';
import { financialStatements, type FinancialStatements, type StatementsInput } from './statements';
import { valueAdded, type EconomicInput, type ValueAddedSchedule } from './value-added';

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
  statements: Omit<
    StatementsInput,
    'horizon' | 'investment' | 'financing' | 'operations' | 'startingCash'
  >;
  /**
   * Starting balances of an existing enterprise: present for an expansion or rehabilitation
   * project (manual VII.T), absent for a new project.
   */
  startingBalances?: StartingBalances;
  /**
   * Economic analysis (manual VIII): present when the user asks for it. It reads the financial
   * schedules and changes none of them.
   */
  economic?: EconomicInput;
}

export interface ProjectModel {
  horizon: PlanningHorizon;
  investment: InvestmentSchedule;
  financing: FinancingSchedule;
  operations: OperationsSchedule;
  statements: FinancialStatements;
  /** Only with an `economic` input. */
  economic?: { valueAdded: ValueAddedSchedule };
}

/** Inputs shared by every schedule: an error in them keeps its own path. */
const SHARED = /^(exchangeRates|inflation|localCurrency|startingBalances)\b/;

/** Runs `fn`, prefixing the field of an input error with the section of the input it belongs to. */
function withField<T>(section: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof EngineInputError && !SHARED.test(error.field)) {
      throw new EngineInputError(error.code, `${section}.${error.field}`, error.params);
    }
    throw error;
  }
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
  const balances = input.startingBalances;
  const starting = balances === undefined ? {} : { startingBalances: balances };
  const startingCash =
    balances === undefined
      ? undefined
      : toDecimalString(startingAmount(balances.cashSurplus, 'startingBalances.cashSurplus'));
  const investment = collect(
    withField('investment', () =>
      investmentSchedule({ ...context, items: input.investment.items, ...starting }),
    ),
  );
  const financing = collect(
    withField('financing', () =>
      financingSchedule({
        horizon,
        localCurrency: input.localCurrency,
        exchangeRates: input.exchangeRates,
        ...input.financing,
        ...starting,
      }),
    ),
  );
  const operations = collect(
    withField('operations', () =>
      operationsSchedule({ ...context, ...input.operations, ...starting }),
    ),
  );
  const statements = collect(
    withField('statements', () =>
      financialStatements({
        horizon,
        investment,
        financing,
        operations,
        ...input.statements,
        ...(startingCash === undefined ? {} : { startingCash }),
      }),
    ),
  );
  const reference = input.statements.discounting.reference;
  const economicInput = input.economic;
  const economic =
    economicInput === undefined
      ? undefined
      : {
          valueAdded: collect(
            withField('economic', () =>
              valueAdded({
                horizon,
                investment,
                financing,
                operations,
                statements,
                economic: economicInput,
                ...(reference === undefined ? {} : { reference }),
              }),
            ),
          ),
        };
  return {
    value: {
      horizon,
      investment,
      financing,
      operations,
      statements,
      ...(economic === undefined ? {} : { economic }),
    },
    modelVersion: MODEL_VERSION,
    warnings,
    defaultsUsed,
  };
}
