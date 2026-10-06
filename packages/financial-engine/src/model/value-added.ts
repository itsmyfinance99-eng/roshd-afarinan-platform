import {
  ONE,
  ZERO,
  toDecimal,
  toDecimalString,
  type Decimal,
  type DecimalString,
} from '../decimal';
import { EngineInputError } from '../errors';
import { periodDiscountFactors, type DiscountReference } from '../time-value';
import type { CalculationResult, CalculationWarning } from '../types';
import { MODEL_VERSION } from '../version';
import type { FinancingSchedule } from './financing';
import type { PlanningHorizon } from './horizon';
import { uniqueKeys, type InvestmentSchedule, type Origin } from './investment';
import { MATERIALS, type CostCategory, type OperationsSchedule } from './operations';
import { discountRates, type FinancialStatements } from './statements';

/**
 * Value added of the project (manual VIII.F–I, X.D.1, XII.A; comfar-model-spec §6.1): the gross
 * and net domestic value added, the net national value added and its distribution to domestic
 * wages, dividends and interest, the government and others, per project period, in total and at
 * present value at the economic rate of discount. Everything is in local currency: foreign items
 * are converted at the official exchange rate of their period, as in the financial schedules.
 */

/** What a cost item is in the value-added schedule: an intermediate input, wages, or neither. */
export const INPUT_NATURES = ['MATERIALS', 'WAGES', 'OTHER'] as const;
export type InputNature = (typeof INPUT_NATURES)[number];

export const LABOUR_SKILLS = ['SKILLED', 'UNSKILLED'] as const;
export type LabourSkill = (typeof LABOUR_SKILLS)[number];

/** Adjustment of a cost item of the financial input (COMFAR's ADJUSTMENT OF INPUTS window). */
export interface EconomicCostAdjustment {
  /** Key of the cost item. */
  item: string;
  /**
   * Required for factory and administrative overheads (materials and services, or wages) and for
   * marketing costs (wages, or other). The other categories have one nature and need none.
   */
  nature?: InputNature;
  /** Wages only; required for the labour category. Other wages count as skilled (X.D.1). */
  skill?: LabourSkill;
  /**
   * Indirect taxes and duties included in the financial value, as a fraction of it (at most 1); a
   * negative fraction is a subsidy on the input, of any size. Materials and wages only; none when
   * absent.
   */
  taxesIncluded?: DecimalString;
  /**
   * Value added included in the item, for up to three rounds of decomposition: each round is a
   * fraction of what the previous rounds left. Materials only; none when absent.
   */
  valueAddedIncluded?: DecimalString[];
}

/** Adjustment of a fixed-investment or pre-production item. */
export interface EconomicInvestmentAdjustment {
  /** Key of the investment item. */
  item: string;
  taxesIncluded?: DecimalString;
  valueAddedIncluded?: DecimalString[];
}

export interface EconomicInput {
  /** Economic rate of discount per year: one rate or one per project period. No default. */
  discountRate: DecimalString | DecimalString[];
  /** Cost items that are adjusted or need a nature; the others keep their financial value. */
  costs: EconomicCostAdjustment[];
  /** Investment items that are adjusted; the others keep their financial value. */
  investment: EconomicInvestmentAdjustment[];
  /** Additional tax on distributed dividends, as fractions ("0" is an explicit choice). */
  dividendTax: { local: DecimalString; foreign: DecimalString };
}

/** A line of an economic schedule: per project period, its sum and its present value. */
export interface EconomicLine {
  values: DecimalString[];
  total: DecimalString;
  presentValue: DecimalString;
}

/** A line of ratios; null where the denominator is zero. */
export interface EconomicShareLine {
  values: (DecimalString | null)[];
  total: DecimalString | null;
  presentValue: DecimalString | null;
}

