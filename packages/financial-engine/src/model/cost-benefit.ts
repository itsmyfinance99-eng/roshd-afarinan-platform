import {
  ONE,
  ZERO,
  toDecimal,
  toDecimalString,
  type Decimal,
  type DecimalString,
} from '../decimal';
import { EngineInputError } from '../errors';
import { periodDiscountFactors } from '../time-value';
import type { CalculationResult, CalculationWarning, CurrencyCode } from '../types';
import { MODEL_VERSION } from '../version';
import { periodAmounts } from './asset-depreciation';
import { discountedFlow } from './discounted-flow';
import {
  NUMERAIRES,
  TRADE_CLASSES,
  at,
  economicBase,
  entriesByItem,
  type CostBenefitInput,
  type EconomicScheduleInput,
  type EconomicValuation,
  type IndirectForeignExchangeItem,
  type Numeraire,
  type Row,
} from './economic';
import { ratesFor, uniqueKeys } from './investment';
import { discountRates } from './statements';

/**
 * Economic cost-benefit analysis (manual VIII.B–K, X.D.4, XII.D; comfar-model-spec §6.4): the
 * discounted cash flow of the total capital at economic prices. Every line has a financial value
 * (FV); an adjusted market value `AMV = FV × AF` with the adjustment factor the user gives an
 * item; a foreign-exchange adjustment (FEA) from the item's foreign-currency exposure and the
 * shadow exchange rate; and so the economic value `EV1 = AMV + FEA`. Indirect effects are added at
 * the last level, `EV2`. Values are present values at the economic rate of discount, in the
 * numeraire.
 */

/** A line of the schedule, at present value in the numeraire. */
export interface CostBenefitLine {
  financialValue: DecimalString;
  /** `AMV / FV`; null without a financial value, and for the net flow. */
  adjustmentFactor: DecimalString | null;
  adjustedMarketValue: DecimalString;
  /** Exposure of the line, weighted by the adjusted market values; null without a value. */
  foreignCurrencyExposure: DecimalString | null;
  foreignExchangeAdjustment: DecimalString;
  /** `EV1 = AMV + FEA`. */
  economicValue: DecimalString;
}

/** The net flow at one level of valuation and its indicators. */
export interface CostBenefitLevel {
  /** One column per project period, plus the year after production when residual values return there. */
  net: DecimalString[];
  npv: DecimalString;
  /**
   * What an existing enterprise brings in, charged on the day before the first period at this
   * level's value (expansion projects only): it is in the NPV and the IRR but in no column.
   */
  startingBalance?: DecimalString;
  /** Absent, with a warning of the level, when no single rate of return exists. */
  irr?: DecimalString;
  warnings: CalculationWarning[];
}

export interface CostBenefitSchedule {
  numeraire: Numeraire;
  /** Currency the values are in. */
  currency: CurrencyCode;
  salvageColumn: boolean;
  inflows: {
    salesRevenue: CostBenefitLine;
    depositInterest: CostBenefitLine;
    otherIncome: CostBenefitLine;
    /** Disbursements of the foreign loans taken into the analysis. */
    foreignLoans: CostBenefitLine;
    residualValue: CostBenefitLine;
    total: CostBenefitLine;
  };
  outflows: {
    fixedInvestment: CostBenefitLine;
    preProduction: CostBenefitLine;
    workingCapitalIncrease: CostBenefitLine;
    /** What an existing enterprise brings in on the day before the project (expansion projects). */
    startingBalance: CostBenefitLine;
    operatingCosts: CostBenefitLine;
    leasingCosts: CostBenefitLine;
    marketingCosts: CostBenefitLine;
    foreignDebtService: CostBenefitLine;
    incomeTax: CostBenefitLine;
    total: CostBenefitLine;
  };
  netFlow: CostBenefitLine;
  /** Indirect effects at their economic value: benefits and merits, costs and demerits. */
  indirect: { benefits: DecimalString; costs: DecimalString; net: DecimalString };
  levels: {
    financial: CostBenefitLevel;
    adjusted: CostBenefitLevel;
    /** `EV1`: with the foreign-exchange adjustment. */
    economic: CostBenefitLevel;
    /** `EV2`: with the indirect effects — the economic NPV and IRR of the project. */
    withIndirect: CostBenefitLevel;
  };
}

export interface CostBenefitScheduleInput extends EconomicScheduleInput {
  costBenefit: CostBenefitInput;
  localCurrency: CurrencyCode;
  /** Local units per unit of each foreign currency, one rate per project period. */
  exchangeRates: Record<CurrencyCode, DecimalString[]>;
  /** The currency every item is entered in: a foreign one is valued at the shadow rate. */
  currencies: {
    /** By product key and sales-line key. */
    sales: Record<string, Record<string, CurrencyCode>>;
    costs: Record<string, CurrencyCode>;
    investment: Record<string, CurrencyCode>;
  };
}

