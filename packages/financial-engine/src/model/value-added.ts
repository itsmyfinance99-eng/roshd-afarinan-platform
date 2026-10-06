import {
  ONE,
  ZERO,
  toDecimal,
  toDecimalString,
  type Decimal,
  type DecimalString,
} from '../decimal';
import type { CalculationResult, CalculationWarning } from '../types';
import { MODEL_VERSION } from '../version';
import {
  at,
  economicBase,
  netOfTax,
  type EconomicLine,
  type EconomicScheduleInput,
  type EconomicShareLine,
  type Row,
} from './economic';
import type { Origin } from './investment';

/**
 * Value added of the project (manual VIII.F–I, X.D.1, XII.A; comfar-model-spec §6.1): the gross
 * and net domestic value added, the net national value added and its distribution to domestic
 * wages, dividends and interest, the government and others, per project period, in total and at
 * present value at the economic rate of discount. Everything is in local currency: foreign items
 * are converted at the official exchange rate of their period, as in the financial schedules.
 */

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

/** The value-added schedule of a calculated project. */
export function valueAdded(input: EconomicScheduleInput): CalculationResult<ValueAddedSchedule> {
  const { financing, operations, statements } = input;
  const {
    zero,
    row,
    add,
    minus,
    addTo,
    present,
    line,
    shareLine,
    dividendTax,
    costs,
    investments,
  } = economicBase(input);
  const warnings: CalculationWarning[] = [];

  // Cost items: materials and services, wages (domestic or repatriated) and other costs.
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
  for (const cost of costs) {
    if (cost.nature === 'OTHER') {
      if (cost.origin === 'FOREIGN') addTo(otherForeign, cost.sold, ONE);
      continue;
    }
    taxOrSubsidy(cost.sold, cost.tax);
    if (cost.nature === 'MATERIALS') {
      addTo(materials, cost.sold, netOfTax(cost.tax).times(cost.rest));
      continue;
    }
    addTo(wages[cost.origin], cost.sold, netOfTax(cost.tax));
    if (cost.origin === 'LOCAL' && cost.skill === 'UNSKILLED') {
      addTo(unskilled, cost.sold, netOfTax(cost.tax));
    }
  }

  // Investment: fixed assets and pre-production expenditures net of interest, plus inventory.
  const fixedAndPreProduction = zero();
  for (const item of investments) {
    taxOrSubsidy(item.amounts, item.tax);
    addTo(fixedAndPreProduction, item.amounts, netOfTax(item.tax).times(item.rest));
  }
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
  addTo(indirectTaxes, repatriatedGross, dividendTax.foreign);
  addTo(indirectTaxes, localGross, dividendTax.local);
  const repatriatedDividends = repatriatedGross.map((v) => v.times(ONE.minus(dividendTax.foreign)));
  const localDividends = localGross.map((v) => v.times(ONE.minus(dividendTax.local)));
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
