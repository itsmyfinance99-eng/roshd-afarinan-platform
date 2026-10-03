import {
  ONE,
  ZERO,
  toDecimal,
  toDecimalString,
  type Decimal,
  type DecimalString,
} from '../decimal';
import { EngineInputError } from '../errors';
import type { CalculationResult, CalculationWarning, CurrencyCode, DefaultUsed } from '../types';
import { MODEL_VERSION } from '../version';
import { INVESTMENT_GROUPS, uniqueKeys, type InvestmentGroup } from './investment';
import { COST_CATEGORIES, type CostCategory, type CostItem, type SalesLine } from './operations';
import { projectModel, type ProjectInput, type ProjectModel } from './project';

/**
 * Scenarios, sensitivity analysis, critical values and goal seek (manual XIII; comfar-model-spec
 * §7). Everything works the way COMFAR's Sensitivity feature does: inputs are changed by a
 * percentage of their original value, constant over the planning horizon, and the whole model is
 * calculated again — so tax, working capital, financing and cash deficits follow the change.
 */

/** What a change applies to. A target without a key covers every item of its kind. */
export type ChangeTarget =
  | { kind: 'SALES'; product?: string; line?: string }
  | { kind: 'PRODUCTION_COSTS'; item?: string; category?: CostCategory }
  | { kind: 'FIXED_INVESTMENT'; item?: string; group?: InvestmentGroup }
  | { kind: 'EXCHANGE_RATE'; currency?: CurrencyCode }
  | { kind: 'INFLATION'; currency?: CurrencyCode }
  | { kind: 'DISCOUNT_RATE' };

/** Quantities or prices; rates (exchange, inflation, discount) and investment amounts are prices. */
export type ChangeDimension = 'quantity' | 'price';

export interface ProjectChange {
  target: ChangeTarget;
  /** Relative change of the quantities, e.g. "-0.1" = 10 % less. */
  quantity?: DecimalString;
  /** Relative change of the prices or rates. */
  price?: DecimalString;
}

export interface SensitivityVariable {
  key: string;
  target: ChangeTarget;
  dimension: ChangeDimension;
}

export type IndicatorBasis = 'totalCapital' | 'equity';

export interface BasisIndicators {
  npv: DecimalString;
  irr?: DecimalString;
  mirr?: DecimalString;
  /** Months from the start of the horizon (interpolated). */
  paybackMonths?: DecimalString;
  dynamicPaybackMonths?: DecimalString;
}

export interface IndicatorSummary {
  totalCapital: BasisIndicators & { npvRatio?: DecimalString };
  equity: BasisIndicators;
}

const KINDS = [
  'SALES',
  'PRODUCTION_COSTS',
  'FIXED_INVESTMENT',
  'EXCHANGE_RATE',
  'INFLATION',
  'DISCOUNT_RATE',
] as const;
const PRICE_ONLY: readonly string[] = ['EXCHANGE_RATE', 'INFLATION', 'DISCOUNT_RATE'];

const scale = (value: DecimalString, factor: Decimal) =>
  toDecimalString(toDecimal(value).times(factor));
const scaleAll = <T extends DecimalString | DecimalString[]>(value: T, factor: Decimal): T =>
  (typeof value === 'string' ? scale(value, factor) : value.map((v) => scale(v, factor))) as T;

function factorOf(change: DecimalString | undefined, field: string): Decimal {
  if (change === undefined) return ONE;
  const value = toDecimal(change);
  if (value.lt(-1)) throw new EngineInputError('sensitivity.changeBelowMinus100', field);
  return value.plus(1);
}

function checkTarget(target: ChangeTarget, field: string): void {
  if (!(KINDS as readonly string[]).includes(target.kind)) {
    throw new EngineInputError('sensitivity.target', `${field}.kind`);
  }
  if (
    target.kind === 'PRODUCTION_COSTS' &&
    target.category !== undefined &&
    !(COST_CATEGORIES as readonly string[]).includes(target.category)
  ) {
    throw new EngineInputError('sensitivity.target', `${field}.category`);
  }
  if (
    target.kind === 'FIXED_INVESTMENT' &&
    target.group !== undefined &&
    !(INVESTMENT_GROUPS as readonly string[]).includes(target.group)
  ) {
    throw new EngineInputError('sensitivity.target', `${field}.group`);
  }
}

