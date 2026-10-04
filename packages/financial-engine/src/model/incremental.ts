import { ZERO, toDecimal, toDecimalString, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import type { CalculationResult, CalculationWarning, DefaultUsed } from '../types';
import { MODEL_VERSION } from '../version';
import { discountedFlow, type DiscountedCashFlow } from './discounted-flow';
import type { PlanningHorizon } from './horizon';
import {
  discountRates,
  type CashFlowForPlanning,
  type FinancialStatements,
  type StatementsInput,
} from './statements';

/**
 * Incremental analysis (manual XIV, VII.T; comfar-model-spec §7.2): the effect of a project on an
 * existing enterprise is the difference between two cases with the same planning horizon — the
 * enterprise with the project and the enterprise without it. The difference of the cash flow for
 * financial planning and of the two discounted cash flows is taken line by line, and the
 * indicators (NPV, IRR, MIRR, payback) are those of the difference. Starting balances that both
 * cases share cancel, so the result is the project in isolation.
 */

/** What the analysis needs of a calculated case: a stored run has both. */
export interface IncrementalCase {
  horizon: PlanningHorizon;
  statements: Pick<FinancialStatements, 'cashFlow' | 'totalCapital' | 'equity'>;
}

export interface IncrementalInput {
  withProject: IncrementalCase;
  /** The base case: the existing enterprise without the new investment. */
  withoutProject: IncrementalCase;
  /**
   * Discounting of the difference, as for the statements. The engine has no rate of its own;
   * callers pass the rates of the case with the project.
   */
  discounting: StatementsInput['discounting'];
}

export interface IncrementalAnalysis {
  /** Every line of the cash flow for financial planning: with the project less without it. */
  cashFlow: CashFlowForPlanning;
  /** Discounted cash flows of the difference, with the indicators of the difference. */
  totalCapital: DiscountedCashFlow;
  equity: DiscountedCashFlow;
}

type Lines = { [key: string]: DecimalString[] | Lines };

/** `a − b` for every line of two schedules of the same shape. */
function difference<T>(a: T, b: T): T {
  const walk = (
    x: Lines | DecimalString[],
    y: Lines | DecimalString[],
  ): Lines | DecimalString[] => {
    if (Array.isArray(x)) {
      const other = Array.isArray(y) ? y : [];
      return x.map((v, j) => toDecimalString(toDecimal(v).minus(other[j] ?? '0')));
    }
    const other = Array.isArray(y) ? {} : y;
    return Object.fromEntries(
      Object.entries(x).map(([key, value]) => [key, walk(value, other[key] ?? [])]),
    );
  };
  return walk(a as Lines, b as Lines) as T;
}

function sameHorizon(a: PlanningHorizon, b: PlanningHorizon): boolean {
  return (
    a.periods.length === b.periods.length &&
    a.periods.every((p, j) => {
      const q = b.periods[j];
      return (
        q !== undefined &&
        p.months === q.months &&
        p.end.year === q.end.year &&
        p.end.month === q.end.month
      );
    })
  );
}

/** The project in isolation: the case with the project less the case without it. */
export function incrementalAnalysis(
  input: IncrementalInput,
): CalculationResult<IncrementalAnalysis> {
  const { withProject, withoutProject, discounting } = input;
  const warnings: CalculationWarning[] = [];
  const defaultsUsed: DefaultUsed[] = [];
  const a = withProject.statements;
  const b = withoutProject.statements;
  const salvageColumn = a.totalCapital.salvageColumn;
  if (
    !sameHorizon(withProject.horizon, withoutProject.horizon) ||
    b.totalCapital.salvageColumn !== salvageColumn
  ) {
    throw new EngineInputError('incremental.horizonMismatch', 'withoutProject');
  }
  const reference = discounting.reference;
  if (
    reference !== undefined &&
    reference !== 'START_OF_FIRST_PERIOD' &&
    reference !== 'END_OF_FIRST_YEAR'
  ) {
    throw new EngineInputError('statements.option', 'discounting.reference');
  }
  const months = withProject.horizon.periods.map((p) => p.months);
  const length = months.length;
  const flow = (basis: 'totalCapital' | 'equity', rate: DecimalString | DecimalString[]) => {
    const rates = discountRates(
      rate,
      length,
      basis === 'totalCapital' ? 'discounting.totalCapitalRate' : 'discounting.equityRate',
    );
    const minus = (x: DecimalString[], y: DecimalString[]): Decimal[] =>
      months.map((_, j) => toDecimal(x[j] ?? '0').minus(y[j] ?? '0'));
    const inflow = minus(a[basis].inflow, b[basis].inflow);
    const outflow = minus(a[basis].outflow, b[basis].outflow);
    const starting = [a[basis].startingBalance, b[basis].startingBalance];
    const calculated = discountedFlow({
      basis,
      net: inflow.map((v, j) => v.minus(outflow[j] ?? ZERO)),
      residual: toDecimal(a[basis].residualValue).minus(b[basis].residualValue),
      // Only when a case has starting balances; equal ones cancel.
      ...(starting.every((s) => s === undefined)
        ? {}
        : { startingBalance: toDecimal(starting[0] ?? '0').minus(starting[1] ?? '0') }),
      months,
      rates,
      salvageColumn,
      ...(reference === undefined ? {} : { reference }),
      ...(discounting.reinvestmentRate === undefined
        ? {}
        : { reinvestmentRate: discounting.reinvestmentRate }),
      ...(discounting.borrowingRate === undefined
        ? {}
        : { borrowingRate: discounting.borrowingRate }),
      scope: 'ALL',
    });
    warnings.push(...calculated.warnings);
    for (const d of calculated.defaultsUsed) {
      if (d.key !== 'discounting.referenceDate' || !defaultsUsed.some((x) => x.key === d.key)) {
        defaultsUsed.push(d);
      }
    }
    return {
      ...calculated.result,
      inflow: inflow.map((v) => toDecimalString(v)),
      outflow: outflow.map((v) => toDecimalString(v)),
    };
  };
  const value: IncrementalAnalysis = {
    cashFlow: difference(a.cashFlow, b.cashFlow),
    totalCapital: flow('totalCapital', discounting.totalCapitalRate),
    equity: flow('equity', discounting.equityRate),
  };
  return { value, modelVersion: MODEL_VERSION, warnings, defaultsUsed };
}
