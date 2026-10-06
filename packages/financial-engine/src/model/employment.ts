import { ZERO, toDecimal, toDecimalString, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import type { CalculationResult, CalculationWarning } from '../types';
import { MODEL_VERSION } from '../version';
import {
  economicBase,
  type EconomicScheduleInput,
  type EmploymentInput,
  type IndirectEmploymentInput,
} from './economic';

/**
 * Employment effect of the project (manual VIII.L, X.D.3, XII.C; comfar-model-spec §6.3): the jobs
 * the project creates itself — the people its wage items employ — and, as the user enters them,
 * in the projects that supply its inputs and use its outputs, with the investment and the wage
 * bill behind them — all for the reference year, in local currency — and the ratios of jobs,
 * investment and wages.
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
  /** COMFAR's employment effect: jobs per unit of investment; null without a positive one. */
  jobsPerInvestment: BySkill<DecimalString | null>;
  /** Investment per job; null without jobs or without a positive investment. */
  investmentPerJob: BySkill<DecimalString | null>;
  /** Investment over the wage bill of the reference year; null without wages or investment. */
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
  // Without a positive investment no ratio to it means anything.
  const invested = investment.gt(0);
  const over = (value: Decimal) =>
    invested && !value.isZero() ? investment.div(value) : undefined;
  return {
    jobs: strings(jobs),
    investment: toDecimalString(investment),
    wages: strings(wages),
    jobsPerInvestment: ratios(jobs, (value) => (invested ? value.div(investment) : undefined)),
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
  const warnings: CalculationWarning[] = [];

  // The wage bill of the reference year: the wages in the products sold, before any adjustment.
  const inReferenceYear = horizon.periods.map(
    (period, j) =>
      period.phase !== 'CONSTRUCTION' &&
      horizon.balanceYears.findIndex((year) => year.period >= j) === referenceYear,
  );
  const months = horizon.balanceYears[referenceYear]?.months ?? 12;
  if (months < 12) {
    warnings.push({ code: 'employment.partialReferenceYear', params: { months: String(months) } });
  }
  let unskilledWages = ZERO;
  let wages = ZERO;
  let unskilledJobs = ZERO;
  let skilledJobs = ZERO;
  for (const cost of costs) {
    if (cost.nature !== 'WAGES') continue;
    // The jobs within the project: the people its wage items employ.
    if (cost.workers === undefined) {
      throw new EngineInputError('economic.workersRequired', cost.workersField, { item: cost.key });
    }
    if (cost.skill === 'UNSKILLED') unskilledJobs = unskilledJobs.plus(cost.workers);
    else skilledJobs = skilledJobs.plus(cost.workers);
    const ofYear = cost.sold.reduce(
      (s, v, j) => (inReferenceYear[j] === true ? s.plus(v) : s),
      ZERO,
    );
    wages = wages.plus(ofYear);
    if (cost.skill === 'UNSKILLED') unskilledWages = unskilledWages.plus(ofYear);
  }
  // Total investment of the project: fixed investment, pre-production expenditures and the
  // increases of the net working capital over the planning horizon. What an existing enterprise
  // starts with is not invested by the project.
  const investment = statements.totalCapital.investment
    .slice(0, horizon.periods.length)
    .reduce((s, v) => s.plus(toDecimal(v)), ZERO);

  const direct: Amounts = {
    unskilledJobs,
    skilledJobs,
    investment,
    unskilledWages,
    skilledWages: wages.minus(unskilledWages),
  };
  const inputSupplying = indirectAmounts(employment.inputSupplying, 'employment.inputSupplying');
  const outputUsing = indirectAmounts(employment.outputUsing, 'employment.outputUsing');
  const indirect = plus(inputSupplying, outputUsing);
  if (!investment.gt(0)) warnings.push({ code: 'employment.noInvestment' });

  const value: EmploymentSchedule = {
    referenceYear,
    direct: employmentLine(direct),
    inputSupplying: employmentLine(inputSupplying),
    outputUsing: employmentLine(outputUsing),
    indirect: employmentLine(indirect),
    total: employmentLine(plus(direct, indirect)),
  };
  return { value, modelVersion: MODEL_VERSION, warnings, defaultsUsed: [] };
}