function changeSalesLine(line: SalesLine, quantity: Decimal, price: Decimal): SalesLine {
  return {
    ...line,
    ...(line.quantities === undefined ? {} : { quantities: scaleAll(line.quantities, quantity) }),
    ...(line.capacityShares === undefined
      ? {}
      : { capacityShares: scaleAll(line.capacityShares, quantity) }),
    price: scaleAll(line.price, price),
  };
}

function changeCost(item: CostItem, quantity: Decimal, price: Decimal): CostItem {
  const standard = item.standard;
  const adjustments = item.adjustments;
  return {
    ...item,
    ...(standard === undefined
      ? {}
      : {
          standard:
            standard.mode === 'PER_UNIT'
              ? {
                  ...standard,
                  quantity: scale(standard.quantity, quantity),
                  price: scale(standard.price, price),
                  // The fixed cost is an amount: it follows the price, not the quantity.
                  fixedCost: scale(standard.fixedCost, price),
                }
              : {
                  ...standard,
                  quantity: scale(standard.quantity, quantity),
                  price: scale(standard.price, price),
                },
        }),
    ...(adjustments === undefined
      ? {}
      : {
          adjustments: {
            ...adjustments,
            quantities: scaleAll(adjustments.quantities, quantity),
            prices: scaleAll(adjustments.prices, price),
          },
        }),
  };
}

/** One change applied to the inputs; a target that matches nothing is refused. */
function applyChange(input: ProjectInput, change: ProjectChange, field: string): ProjectInput {
  const { target } = change;
  checkTarget(target, `${field}.target`);
  if (PRICE_ONLY.includes(target.kind) && change.quantity !== undefined) {
    throw new EngineInputError('sensitivity.dimension', `${field}.quantity`);
  }
  const quantity = factorOf(change.quantity, `${field}.quantity`);
  const price = factorOf(change.price, `${field}.price`);
  let matched = false;
  const hit = <T>(value: T): T => {
    matched = true;
    return value;
  };
  let next = input;
  switch (target.kind) {
    case 'SALES':
      next = {
        ...input,
        operations: {
          ...input.operations,
          products: input.operations.products.map((product) =>
            target.product !== undefined && target.product !== product.key
              ? product
              : {
                  ...product,
                  sales: product.sales.map((line) =>
                    target.line !== undefined && target.line !== line.key
                      ? line
                      : hit(changeSalesLine(line, quantity, price)),
                  ),
                },
          ),
        },
      };
      break;
    case 'PRODUCTION_COSTS':
      next = {
        ...input,
        operations: {
          ...input.operations,
          costs: input.operations.costs.map((item) =>
            (target.item !== undefined && target.item !== item.key) ||
            (target.category !== undefined && target.category !== item.category)
              ? item
              : hit(changeCost(item, quantity, price)),
          ),
        },
      };
      break;
    case 'FIXED_INVESTMENT':
      next = {
        ...input,
        investment: {
          items: input.investment.items.map((item) =>
            item.group === 'PRE_PRODUCTION' ||
            (target.item !== undefined && target.item !== item.key) ||
            (target.group !== undefined && target.group !== item.group)
              ? item
              : hit({ ...item, amounts: scaleAll(item.amounts, quantity.times(price)) }),
          ),
        },
      };
      break;
    case 'EXCHANGE_RATE':
      next = {
        ...input,
        exchangeRates: Object.fromEntries(
          Object.entries(input.exchangeRates).map(([currency, rates]) => [
            currency,
            target.currency !== undefined && target.currency !== currency
              ? rates
              : hit(scaleAll(rates, price)),
          ]),
        ),
      };
      break;
    case 'INFLATION':
      next = {
        ...input,
        ...(input.inflation === undefined
          ? {}
          : {
              inflation: Object.fromEntries(
                Object.entries(input.inflation).map(([currency, rates]) => [
                  currency,
                  target.currency !== undefined && target.currency !== currency
                    ? rates
                    : hit(scaleAll(rates, price)),
                ]),
              ),
            }),
      };
      break;
    case 'DISCOUNT_RATE': {
      const discounting = input.statements.discounting;
      next = {
        ...input,
        statements: {
          ...input.statements,
          discounting: hit({
            ...discounting,
            totalCapitalRate: scaleAll(discounting.totalCapitalRate, price),
            equityRate: scaleAll(discounting.equityRate, price),
          }),
        },
      };
      break;
    }
  }
  if (!matched) throw new EngineInputError('sensitivity.noMatch', `${field}.target`);
  return next;
}

