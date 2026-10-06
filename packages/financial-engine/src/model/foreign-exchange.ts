import { toDecimal, toDecimalString, type Decimal, type DecimalString } from '../decimal';
import { EngineInputError } from '../errors';
import type { CalculationResult, CalculationWarning, CurrencyCode } from '../types';
import { MODEL_VERSION } from '../version';
import { periodAmounts } from './asset-depreciation';
import {
  TRADE_CATEGORIES,
  at,
  economicBase,
  entriesByItem,
  netOfTax,
  type EconomicLine,
  type EconomicScheduleInput,
  type IndirectForeignExchangeItem,
  type Row,
  type TradeCategory,
} from './economic';
import { ratesFor, uniqueKeys } from './investment';

/**
 * Net foreign-exchange effect of the project (manual VIII.G–H, VIII.K, X.D.2, XII.B;
 * comfar-model-spec §6.2): what the project brings into the country and takes out of it in
 * foreign exchange, per project period, in total and at present value at the economic rate of
 * discount, and the indirect effects of tradable outputs and inputs. Amounts are in local currency
 * at the official exchange rate of their period, as in the financial schedules. Taxes and duties
 * included in a foreign item are paid at home and are left out of the flows.
 */

export interface ForeignExchangeSchedule {
  inflows: {
    /** Equity paid in from abroad (without grants). */
    equity: EconomicLine;
    /** Disbursements and capitalised interest of loans of foreign origin. */
    loans: EconomicLine;
    /** Subsidies and grants from abroad. */
    grants: EconomicLine;
    /** Gross revenue of export sales. */
    exports: EconomicLine;
    total: EconomicLine;
  };
  outflows: {
    /** Fixed investment and pre-production expenditures of foreign origin. */
    investment: EconomicLine;
    /** Materials and services of foreign origin in the products sold. */
    materials: EconomicLine;
    debtService: { repayment: EconomicLine; interest: EconomicLine; total: EconomicLine };
    wages: EconomicLine;
    equityRefunds: EconomicLine;
    /** Dividends transferred abroad, net of the tax on them. */
    dividends: EconomicLine;
    /** Other costs of foreign origin and the increase of the foreign net working capital. */
    others: EconomicLine;
    total: EconomicLine;
  };
  netFlow: EconomicLine;
  indirect: {
    inflows: {
      /** Foreign exchange saved by producing at home what would be imported. */
      importableOutputs: EconomicLine;
      /** Foreign exchange earned by exports the output induces. */
      exportableOutputs: EconomicLine;
      others: EconomicLine;
      total: EconomicLine;
    };
    outflows: {
      /** Foreign exchange lost by imports the input induces. */
      importableInputs: EconomicLine;
      /** Foreign exchange given up by using an input that would be exported. */
      exportableInputs: EconomicLine;
      others: EconomicLine;
      total: EconomicLine;
    };
    net: EconomicLine;
  };
  /** Net flow plus the net indirect effects. */
  netEffect: EconomicLine;
  /**
   * `PV(NNVA) / PV(net use of foreign exchange)`: the value added per unit of foreign exchange the
   * project uses. Absent, with a warning, for a project that uses none on balance (a net earner,
   * or a project without foreign flows).
   */
  valueAddedPerForeignExchange?: DecimalString;
}

export interface ForeignExchangeInput extends EconomicScheduleInput {
  localCurrency: CurrencyCode;
  /** Local units per unit of each foreign currency, one rate per project period. */
  exchangeRates: Record<CurrencyCode, DecimalString[]>;
  /** Present value of the net national value added, for the efficiency test. */
  netNationalValueAdded: DecimalString;
}