/** The three valuations of a line, per column, with the exposed part of its adjusted value. */
interface Amounts {
  financial: Row;
  adjusted: Row;
  exposed: Row;
  adjustment: Row;
}

const MARKETING: ReadonlySet<string> = new Set(['DIRECT_MARKETING', 'MARKETING_OVERHEADS']);

/** The economic cost-benefit schedule of a calculated project. */
export function costBenefit(
  input: CostBenefitScheduleInput,
): CalculationResult<CostBenefitSchedule> {
  const {
    horizon,
    investment,
    financing,
    operations,
    statements,
    economic,
    costBenefit: entered,
  } = input;
  const { length, row, costs } = economicBase(input);
  const field = 'costBenefit';
  const { salvageColumn } = statements.totalCapital;
  const columns = salvageColumn ? length + 1 : length;
  const zero = (): Row => Array.from({ length: columns }, () => ZERO);

  if (!(NUMERAIRES as readonly string[]).includes(entered.numeraire)) {
    throw new EngineInputError('costBenefit.numeraire', `${field}.numeraire`);
  }
  const domestic = entered.numeraire === 'LOCAL_DOMESTIC_PRICES';
  const conversion = toDecimal(entered.standardConversionFactor);
  if (!conversion.gt(0)) {
    throw new EngineInputError('costBenefit.conversionFactor', `${field}.standardConversionFactor`);
  }
  // The numeraire: local currency, or a foreign currency at the official rate of each period.
  let currency = input.localCurrency;
  let toNumeraire: Row | undefined;
  if (entered.numeraire === 'FOREIGN_BORDER_PRICES') {
    if (entered.currency === undefined || entered.currency === input.localCurrency) {
      throw new EngineInputError('costBenefit.numeraireCurrency', `${field}.currency`);
    }
    currency = entered.currency;
    const rates = ratesFor(currency, input, length, `${field}.currency`) ?? [];
    // The year after production is valued at the rate of the last period.
    toNumeraire = Array.from({ length: columns }, (_, j) => at(rates, j < length ? j : length - 1));
  } else if (entered.currency !== undefined) {
    throw new EngineInputError('costBenefit.numeraireCurrency', `${field}.currency`);
  }

  const valuation = (entry: EconomicValuation, at_: string) => {
    const factor = toDecimal(entry.adjustmentFactor);
    if (factor.isNegative() && !factor.isZero()) {
      throw new EngineInputError('amount.negative', `${at_}.adjustmentFactor`);
    }
    const exposure = toDecimal(entry.foreignCurrencyExposure);
    if (exposure.isNegative() || exposure.gt(1)) {
      throw new EngineInputError('share.outOfRange', `${at_}.foreignCurrencyExposure`);
    }
    if (!(TRADE_CLASSES as readonly string[]).includes(entry.category)) {
      throw new EngineInputError('costBenefit.category', `${at_}.category`);
    }
    // A non-traded item is priced at home: no part of it is a transaction in foreign currency.
    if (entry.category === 'NON_TRADED' && !exposure.isZero()) {
      throw new EngineInputError('costBenefit.nonTradedExposure', `${at_}.foreignCurrencyExposure`);
    }
    return { factor, exposure };
  };
  const FINANCIAL = { factor: ONE, exposure: ZERO };
  const FOREIGN = { factor: ONE, exposure: ONE };
  /**
   * An item that is not taken into the analysis keeps its financial value; one entered in a
   * foreign currency is foreign exchange in full and so valued at the shadow rate (X.D.4, XII.D).
   */
  const unlisted = (itemCurrency: CurrencyCode | undefined) =>
    itemCurrency !== undefined && itemCurrency !== input.localCurrency ? FOREIGN : FINANCIAL;
  const { currencies } = input;
  const currencyOf = (map: Record<string, CurrencyCode>, key: string) =>
    Object.hasOwn(map, key) ? map[key] : undefined;
  /** XII.D.3: border prices are raised to domestic prices, or domestic prices lowered to them. */
  const adjustmentOf = (adjusted: Decimal, exposure: Decimal) =>
    domestic
      ? adjusted.times(exposure).times(ONE.div(conversion).minus(ONE))
      : adjusted.times(ONE.minus(exposure)).times(conversion.minus(ONE));
  const empty = (): Amounts => ({
    financial: zero(),
    adjusted: zero(),
    exposed: zero(),
    adjustment: zero(),
  });
  const put = (target: Amounts, values: Row, { factor, exposure }: typeof FINANCIAL, column = 0) =>
    values.forEach((value, j) => {
      const k = j + column;
      const adjusted = value.times(factor);
      target.financial[k] = at(target.financial, k).plus(value);
      target.adjusted[k] = at(target.adjusted, k).plus(adjusted);
      target.exposed[k] = at(target.exposed, k).plus(adjusted.times(exposure));
      target.adjustment[k] = at(target.adjustment, k).plus(adjustmentOf(adjusted, exposure));
    });
  const sum = (...parts: Amounts[]): Amounts => {
    const total = empty();
    for (const name of ['financial', 'adjusted', 'exposed', 'adjustment'] as const) {
      parts.forEach((part) =>
        part[name].forEach((v, j) => (total[name][j] = at(total[name], j).plus(v))),
      );
    }
    return total;
  };

  // Sales: a line taken into the analysis is valued from its net revenue, the others at the gross
  // revenue (with sales tax, without subsidies).
  const salesRevenue = empty();
  const outputEntries = entered.outputs;
  uniqueKeys(
    outputEntries.map((o) => JSON.stringify([o.product, o.line])),
    `${field}.outputs`,
    'line',
  );
  const outputs = new Map<string, typeof FINANCIAL>();
  outputEntries.forEach((entry, i) => {
    const at_ = `${field}.outputs[${i}]`;
    const product = operations.products.find((p) => p.key === entry.product);
    if (product === undefined) throw new EngineInputError('economic.unknownItem', `${at_}.product`);
    if (!product.lines.some((l) => l.key === entry.line)) {
      throw new EngineInputError('economic.unknownItem', `${at_}.line`);
    }
    outputs.set(JSON.stringify([entry.product, entry.line]), valuation(entry, at_));
  });
  for (const product of operations.products) {
    for (const line of product.lines) {
      const found = outputs.get(JSON.stringify([product.key, line.key]));
      if (found === undefined) {
        const lines = Object.hasOwn(currencies.sales, product.key)
          ? (currencies.sales[product.key] ?? {})
          : {};
        put(salesRevenue, row(line.grossRevenue), unlisted(currencyOf(lines, line.key)));
      } else put(salesRevenue, row(line.netRevenue), found);
    }
  }
  const depositInterest = empty();
  put(depositInterest, row(statements.cashFlow.inflows.depositInterest), FINANCIAL);
  const otherIncome = empty();
  put(otherIncome, row(statements.cashFlow.inflows.otherIncome), FINANCIAL);
  const residualValue = empty();
  put(residualValue, [toDecimal(statements.totalCapital.residualValue)], FINANCIAL, columns - 1);

  // Investment and costs, item by item.
  const investmentEntries = entriesByItem(
    entered.investment,
    `${field}.investment`,
    new Set(investment.items.map((i) => i.key)),
  );
  const fixedInvestment = empty();
  const preProduction = empty();
  for (const item of investment.items) {
    const found = investmentEntries.get(item.key);
    put(
      item.group === 'PRE_PRODUCTION' ? preProduction : fixedInvestment,
      row(item.amounts),
      found === undefined
        ? unlisted(currencyOf(currencies.investment, item.key))
        : valuation(found.entry, found.field),
    );
  }
  const costEntries = entriesByItem(
    entered.costs,
    `${field}.costs`,
    new Set(costs.map((c) => c.key)),
  );
  const categories = new Map(operations.costs.items.map((c) => [c.key, c.category]));
  const operatingCosts = empty();
  const leasingCosts = empty();
  const marketingCosts = empty();
  for (const cost of costs) {
    const category = categories.get(cost.key) ?? '';
    const found = costEntries.get(cost.key);
    put(
      category === 'LEASING'
        ? leasingCosts
        : MARKETING.has(category)
          ? marketingCosts
          : operatingCosts,
      cost.sold,
      found === undefined
        ? unlisted(currencyOf(currencies.costs, cost.key))
        : valuation(found.entry, found.field),
    );
  }
  // The increase of the net working capital, as the cash flow of the total capital has it.
  const fixedFinancial = row(investment.fixedInvestment);
  const preProductionFinancial = row(investment.preProduction);
  const workingCapitalIncrease = empty();
  put(
    workingCapitalIncrease,
    row(statements.totalCapital.investment).map((v, j) =>
      v.minus(at(fixedFinancial, j)).minus(at(preProductionFinancial, j)),
    ),
    FINANCIAL,
  );
  const incomeTax = empty();
  put(incomeTax, row(statements.cashFlow.outflows.incomeTax), FINANCIAL);

  // Foreign loans that are tied to the project: their flows are foreign exchange.
  const foreignLoans = empty();
  const foreignDebtService = empty();
  entered.foreignLoans.forEach((key, i) => {
    if (entered.foreignLoans.indexOf(key) !== i) {
      throw new EngineInputError('model.duplicateKey', `${field}.foreignLoans[${i}]`);
    }
    const loan = financing.loans.find((l) => l.key === key);
    if (loan === undefined) {
      throw new EngineInputError('economic.unknownItem', `${field}.foreignLoans[${i}]`);
    }
    if (loan.origin !== 'FOREIGN') {
      throw new EngineInputError('costBenefit.loanNotForeign', `${field}.foreignLoans[${i}]`);
    }
    put(
      foreignLoans,
      loan.periods.map((p) => toDecimal(p.disbursement).plus(toDecimal(p.capitalisedInterest))),
      FOREIGN,
    );
    put(
      foreignDebtService,
      loan.periods.map((p) =>
        toDecimal(p.repayment)
          .plus(toDecimal(p.interest))
          .plus(toDecimal(p.capitalisedInterest))
          .plus(toDecimal(p.fees)),
      ),
      FOREIGN,
    );
  });

  // Indirect effects: entered in a currency, local ones without and foreign ones with exposure.
  const indirect = (items: IndirectForeignExchangeItem[], at_: string): Row => {
    uniqueKeys(
      items.map((item) => item.key),
      at_,
    );
    const total = empty();
    items.forEach((item, i) => {
      const own = periodAmounts(item.amounts, length, `${at_}[${i}].amounts`);
      const rates = ratesFor(item.currency, input, length, `${at_}[${i}].currency`);
      put(
        total,
        rates === undefined ? own : own.map((v, j) => v.times(at(rates, j))),
        rates === undefined ? FINANCIAL : FOREIGN,
      );
    });
    return total.adjusted.map((v, j) => v.plus(at(total.adjustment, j)));
  };
  const indirectBenefits = indirect(entered.indirectBenefits, `${field}.indirectBenefits`);
  const indirectCosts = indirect(entered.indirectCosts, `${field}.indirectCosts`);

  const inflow = sum(salesRevenue, depositInterest, otherIncome, foreignLoans, residualValue);
  const outflowOfPeriods = sum(
    fixedInvestment,
    preProduction,
    workingCapitalIncrease,
    operatingCosts,
    leasingCosts,
    marketingCosts,
    foreignDebtService,
    incomeTax,
  );

  // Discounting: the columns of the schedule, and the starting balance on the day before them.
  const months = horizon.periods.map((p) => p.months);
  const rates = discountRates(economic.discountRate, length, 'discountRate');
  const reference = input.reference === undefined ? {} : { reference: input.reference };
  const factors = periodDiscountFactors(salvageColumn ? [...months, 12] : months, {
    annualRate: salvageColumn ? [...rates, rates[length - 1] ?? '0'] : rates,
    ...reference,
  });
  const numeraire = (values: Row) =>
    toNumeraire === undefined ? values : values.map((v, j) => v.div(at(toNumeraire, j)));
  const present = (values: Row) =>
    numeraire(values).reduce((s, v, j) => s.plus(v.div(factors[j] ?? ONE)), ZERO);

  // The starting balance of an existing enterprise is charged at its financial value; it has no
  // column of its own, so it is valued at the rate of the first period.
  const opening = toDecimal(statements.totalCapital.startingBalance ?? '0');
  const openingFirst = toNumeraire === undefined ? ONE : at(toNumeraire, 0);
  const openingAdjustment = adjustmentOf(opening, ZERO);
  const level = (net: Row, charge: Decimal): CostBenefitLevel => {
    const flow = discountedFlow({
      basis: 'totalCapital',
      net: numeraire(net).slice(0, length),
      residual: salvageColumn ? at(numeraire(net), length) : ZERO,
      ...(charge.isZero() ? {} : { startingBalance: charge.div(openingFirst) }),
      months,
      rates,
      salvageColumn,
      ...reference,
      scope: 'NPV_AND_IRR',
    });
    return {
      net: flow.result.net,
      npv: flow.result.npv,
      ...(flow.result.startingBalance === undefined
        ? {}
        : { startingBalance: flow.result.startingBalance }),
      ...(flow.result.irr === undefined ? {} : { irr: flow.result.irr }),
      warnings: flow.warnings,
    };
  };
  const minus = (a: Row, b: Row) => a.map((v, j) => v.minus(at(b, j)));
  const plus = (a: Row, b: Row) => a.map((v, j) => v.plus(at(b, j)));
  const netFinancial = minus(inflow.financial, outflowOfPeriods.financial);
  const netAdjusted = minus(inflow.adjusted, outflowOfPeriods.adjusted);
  const netEconomic = plus(netAdjusted, minus(inflow.adjustment, outflowOfPeriods.adjustment));
  const netWithIndirect = plus(netEconomic, minus(indirectBenefits, indirectCosts));
  const openingEconomic = opening.plus(openingAdjustment);
  const levels = {
    financial: level(netFinancial, opening),
    adjusted: level(netAdjusted, opening),
    economic: level(netEconomic, openingEconomic),
    withIndirect: level(netWithIndirect, openingEconomic),
  };

  const text = (value: Decimal) => toDecimalString(value);
  const ratio = (a: Decimal, b: Decimal) => (b.isZero() ? null : text(a.div(b)));
  interface Present {
    financial: Decimal;
    adjusted: Decimal;
    exposed: Decimal;
    adjustment: Decimal;
  }
  const presentOf = (amounts: Amounts): Present => ({
    financial: present(amounts.financial),
    adjusted: present(amounts.adjusted),
    exposed: present(amounts.exposed),
    adjustment: present(amounts.adjustment),
  });
  const lineOf = ({ financial, adjusted, exposed, adjustment }: Present): CostBenefitLine => ({
    financialValue: text(financial),
    adjustmentFactor: ratio(adjusted, financial),
    adjustedMarketValue: text(adjusted),
    foreignCurrencyExposure: ratio(exposed, adjusted),
    foreignExchangeAdjustment: text(adjustment),
    economicValue: text(adjusted.plus(adjustment)),
  });
  const line = (amounts: Amounts): CostBenefitLine => lineOf(presentOf(amounts));
  const openingPresent = (value: Decimal) => {
    if (value.isZero()) return ZERO;
    // The day before the first period: one period's factor earlier than its end.
    const first = periodDiscountFactors([0, ...months], {
      annualRate: [rates[0] ?? '0', ...rates],
      ...reference,
    })[0];
    return value.div(openingFirst).div(first ?? ONE);
  };
  const startingBalance: Present = {
    financial: openingPresent(opening),
    adjusted: openingPresent(opening),
    exposed: ZERO,
    adjustment: openingPresent(openingAdjustment),
  };
  const inflowTotal = presentOf(inflow);
  const periodsOut = presentOf(outflowOfPeriods);
  const outflowTotal: Present = {
    financial: periodsOut.financial.plus(startingBalance.financial),
    adjusted: periodsOut.adjusted.plus(startingBalance.adjusted),
    exposed: periodsOut.exposed,
    adjustment: periodsOut.adjustment.plus(startingBalance.adjustment),
  };
  // The net of the two totals: a factor or an exposure of a difference would mean nothing.
  const netAdjustedValue = inflowTotal.adjusted.minus(outflowTotal.adjusted);
  const netAdjustment = inflowTotal.adjustment.minus(outflowTotal.adjustment);
  const netFlow: CostBenefitLine = {
    financialValue: text(inflowTotal.financial.minus(outflowTotal.financial)),
    adjustmentFactor: null,
    adjustedMarketValue: text(netAdjustedValue),
    foreignCurrencyExposure: null,
    foreignExchangeAdjustment: text(netAdjustment),
    economicValue: text(netAdjustedValue.plus(netAdjustment)),
  };
  const benefits = present(indirectBenefits);
  const indirectCost = present(indirectCosts);

  const value: CostBenefitSchedule = {
    numeraire: entered.numeraire,
    currency,
    salvageColumn,
    inflows: {
      salesRevenue: line(salesRevenue),
      depositInterest: line(depositInterest),
      otherIncome: line(otherIncome),
      foreignLoans: line(foreignLoans),
      residualValue: line(residualValue),
      total: lineOf(inflowTotal),
    },
    outflows: {
      fixedInvestment: line(fixedInvestment),
      preProduction: line(preProduction),
      workingCapitalIncrease: line(workingCapitalIncrease),
      startingBalance: lineOf(startingBalance),
      operatingCosts: line(operatingCosts),
      leasingCosts: line(leasingCosts),
      marketingCosts: line(marketingCosts),
      foreignDebtService: line(foreignDebtService),
      incomeTax: line(incomeTax),
      total: lineOf(outflowTotal),
    },
    netFlow,
    indirect: {
      benefits: text(benefits),
      costs: text(indirectCost),
      net: text(benefits.minus(indirectCost)),
    },
    levels,
  };
  return { value, modelVersion: MODEL_VERSION, warnings: [], defaultsUsed: [] };
}