/**
 * COMFAR's "global change of input data": every change is applied to the original inputs in
 * turn (two changes of the same item multiply). The input itself is not modified.
 */
export function applyChanges(input: ProjectInput, changes: ProjectChange[]): ProjectInput {
  return changes.reduce((next, change, i) => applyChange(next, change, `changes[${i}]`), input);
}

/** The indicators that scenarios and sensitivity compare. */
export function indicatorSummary(model: ProjectModel): IndicatorSummary {
  const of = (flow: ProjectModel['statements']['equity']): BasisIndicators => ({
    npv: flow.npv,
    ...(flow.irr === undefined ? {} : { irr: flow.irr }),
    ...(flow.mirr === undefined ? {} : { mirr: flow.mirr }),
    ...(flow.payback === undefined ? {} : { paybackMonths: flow.payback.months }),
    ...(flow.dynamicPayback === undefined
      ? {}
      : { dynamicPaybackMonths: flow.dynamicPayback.months }),
  });
  const { totalCapital, equity } = model.statements;
  return {
    totalCapital: {
      ...of(totalCapital),
      ...(totalCapital.npvRatio === undefined ? {} : { npvRatio: totalCapital.npvRatio.ratio }),
    },
    equity: of(equity),
  };
}

function result<T>(
  value: T,
  warnings: CalculationWarning[],
  defaultsUsed: DefaultUsed[] = [],
): CalculationResult<T> {
  return { value, modelVersion: MODEL_VERSION, warnings, defaultsUsed };
}

function variableChange(variable: SensitivityVariable, change: DecimalString): ProjectChange {
  return { target: variable.target, [variable.dimension]: change };
}

function checkVariables(input: ProjectInput, variables: SensitivityVariable[]): void {
  if (variables.length === 0) throw new EngineInputError('sensitivity.noVariables', 'variables');
  uniqueKeys(
    variables.map((v) => v.key),
    'variables',
  );
  variables.forEach((v, i) => {
    checkTarget(v.target, `variables[${i}].target`);
    if (
      (v.dimension !== 'quantity' && v.dimension !== 'price') ||
      (v.dimension === 'quantity' && PRICE_ONLY.includes(v.target.kind))
    ) {
      throw new EngineInputError('sensitivity.dimension', `variables[${i}].dimension`);
    }
    // A variable that matches nothing is refused here, with the variable's own field.
    applyChange(input, variableChange(v, '0'), `variables[${i}]`);
  });
}

/** Warnings of `more` that `known` does not already hold. */
function newWarnings(known: CalculationWarning[], more: CalculationWarning[]) {
  const seen = new Set(known.map((w) => JSON.stringify(w)));
  return more.filter((w) => !seen.has(JSON.stringify(w)));
}

/**
 * Runs the model with `changes`; the field of an input error in a change is kept as is. Searches
 * pass the `scope` they need, so that the many runs of a search skip the other indicators.
 */
function run(
  input: ProjectInput,
  changes: ProjectChange[],
  scope?: NonNullable<ProjectInput['statements']['indicatorScope']>,
) {
  const changed = applyChanges(input, changes);
  const model = projectModel(
    scope === undefined
      ? changed
      : { ...changed, statements: { ...changed.statements, indicatorScope: scope } },
  );
  return { indicators: indicatorSummary(model.value), model };
}

// ---------------------------------------------------------------------------------------------
// Scenarios

export interface ScenarioInput {
  key: string;
  changes: ProjectChange[];
}

export interface ScenarioResult {
  key: string;
  indicators: IndicatorSummary;
  warnings: CalculationWarning[];
}

/**
 * The base case and every scenario (a named set of changes, e.g. optimistic and pessimistic),
 * each calculated in full. The defaults listed are those of the base case.
 */
export function scenarioAnalysis(
  input: ProjectInput,
  scenarios: ScenarioInput[],
): CalculationResult<{ base: IndicatorSummary; scenarios: ScenarioResult[] }> {
  uniqueKeys(
    scenarios.map((s) => s.key),
    'scenarios',
  );
  const base = run(input, []);
  const results = scenarios.map((scenario, i): ScenarioResult => {
    let changed: ProjectInput;
    try {
      changed = applyChanges(input, scenario.changes);
    } catch (error) {
      if (error instanceof EngineInputError) {
        throw new EngineInputError(error.code, `scenarios[${i}].${error.field}`, error.params);
      }
      throw error;
    }
    const model = projectModel(changed);
    return {
      key: scenario.key,
      indicators: indicatorSummary(model.value),
      warnings: model.warnings,
    };
  });
  return result(
    { base: base.indicators, scenarios: results },
    base.model.warnings,
    base.model.defaultsUsed,
  );
}