export interface ValueAddedSchedule {
  /** `O + OI`: gross sales revenue (with sales tax, without subsidies) and other income. */
  valueOfOutput: {
    grossSalesRevenue: EconomicLine;
    otherIncome: EconomicLine;
    total: EconomicLine;
  };
  /** `M`: materials and services of the products sold, net of taxes and value added included. */
  materialInput: EconomicLine;
  grossDomesticValueAdded: EconomicLine;
  /** `I`: adjusted fixed investment and pre-production expenditures, plus the inventory increase. */
  investment: {
    fixedAndPreProduction: EconomicLine;
    inventoryIncrease: EconomicLine;
    total: EconomicLine;
  };
  netDomesticValueAdded: EconomicLine;
  /** `R`: payments that leave the country. */
  repatriated: {
    wages: EconomicLine;
    dividends: EconomicLine;
    interest: EconomicLine;
    others: EconomicLine;
    total: EconomicLine;
  };
  netNationalValueAdded: EconomicLine;
  distribution: {
    domesticWages: EconomicLine;
    skilledLabour: EconomicLine;
    unskilledLabour: EconomicLine;
    dividendsAndInterest: EconomicLine;
    government: EconomicLine;
    /** What the net national value added leaves after the three lines above. */
    others: EconomicLine;
    /** Each part over the net national value added. */
    shares: {
      domesticWages: EconomicShareLine;
      dividendsAndInterest: EconomicShareLine;
      government: EconomicShareLine;
      others: EconomicShareLine;
    };
  };
  /** The lines the government's part is made of (subsidies are deducted). */
  government: {
    incomeTax: EconomicLine;
    salesTax: EconomicLine;
    /** Taxes and duties included in inputs, investment and wages, and the tax on dividends. */
    indirectTaxes: EconomicLine;
    salesSubsidies: EconomicLine;
    /** Local subsidies and grants received as finance. */
    grants: EconomicLine;
    /** Subsidies on inputs (negative taxes included). */
    inputSubsidies: EconomicLine;
  };
  /**
   * Efficiency tests at present value; a test whose denominator is not positive is absent, with a
   * warning. Absolute: `PV(NNVA) / PV(domestic wages)`, passed at 1 or more.
   */
  efficiency: {
    absolute?: DecimalString;
    perInvestment?: DecimalString;
    perSkilledLabour?: DecimalString;
  };
}

type Row = Decimal[];
const at = (row: Row | undefined, j: number) => row?.[j] ?? ZERO;

/** The natures a category may have; a category with one nature needs no entry. */
function naturesOf(category: CostCategory): readonly InputNature[] {
  if (MATERIALS.has(category)) return ['MATERIALS'];
  if (category === 'LABOUR' || category === 'LABOUR_OVERHEADS') return ['WAGES'];
  if (category === 'LEASING') return ['OTHER'];
  if (category === 'DIRECT_MARKETING' || category === 'MARKETING_OVERHEADS') {
    return ['WAGES', 'OTHER'];
  }
  return ['MATERIALS', 'WAGES'];
}

interface Adjustment {
  /** Taxes and duties included (negative: a subsidy on the input). */
  tax: Decimal;
  /** Part of the value net of taxes that is deducted as an intermediate input. */
  rest: Decimal;
}

const NO_ADJUSTMENT: Adjustment = { tax: ZERO, rest: ONE };

function adjustment(
  entry: { taxesIncluded?: DecimalString; valueAddedIncluded?: DecimalString[] },
  field: string,
): Adjustment {
  let tax = ZERO;
  if (entry.taxesIncluded !== undefined) {
    tax = toDecimal(entry.taxesIncluded);
    if (tax.gt(1)) {
      throw new EngineInputError('economic.taxesIncluded', `${field}.taxesIncluded`);
    }
  }
  let rest = ONE;
  const rounds = entry.valueAddedIncluded ?? [];
  if (rounds.length > 3) {
    throw new EngineInputError('economic.rounds', `${field}.valueAddedIncluded`);
  }
  rounds.forEach((value, i) => {
    const share = toDecimal(value);
    if (share.isNegative() || share.gt(1)) {
      throw new EngineInputError('share.outOfRange', `${field}.valueAddedIncluded[${i}]`);
    }
    rest = rest.times(ONE.minus(share));
  });
  return { tax, rest };
}