/** The net foreign-exchange effect of a calculated project. */
export function foreignExchangeEffect(
  input: ForeignExchangeInput,
): CalculationResult<ForeignExchangeSchedule> {
  const { financing, operations, statements, economic } = input;
  const { length, zero, row, add, minus, addTo, present, line, dividendTax, costs, investments } =
    economicBase(input);
  const warnings: CalculationWarning[] = [];
  const sumOf = (rows: Row[]) => (rows.length === 0 ? zero() : add(...rows));

  // Finance from abroad and its service.
  const foreignEquity = financing.equity.items.filter((e) => e.origin === 'FOREIGN');
  const equity = sumOf(
    foreignEquity.filter((e) => e.class !== 'SUBSIDY').map((e) => row(e.amounts)),
  );
  const grants = sumOf(
    foreignEquity.filter((e) => e.class === 'SUBSIDY').map((e) => row(e.amounts)),
  );
  const equityRefunds = sumOf(foreignEquity.map((e) => row(e.refunds ?? [])));
  const loans = zero();
  const repayment = zero();
  const interest = zero();
  for (const loan of financing.loans) {
    if (loan.origin !== 'FOREIGN') continue;
    loan.periods.forEach((p, j) => {
      const capitalised = toDecimal(p.capitalisedInterest);
      loans[j] = at(loans, j).plus(toDecimal(p.disbursement)).plus(capitalised);
      repayment[j] = at(repayment, j).plus(toDecimal(p.repayment));
      interest[j] = at(interest, j)
        .plus(toDecimal(p.interest))
        .plus(capitalised)
        .plus(toDecimal(p.fees));
    });
  }
  const exportLines = operations.products.flatMap((p) =>
    p.lines.filter((l) => l.market === 'EXPORT'),
  );
  const exports = sumOf(exportLines.map((l) => row(l.grossRevenue)));
  const inflow = add(equity, loans, grants, exports);

  // What is bought and paid abroad.
  const investment = zero();
  for (const item of investments) {
    if (item.origin === 'FOREIGN') addTo(investment, item.amounts, netOfTax(item.tax));
  }
  const materials = zero();
  const wages = zero();
  const otherCosts = zero();
  for (const cost of costs) {
    if (cost.origin !== 'FOREIGN') continue;
    const target =
      cost.nature === 'MATERIALS' ? materials : cost.nature === 'WAGES' ? wages : otherCosts;
    addTo(target, cost.sold, netOfTax(cost.tax));
  }
  const repatriated = sumOf(statements.dividends.shareholders.map((s) => row(s.repatriated)));
  const dividends = repatriated.map((v) => v.minus(v.times(dividendTax.foreign)));
  // The costs above are those of the products sold; what is tied up in stocks, receivables and
  // cash for foreign costs, less what is owed for them, is paid on top. The stock of foreign
  // materials an existing enterprise starts with was paid for before the project.
  const working = operations.workingCapital;
  const openingForeign = toDecimal(working.starting?.opening.foreign ?? '0');
  const foreignWorkingCapital = row(working.totals.foreign);
  const workingCapitalIncrease = foreignWorkingCapital.map((v, j) =>
    v.minus(j === 0 ? openingForeign : at(foreignWorkingCapital, j - 1)),
  );
  const others = add(otherCosts, workingCapitalIncrease);
  const debtService = add(repayment, interest);
  const outflow = add(investment, materials, debtService, wages, equityRefunds, dividends, others);
  const netFlow = minus(inflow, outflow);

  // Indirect effects: tradable outputs and inputs, and what the user enters.
  const indirect = economic.indirectForeignExchange;
  const tradable = (
    entry: { trade: TradeCategory; share: DecimalString; borderPriceFactor: DecimalString },
    field: string,
  ) => {
    if (!(TRADE_CATEGORIES as readonly string[]).includes(entry.trade)) {
      throw new EngineInputError('economic.trade', `${field}.trade`);
    }
    const share = toDecimal(entry.share);
    if (share.isNegative() || share.gt(1)) {
      throw new EngineInputError('share.outOfRange', `${field}.share`);
    }
    const factor = toDecimal(entry.borderPriceFactor);
    if (factor.isNegative() && !factor.isZero()) {
      throw new EngineInputError('amount.negative', `${field}.borderPriceFactor`);
    }
    return share.times(factor);
  };
  const outputs: Record<TradeCategory, Row> = { IMPORTABLE: zero(), EXPORTABLE: zero() };
  const outputEntries = indirect?.outputs ?? [];
  uniqueKeys(
    outputEntries.map((o) => JSON.stringify([o.product, o.line])),
    'indirectForeignExchange.outputs',
    'line',
  );
  outputEntries.forEach((entry, i) => {
    const field = `indirectForeignExchange.outputs[${i}]`;
    const product = operations.products.find((p) => p.key === entry.product);
    if (product === undefined)
      throw new EngineInputError('economic.unknownItem', `${field}.product`);
    const sales = product.lines.find((l) => l.key === entry.line);
    if (sales === undefined) throw new EngineInputError('economic.unknownItem', `${field}.line`);
    if (sales.market !== 'LOCAL')
      throw new EngineInputError('economic.notTradable', `${field}.line`);
    const factor = tradable(entry, field);
    addTo(outputs[entry.trade], row(sales.netRevenue), factor);
  });
  const inputs: Record<TradeCategory, Row> = { IMPORTABLE: zero(), EXPORTABLE: zero() };
  const inputEntries = entriesByItem(
    indirect?.inputs ?? [],
    'indirectForeignExchange.inputs',
    new Set(costs.map((c) => c.key)),
  );
  for (const cost of costs) {
    const found = inputEntries.get(cost.key);
    if (found === undefined) continue;
    if (cost.origin !== 'LOCAL' || cost.nature !== 'MATERIALS') {
      throw new EngineInputError('economic.notTradable', `${found.field}.item`);
    }
    const factor = tradable(found.entry, found.field);
    addTo(inputs[found.entry.trade], cost.sold, factor);
  }
  const entered = (items: IndirectForeignExchangeItem[] | undefined, field: string) => {
    const list = items ?? [];
    uniqueKeys(
      list.map((item) => item.key),
      field,
    );
    return sumOf(
      list.map((item, i) => {
        const own = periodAmounts(item.amounts, length, `${field}[${i}].amounts`);
        const rates = ratesFor(item.currency, input, length, `${field}[${i}].currency`);
        return rates === undefined ? own : own.map((v, j) => v.times(at(rates, j)));
      }),
    );
  };
  const otherInflows = entered(indirect?.otherInflows, 'indirectForeignExchange.otherInflows');
  const otherOutflows = entered(indirect?.otherOutflows, 'indirectForeignExchange.otherOutflows');
  const indirectInflow = add(outputs.IMPORTABLE, outputs.EXPORTABLE, otherInflows);
  const indirectOutflow = add(inputs.IMPORTABLE, inputs.EXPORTABLE, otherOutflows);
  const indirectNet = minus(indirectInflow, indirectOutflow);
  const netEffect = add(netFlow, indirectNet);

  const used: Decimal = present(netFlow).neg();
  let valueAddedPerForeignExchange: DecimalString | undefined;
  if (used.gt(0)) {
    valueAddedPerForeignExchange = toDecimalString(
      toDecimal(input.netNationalValueAdded).div(used),
    );
  } else {
    warnings.push({ code: 'foreignExchange.noNetUse' });
  }

  const value: ForeignExchangeSchedule = {
    inflows: {
      equity: line(equity),
      loans: line(loans),
      grants: line(grants),
      exports: line(exports),
      total: line(inflow),
    },
    outflows: {
      investment: line(investment),
      materials: line(materials),
      debtService: {
        repayment: line(repayment),
        interest: line(interest),
        total: line(debtService),
      },
      wages: line(wages),
      equityRefunds: line(equityRefunds),
      dividends: line(dividends),
      others: line(others),
      total: line(outflow),
    },
    netFlow: line(netFlow),
    indirect: {
      inflows: {
        importableOutputs: line(outputs.IMPORTABLE),
        exportableOutputs: line(outputs.EXPORTABLE),
        others: line(otherInflows),
        total: line(indirectInflow),
      },
      outflows: {
        importableInputs: line(inputs.IMPORTABLE),
        exportableInputs: line(inputs.EXPORTABLE),
        others: line(otherOutflows),
        total: line(indirectOutflow),
      },
      net: line(indirectNet),
    },
    netEffect: line(netEffect),
    ...(valueAddedPerForeignExchange === undefined ? {} : { valueAddedPerForeignExchange }),
  };
  return { value, modelVersion: MODEL_VERSION, warnings, defaultsUsed: [] };
}