// ---------------------------------------------------------------------------------------------
// One-variable sensitivity

export interface SensitivityPoint {
  /** Relative change of the variable. */
  change: DecimalString;
  indicators: IndicatorSummary;
  /** Warnings of this run that the base case does not have (e.g. an under-financed plan). */
  warnings: CalculationWarning[];
}

export interface TornadoBar {
  key: string;
  /**
   * NPV at the lowest and at the highest change of the variable; the base case (change 0) is one
   * end when all steps lie on one side of it.
   */
  low: { change: DecimalString; npv: DecimalString };
  high: { change: DecimalString; npv: DecimalString };
  /** |NPV(high) − NPV(low)|: the width of the bar. */
  swing: DecimalString;
}

export interface SensitivityValue {
  base: IndicatorSummary;
  variables: { key: string; points: SensitivityPoint[] }[];
  /** Bars sorted by swing, widest first, for the NPV of each basis. */
  tornado: Record<IndicatorBasis, TornadoBar[]>;
}

/**
 * Sensitivity of the indicators to one variable at a time: every variable is changed by every
 * step (entered by the user, e.g. −20 %, −10 %, +10 %, +20 %) while all others stay at their
 * original value.
 */
export function sensitivityAnalysis(
  input: ProjectInput,
  options: { variables: SensitivityVariable[]; steps: DecimalString[] },
): CalculationResult<SensitivityValue> {
  checkVariables(input, options.variables);
  if (options.steps.length === 0) throw new EngineInputError('series.empty', 'steps');
  const steps = options.steps.map((s, i) => {
    factorOf(s, `steps[${i}]`);
    return toDecimal(s);
  });
  steps.forEach((s, i) => {
    if (steps.some((other, k) => k < i && other.eq(s))) {
      throw new EngineInputError('sensitivity.duplicateStep', `steps[${i}]`);
    }
  });
  const ordered = [...steps].sort((a, b) => a.cmp(b));
  const base = run(input, []);
  const variables = options.variables.map((variable) => ({
    key: variable.key,
    points: ordered.map((step): SensitivityPoint => {
      const change = toDecimalString(step);
      const point = run(input, [variableChange(variable, change)]);
      return {
        change,
        indicators: point.indicators,
        warnings: newWarnings(base.model.warnings, point.model.warnings),
      };
    }),
  }));
  const bars = (basis: IndicatorBasis): TornadoBar[] =>
    variables
      .map((v) => {
        const ends = [
          { change: '0', npv: base.indicators[basis].npv },
          ...v.points.map((p) => ({ change: p.change, npv: p.indicators[basis].npv })),
        ].sort((a, b) => toDecimal(a.change).cmp(b.change));
        const low = ends[0] ?? { change: '0', npv: '0' };
        const high = ends[ends.length - 1] ?? low;
        return {
          key: v.key,
          low,
          high,
          swing: toDecimalString(toDecimal(high.npv).minus(low.npv).abs()),
        };
      })
      .sort((a, b) => toDecimal(b.swing).cmp(a.swing));
  return result(
    {
      base: base.indicators,
      variables,
      tornado: { totalCapital: bars('totalCapital'), equity: bars('equity') },
    },
    base.model.warnings,
    base.model.defaultsUsed,
  );
}

// ---------------------------------------------------------------------------------------------
// Goal seek and critical values

export interface GoalTarget {
  indicator: 'NPV' | 'IRR';
  basis: IndicatorBasis;
  value: DecimalString;
}

export interface GoalSeekVariable extends SensitivityVariable {
  /** Largest change allowed, with its sign (e.g. "0.3" = up to +30 %, "-0.2" = down to −20 %). */
  maxChange: DecimalString;
}

export interface GoalSeekValue {
  reached: boolean;
  /** Value of the indicator before any change; absent when it cannot be calculated. */
  base?: DecimalString;
  /** Value of the indicator with all the changes below; absent when it cannot be calculated. */
  achieved?: DecimalString;
  /** The variables that were changed, in order, with the indicator after each. */
  changes: { key: string; change: DecimalString; achieved?: DecimalString }[];
}