function entriesByItem<T extends { item: string }>(
  entries: T[],
  field: string,
  known: ReadonlySet<string>,
): Map<string, { entry: T; field: string }> {
  uniqueKeys(
    entries.map((e) => e.item),
    field,
    'item',
  );
  return new Map(
    entries.map((entry, i) => {
      if (!known.has(entry.item)) {
        throw new EngineInputError('economic.unknownItem', `${field}[${i}].item`);
      }
      return [entry.item, { entry, field: `${field}[${i}]` }];
    }),
  );
}

export interface ValueAddedInput {
  horizon: PlanningHorizon;
  investment: InvestmentSchedule;
  financing: FinancingSchedule;
  operations: OperationsSchedule;
  statements: FinancialStatements;
  economic: EconomicInput;
  /** Reference date of the present values: the one of the financial statements. */
  reference?: DiscountReference;
}

/** The value-added schedule of a calculated project. */
export function valueAdded(input: ValueAddedInput): CalculationResult<ValueAddedSchedule> {
  const { horizon, investment, financing, operations, statements, economic } = input;
  const length = horizon.periods.length;
  const warnings: CalculationWarning[] = [];
  const zero = (): Row => Array.from({ length }, () => ZERO);
  const row = (values: DecimalString[]): Row =>
    Array.from({ length }, (_, j) => toDecimal(values[j] ?? '0'));
  const add = (...rows: Row[]): Row =>
    Array.from({ length }, (_, j) => rows.reduce((s, r) => s.plus(at(r, j)), ZERO));
  const minus = (a: Row, ...rows: Row[]): Row =>
    Array.from({ length }, (_, j) => rows.reduce((s, r) => s.minus(at(r, j)), at(a, j)));
  const addTo = (target: Row, values: Row, factor: Decimal) =>
    values.forEach((v, j) => (target[j] = at(target, j).plus(v.times(factor))));

  const rates = discountRates(economic.discountRate, length, 'discountRate');
  const factors = periodDiscountFactors(
    horizon.periods.map((p) => p.months),
    { annualRate: rates, ...(input.reference === undefined ? {} : { reference: input.reference }) },
  );
  const sum = (values: Row) => values.reduce((s, v) => s.plus(v), ZERO);
  const present = (values: Row) =>
    values.reduce((s, v, j) => s.plus(v.div(factors[j] ?? ONE)), ZERO);
  const line = (values: Row): EconomicLine => ({
    values: values.map((v) => toDecimalString(v)),
    total: toDecimalString(sum(values)),
    presentValue: toDecimalString(present(values)),
  });
  const ratio = (numerator: Decimal, denominator: Decimal) =>
    denominator.isZero() ? null : toDecimalString(numerator.div(denominator));
  const shareLine = (part: Row, whole: Row): EconomicShareLine => ({
    values: part.map((v, j) => ratio(v, at(whole, j))),
    total: ratio(sum(part), sum(whole)),
    presentValue: ratio(present(part), present(whole)),
  });

  const dividendTax = (['local', 'foreign'] as const).map((side) => {
    const value = toDecimal(economic.dividendTax[side]);
    if (value.isNegative() || value.gt(1)) {
      throw new EngineInputError('share.outOfRange', `dividendTax.${side}`);
    }
    return value;
  });
  const localDividendTax = dividendTax[0] ?? ZERO;
  const foreignDividendTax = dividendTax[1] ?? ZERO;

  // Cost items: materials and services, wages (domestic or repatriated) and other costs.
  const costEntries = entriesByItem(
    economic.costs,
    'costs',
    new Set(operations.costs.items.map((c) => c.key)),
  );
  const materials = zero();
  const wages: Record<Origin, Row> = { LOCAL: zero(), FOREIGN: zero() };
  const unskilled = zero();
  const otherForeign = zero();
  // Taxes and duties included in the items (to the government) and subsidies on inputs.
  const indirectTaxes = zero();
  const inputSubsidies = zero();
  const taxOrSubsidy = (values: Row, tax: Decimal) => {
    if (tax.isNegative()) addTo(inputSubsidies, values, tax.neg());
    else addTo(indirectTaxes, values, tax);
  };
  // A subsidy on an input leaves its value as it is; it only moves value added to the others.
  const netOfTax = (tax: Decimal) => (tax.isNegative() ? ONE : ONE.minus(tax));

  operations.costs.items.forEach((cost) => {
    const found = costEntries.get(cost.key);
    const entry = found?.entry;
    const field = found?.field ?? 'costs';
    const allowed = naturesOf(cost.category);
    let nature = allowed.length === 1 ? allowed[0] : undefined;
    if (entry?.nature !== undefined) {
      if (!allowed.includes(entry.nature)) {
        throw new EngineInputError('economic.nature', `${field}.nature`);
      }
      nature = entry.nature;
    }
    if (nature === undefined) {
      throw new EngineInputError(
        'economic.natureRequired',
        found === undefined ? field : `${field}.nature`,
        { item: cost.key },
      );
    }
    if (entry?.skill !== undefined) {
      if (nature !== 'WAGES') {
        throw new EngineInputError('economic.notApplicable', `${field}.skill`);
      }
      if (!(LABOUR_SKILLS as readonly string[]).includes(entry.skill)) {
        throw new EngineInputError('economic.skillRequired', `${field}.skill`, { item: cost.key });
      }
    } else if (cost.category === 'LABOUR') {
      throw new EngineInputError(
        'economic.skillRequired',
        found === undefined ? field : `${field}.skill`,
        { item: cost.key },
      );
    }
    if (nature !== 'MATERIALS' && entry?.valueAddedIncluded !== undefined) {
      throw new EngineInputError('economic.notApplicable', `${field}.valueAddedIncluded`);
    }
    if (nature === 'OTHER' && entry?.taxesIncluded !== undefined) {
      throw new EngineInputError('economic.notApplicable', `${field}.taxesIncluded`);
    }
    const { tax, rest } = entry === undefined ? NO_ADJUSTMENT : adjustment(entry, field);
    const sold = row(cost.sold);
    if (nature === 'OTHER') {
      if (cost.origin === 'FOREIGN') addTo(otherForeign, sold, ONE);
      return;
    }
    taxOrSubsidy(sold, tax);
    if (nature === 'MATERIALS') {
      addTo(materials, sold, netOfTax(tax).times(rest));
      return;
    }
    addTo(wages[cost.origin], sold, netOfTax(tax));
    if (cost.origin === 'LOCAL' && entry?.skill === 'UNSKILLED') {
      addTo(unskilled, sold, netOfTax(tax));
    }
  });

  // Investment: fixed assets and pre-production expenditures net of interest, plus inventory.
  const investmentEntries = entriesByItem(
    economic.investment,
    'investment',
    new Set(investment.items.map((i) => i.key)),
  );
  const fixedAndPreProduction = zero();
  investment.items.forEach((item) => {
    const found = investmentEntries.get(item.key);
    const { tax, rest } =
      found === undefined ? NO_ADJUSTMENT : adjustment(found.entry, found.field);
    const amounts = row(item.amounts);
    taxOrSubsidy(amounts, tax);
    addTo(fixedAndPreProduction, amounts, netOfTax(tax).times(rest));
  });
  const working = operations.workingCapital;
  const opening = working.starting?.opening;
  const openingInventory =
    opening === undefined
      ? ZERO
      : toDecimal(opening.materials)
          .plus(toDecimal(opening.workInProgress))
          .plus(toDecimal(opening.finishedProducts));
  const inventory = row(working.totals.inventory);
  const inventoryIncrease = inventory.map((v, j) =>
    v.minus(j === 0 ? openingInventory : at(inventory, j - 1)),
  );
  const totalInvestment = add(fixedAndPreProduction, inventoryIncrease);

  // Value of output: gross sales revenue (with sales tax, without subsidies) and other income.
  const grossRevenue = row(operations.sales.grossRevenue);
  const otherIncome = row(statements.cashFlow.inflows.otherIncome);
  const output = add(grossRevenue, otherIncome);
  const gross = minus(output, materials);
  const netDomestic = minus(gross, totalInvestment);

  // Dividends and the costs of finance, by where they are paid.
  const dividends = row(statements.dividends.total);
  const repatriatedGross = add(...statements.dividends.shareholders.map((s) => row(s.repatriated)));
  const localGross = minus(dividends, repatriatedGross);
  addTo(indirectTaxes, repatriatedGross, foreignDividendTax);
  addTo(indirectTaxes, localGross, localDividendTax);
  const repatriatedDividends = repatriatedGross.map((v) => v.times(ONE.minus(foreignDividendTax)));
  const localDividends = localGross.map((v) => v.times(ONE.minus(localDividendTax)));
  const interest: Record<Origin, Row> = { LOCAL: zero(), FOREIGN: zero() };
  financing.loans.forEach((loan) => {
    loan.periods.forEach((p, j) => {
      const target = interest[loan.origin];
      target[j] = at(target, j)
        .plus(toDecimal(p.interest))
        .plus(toDecimal(p.capitalisedInterest))
        .plus(toDecimal(p.fees));
    });
  });

  const repatriated = add(wages.FOREIGN, repatriatedDividends, interest.FOREIGN, otherForeign);
  const netNational = minus(netDomestic, repatriated);

  // Distribution of the net national value added.
  const domesticWages = wages.LOCAL;
  const skilled = minus(domesticWages, unskilled);
  const dividendsAndInterest = add(localDividends, interest.LOCAL);
  const incomeTax = row(statements.cashFlow.outflows.incomeTax);
  const salesTax = row(operations.sales.salesTax);
  const salesSubsidies = row(operations.sales.subsidy);
  const grants = add(
    ...financing.equity.items
      .filter((e) => e.class === 'SUBSIDY' && e.origin === 'LOCAL')
      .map((e) => row(e.amounts)),
  );
  const government = minus(
    add(incomeTax, salesTax, indirectTaxes),
    salesSubsidies,
    grants,
    inputSubsidies,
  );
  const others = minus(netNational, domesticWages, dividendsAndInterest, government);

  const efficiency: ValueAddedSchedule['efficiency'] = {};
  const nnva = present(netNational);
  const test = (
    name: keyof ValueAddedSchedule['efficiency'],
    denominator: Row,
    code: CalculationWarning['code'],
  ) => {
    const value = present(denominator);
    if (value.gt(0)) efficiency[name] = toDecimalString(nnva.div(value));
    else warnings.push({ code });
  };
  test('absolute', domesticWages, 'valueAdded.noDomesticWages');
  test('perInvestment', totalInvestment, 'valueAdded.noInvestment');
  test('perSkilledLabour', skilled, 'valueAdded.noSkilledLabour');

  const value: ValueAddedSchedule = {
    valueOfOutput: {
      grossSalesRevenue: line(grossRevenue),
      otherIncome: line(otherIncome),
      total: line(output),
    },
    materialInput: line(materials),
    grossDomesticValueAdded: line(gross),
    investment: {
      fixedAndPreProduction: line(fixedAndPreProduction),
      inventoryIncrease: line(inventoryIncrease),
      total: line(totalInvestment),
    },
    netDomesticValueAdded: line(netDomestic),
    repatriated: {
      wages: line(wages.FOREIGN),
      dividends: line(repatriatedDividends),
      interest: line(interest.FOREIGN),
      others: line(otherForeign),
      total: line(repatriated),
    },
    netNationalValueAdded: line(netNational),
    distribution: {
      domesticWages: line(domesticWages),
      skilledLabour: line(skilled),
      unskilledLabour: line(unskilled),
      dividendsAndInterest: line(dividendsAndInterest),
      government: line(government),
      others: line(others),
      shares: {
        domesticWages: shareLine(domesticWages, netNational),
        dividendsAndInterest: shareLine(dividendsAndInterest, netNational),
        government: shareLine(government, netNational),
        others: shareLine(others, netNational),
      },
    },
    government: {
      incomeTax: line(incomeTax),
      salesTax: line(salesTax),
      indirectTaxes: line(indirectTaxes),
      salesSubsidies: line(salesSubsidies),
      grants: line(grants),
      inputSubsidies: line(inputSubsidies),
    },
    efficiency,
  };
  return { value, modelVersion: MODEL_VERSION, warnings, defaultsUsed: [] };
}
