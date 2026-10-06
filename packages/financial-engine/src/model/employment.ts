import { ZERO, toDecimal, toDecimalString, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import type { CalculationResult } from '../types';
import { MODEL_VERSION } from '../version';
import {
  economicBase,
  type EconomicScheduleInput,
  type EmploymentInput,
  type IndirectEmploymentInput,
} from './economic';

/**
 * Employment effect of the project (manual VIII.L, X.D.3, XII.C; comfar-model-spec §6.3): the jobs
 * the project creates itself and, as the user enters them, in the projects that supply its inputs
 * and use its outputs, with the investment and the wage bill behind them — all for the reference
 * year, in local currency — and the ratios of jobs, investment and wages.
 */

/** A value for unskilled labour, for skilled labour and for both. */
export interface BySkill<T> {
  unskilled: T;
  skilled: T;
  total: T;
}

export interface EmploymentLine {
  /** Number of jobs in the reference year. */
  jobs: BySkill<DecimalString>;
  investment: DecimalString;
  /** Wage bill of the reference year. */
  wages: BySkill<DecimalString>;
  /** COMFAR's employment effect: jobs per unit of investment; null without investment. */
  jobsPerInvestment: BySkill<DecimalString | null>;
  /** Investment per job; null without jobs. */
  investmentPerJob: BySkill<DecimalString | null>;
  /** Investment over the wage bill of the reference year; null without wages. */
  investmentToWages: BySkill<DecimalString | null>;
}

export interface EmploymentSchedule {
  /** The financial year of production the jobs and wage bills belong to (from 0). */
  referenceYear: number;
  direct: EmploymentLine;
  /** Suppliers upstream. */
  inputSupplying: EmploymentLine;
  /** Users downstream. */
  outputUsing: EmploymentLine;
  indirect: EmploymentLine;
  total: EmploymentLine;
}

export interface EmploymentEffectInput extends EconomicScheduleInput {
  employment: EmploymentInput;
  /** COMFAR's reference year: a financial year of production (from 0). */
  referenceYear: number;
}

interface Amounts {
  unskilledJobs: Decimal;
  skilledJobs: Decimal;
  investment: Decimal;
  unskilledWages: Decimal;
  skilledWages: Decimal;
}

function amount(value: DecimalString, field: string): Decimal {
  const parsed = toDecimal(value);
  if (parsed.isNegative() && !parsed.isZero()) throw new EngineInputError('amount.negative', field);
  return parsed;
}

function indirectAmounts(entry: IndirectEmploymentInput, field: string): Amounts {
  return {
    unskilledJobs: amount(entry.unskilled.workers, `${field}.unskilled.workers`),
    skilledJobs: amount(entry.skilled.workers, `${field}.skilled.workers`),
    investment: amount(entry.investment, `${field}.investment`),
    unskilledWages: amount(entry.unskilled.wageBill, `${field}.unskilled.wageBill`),
    skilledWages: amount(entry.skilled.wageBill, `${field}.skilled.wageBill`),
  };
}

const plus = (a: Amounts, b: Amounts): Amounts => ({
  unskilledJobs: a.unskilledJobs.plus(b.unskilledJobs),
  skilledJobs: a.skilledJobs.plus(b.skilledJobs),
  investment: a.investment.plus(b.investment),
  unskilledWages: a.unskilledWages.plus(b.unskilledWages),
  skilledWages: a.skilledWages.plus(b.skilledWages),
});

const bySkill = (unskilled: Decimal, skilled: Decimal): BySkill<Decimal> => ({
  unskilled,
  skilled,
  total: unskilled.plus(skilled),
});

function employmentLine(amounts: Amounts): EmploymentLine {
  const jobs = bySkill(amounts.unskilledJobs, amounts.skilledJobs);
  const wages = bySkill(amounts.unskilledWages, amounts.skilledWages);
  const strings = (values: BySkill<Decimal>): BySkill<DecimalString> => ({
    unskilled: toDecimalString(values.unskilled),
    skilled: toDecimalString(values.skilled),
    total: toDecimalString(values.total),
  });
  const ratios = (
    values: BySkill<Decimal>,
    ratio: (value: Decimal) => Decimal | undefined,
  ): BySkill<DecimalString | null> => {
    const of = (value: Decimal) => {
      const result = ratio(value);
      return result === undefined ? null : toDecimalString(result);
    };
    return {
      unskilled: of(values.unskilled),
      skilled: of(values.skilled),
      total: of(values.total),
    };
  };
  const { investment } = amounts;
  const over = (value: Decimal) => (value.isZero() ? undefined : investment.div(value));
  return {
    jobs: strings(jobs),
    investment: toDecimalString(investment),
    wages: strings(wages),
    jobsPerInvestment: ratios(jobs, (value) =>
      investment.isZero() ? undefined : value.div(investment),
    ),
    investmentPerJob: ratios(jobs, over),
    investmentToWages: ratios(wages, over),
  };
}

/** The employment effect of a calculated project. */
export function employmentEffect(
  input: EmploymentEffectInput,
): CalculationResult<EmploymentSchedule> {
  const { horizon, statements, employment, referenceYear } = input;
  const { costs } = economicBase(input);

  // The wage bill of the reference year: the wages in the products sold, before any adjustment.
  const inReferenceYear = horizon.periods.map(
    (period, j) =>
      period.phase !== 'CONSTRUCTION' &&
      horizon.balanceYears.findIndex((year) => year.period >= j) === referenceYear,
  );
  let unskilledWages = ZERO;
  let wages = ZERO;
  for (const cost of costs) {
    if (cost.nature !== 'WAGES') continue;
    const ofYear = cost.sold.reduce(
      (s, v, j) => (inReferenceYear[j] === true ? s.plus(v) : s),
      ZERO,
    );
    wages = wages.plus(ofYear);
    if (cost.skill === 'UNSKILLED') unskilledWages = unskilledWages.plus(ofYear);
  }
  // Total investment of the project: fixed investment, pre-production expenditures and the
  // increases of the net working capital over the planning horizon.
  const investment = statements.totalCapital.investment
    .slice(0, horizon.periods.length)
    .reduce((s, v) => s.plus(toDecimal(v)), ZERO);

  const direct: Amounts = {
    unskilledJobs: amount(employment.direct.unskilled, 'employment.direct.unskilled'),
    skilledJobs: amount(employment.direct.skilled, 'employment.direct.skilled'),
    investment,
    unskilledWages,
    skilledWages: wages.minus(unskilledWages),
  };
  const inputSupplying = indirectAmounts(
    employment.indirect.inputSupplying,
    'employment.indirect.inputSupplying',
  );
  const outputUsing = indirectAmounts(
    employment.indirect.outputUsing,
    'employment.indirect.outputUsing',
  );
  const indirect = plus(inputSupplying, outputUsing);

  const value: EmploymentSchedule = {
    referenceYear,
    direct: employmentLine(direct),
    inputSupplying: employmentLine(inputSupplying),
    outputUsing: employmentLine(outputUsing),
    indirect: employmentLine(indirect),
    total: employmentLine(plus(direct, indirect)),
  };
  return { value, modelVersion: MODEL_VERSION, warnings: [], defaultsUsed: [] };
}