/** Width of the change interval at which the search stops (one millionth of a percent). */
const CHANGE_PRECISION = '0.00000001';
const MAX_BISECTIONS = 60;

function indicatorOf(summary: IndicatorSummary, target: Omit<GoalTarget, 'value'>) {
  const value = target.indicator === 'NPV' ? summary[target.basis].npv : summary[target.basis].irr;
  return value === undefined ? undefined : toDecimal(value);
}

function checkGoal(target: Omit<GoalTarget, 'value'>, field: string): void {
  if (target.indicator !== 'NPV' && target.indicator !== 'IRR') {
    throw new EngineInputError('sensitivity.goal', `${field}.indicator`);
  }
  if (target.basis !== 'totalCapital' && target.basis !== 'equity') {
    throw new EngineInputError('sensitivity.goal', `${field}.basis`);
  }
}

/**
 * The change between `from` and `to` at which `distance` (indicator − target) is zero, by
 * bisection. `atFrom` and `atTo` must have opposite signs. Stops early, without a result, when the
 * indicator cannot be calculated at a point.
 */
function bisect(
  distance: (change: Decimal) => Decimal | undefined,
  from: Decimal,
  atFrom: Decimal,
  to: Decimal,
): Decimal | undefined {
  let a = from;
  let atA = atFrom;
  let b = to;
  for (let i = 0; i < MAX_BISECTIONS && b.minus(a).abs().gt(CHANGE_PRECISION); i++) {
    const middle = a.plus(b).div(2);
    const atMiddle = distance(middle);
    if (atMiddle === undefined) return undefined;
    if (atMiddle.isZero()) return middle;
    if (atMiddle.isNegative() === atA.isNegative()) {
      a = middle;
      atA = atMiddle;
    } else {
      b = middle;
    }
  }
  return a.plus(b).div(2);
}

/**
 * COMFAR's "desired IRR / desired NPV": the variables are changed one after the other, each up to
 * its maximal change, until the target is reached. COMFAR moves in steps of one percent; the
 * engine finds the change at which the target is met exactly (to a millionth of a percent). A
 * variable that reaches its limit keeps it and the next one continues from there.
 */
export function goalSeek(
  input: ProjectInput,
  options: { target: GoalTarget; variables: GoalSeekVariable[] },
): CalculationResult<GoalSeekValue> {
  checkGoal(options.target, 'target');
  checkVariables(input, options.variables);
  const goal = toDecimal(options.target.value);
  const limits = options.variables.map((v, i) => {
    const limit = toDecimal(v.maxChange);
    if (limit.isZero())
      throw new EngineInputError('sensitivity.maxChange', `variables[${i}].maxChange`);
    factorOf(v.maxChange, `variables[${i}].maxChange`);
    return limit;
  });
  const base = run(input, []);
  const warnings: CalculationWarning[] = [...base.model.warnings];
  const applied: ProjectChange[] = [];
  const scope = options.target.indicator === 'NPV' ? 'NPV' : 'NPV_AND_IRR';
  /** The indicator with `changes`, and its distance from the goal. */
  const evaluate = (changes: ProjectChange[]) => {
    const indicator = indicatorOf(run(input, changes, scope).indicators, options.target);
    return indicator === undefined ? undefined : { indicator, distance: indicator.minus(goal) };
  };
  const distance = (changes: ProjectChange[]) => evaluate(changes)?.distance;
  const value: GoalSeekValue = { reached: false, changes: [] };
  const finish = (reached: boolean, achieved: Decimal | undefined, last?: ProjectChange) => {
    value.reached = reached;
    if (achieved !== undefined) value.achieved = toDecimalString(achieved);
    if (!reached) warnings.push({ code: 'goalSeek.notReached' });
    // What the plan with the changes found warns about, beyond the base case.
    const changes = last === undefined ? applied : [...applied, last];
    if (changes.length > 0) {
      warnings.push(...newWarnings(warnings, run(input, changes).model.warnings));
    }
    return result(value, warnings, base.model.defaultsUsed);
  };

  const start = indicatorOf(base.indicators, options.target);
  if (start === undefined) {
    warnings.push({ code: 'goalSeek.notCalculable' });
    return finish(false, undefined);
  }
  value.base = toDecimalString(start);
  let current = start.minus(goal);
  let currentValue = start;
  if (current.isZero()) return finish(true, start);

  for (const [i, variable] of options.variables.entries()) {
    const limit = limits[i] ?? ZERO;
    const withChange = (change: Decimal) => [
      ...applied,
      variableChange(variable, toDecimalString(change)),
    ];
    const end = evaluate(withChange(limit));
    if (end === undefined) {
      warnings.push({ code: 'goalSeek.notCalculable', params: { variable: variable.key } });
      return finish(false, currentValue);
    }
    const atLimit = end.distance;
    if (atLimit.isZero() || atLimit.isNegative() !== current.isNegative()) {
      // The target lies within this variable's range.
      const change = atLimit.isZero()
        ? limit
        : bisect((c) => distance(withChange(c)), ZERO, current, limit);
      const found = change === undefined ? undefined : evaluate(withChange(change));
      // An indicator that jumps over the target (e.g. an IRR that stops being unique) leaves the
      // bisection at the jump: the value there is no closer to the target than the ends were.
      if (
        change === undefined ||
        found === undefined ||
        (found.distance.abs().gt(current.abs()) && found.distance.abs().gt(atLimit.abs()))
      ) {
        warnings.push({ code: 'goalSeek.notCalculable', params: { variable: variable.key } });
        return finish(false, currentValue);
      }
      const last = variableChange(variable, toDecimalString(change));
      value.changes.push({
        key: variable.key,
        change: toDecimalString(change),
        achieved: toDecimalString(found.indicator),
      });
      return finish(true, found.indicator, last);
    }
    if (atLimit.abs().gt(current.abs())) {
      warnings.push({ code: 'goalSeek.wrongDirection', params: { variable: variable.key } });
    }
    applied.push(variableChange(variable, toDecimalString(limit)));
    value.changes.push({
      key: variable.key,
      change: toDecimalString(limit),
      achieved: toDecimalString(end.indicator),
    });
    current = atLimit;
    currentValue = end.indicator;
  }
  return finish(false, currentValue);
}

export interface CriticalVariable extends SensitivityVariable {
  /** Range of relative changes to search, e.g. "-0.5" to "1". */
  minChange: DecimalString;
  maxChange: DecimalString;
}

export interface CriticalValue {
  key: string;
  /**
   * Relative changes of the variable at which the NPV is zero: the one below and the one above
   * the original value, when they exist within the range. Empty when there is none.
   */
  changes: DecimalString[];
}

/**
 * Critical value of every variable: the change at which the NPV of the chosen basis turns zero,
 * all other inputs unchanged. A variable without one in its range is reported with a warning.
 */
export function criticalValues(
  input: ProjectInput,
  options: { basis: IndicatorBasis; variables: CriticalVariable[] },
): CalculationResult<CriticalValue[]> {
  const target = { indicator: 'NPV', basis: options.basis } as const;
  checkGoal(target, 'options');
  checkVariables(input, options.variables);
  const ranges = options.variables.map((v, i) => {
    factorOf(v.minChange, `variables[${i}].minChange`);
    const min = toDecimal(v.minChange);
    const max = toDecimal(v.maxChange);
    if (min.gt(0)) throw new EngineInputError('sensitivity.range', `variables[${i}].minChange`);
    if (max.lt(0)) throw new EngineInputError('sensitivity.range', `variables[${i}].maxChange`);
    return { min, max };
  });
  const base = run(input, []);
  const warnings: CalculationWarning[] = [...base.model.warnings];
  const atBase = toDecimal(base.indicators[options.basis].npv);
  const value = options.variables.map((variable, i): CriticalValue => {
    const npv = (change: Decimal) =>
      indicatorOf(
        run(input, [variableChange(variable, toDecimalString(change))], 'NPV').indicators,
        target,
      );
    const changes: DecimalString[] = [];
    if (atBase.isZero()) changes.push('0');
    else {
      for (const end of [ranges[i]?.min ?? ZERO, ranges[i]?.max ?? ZERO]) {
        if (end.isZero()) continue;
        const atEnd = npv(end);
        if (atEnd === undefined) continue;
        if (atEnd.isZero()) changes.push(toDecimalString(end));
        else if (atEnd.isNegative() !== atBase.isNegative()) {
          const root = bisect(npv, ZERO, atBase, end);
          if (root !== undefined) changes.push(toDecimalString(root));
        }
      }
    }
    if (changes.length === 0) {
      warnings.push({ code: 'sensitivity.noCriticalValue', params: { variable: variable.key } });
    }
    return { key: variable.key, changes };
  });
  return result(value, warnings, base.model.defaultsUsed);
}
