import {
  ONE,
  ZERO,
  toDecimal,
  toDecimalString,
  type Decimal,
  type DecimalString,
} from '../decimal';
import { EngineInputError } from '../errors';
import type { EngineMessageCode } from '../messages';
import type { CalculationResult, CalculationWarning } from '../types';
import { MODEL_VERSION } from '../version';
import { periodAmounts } from './asset-depreciation';
import { checkOrigin, ratesFor, uniqueKeys, type Origin } from './investment';
import { checkInflation, currentPriceFactors, type PriceContext, type PricedItem } from './prices';
import { productionProgramme } from './sales-programme';
import {
  outstanding,
  settlementDays,
  startingAmount,
  startingByKey,
  type OperationsStartingBalances,
} from './starting-balances';
import { coverageDays, workingCapitalValues, type Coverage } from './working-capital';

/**
 * Operations of the production phase (manual VII.H, VII.J, VII.O–Q, XI.G, XI.J–L, XI.O, X.C.3–4;
 * comfar-model-spec §4.3, §4.5–4.7): the sales and production programme of every product, sales
 * revenue, production costs of the products produced (CPP) and sold (CPS), allocation of indirect
 * costs to products and cost centres, net working capital and interest on short-term deposits.
 * Everything is per project period, in local currency at current prices. Depreciation and the
 * costs of finance come from the investment and financing schedules; the statements (ST-34.04)
 * put them together.
 */

/** COMFAR's production-cost lines (X.C.3), in schedule order. */
export const COST_CATEGORIES = [
  'RAW_MATERIALS',
  'FACTORY_SUPPLIES',
  'UTILITIES',
  'ENERGY',
  'SPARE_PARTS',
  'LABOUR',
  'LABOUR_OVERHEADS',
  'FACTORY_OVERHEADS',
  'ADMINISTRATIVE_OVERHEADS',
  'LEASING',
  'DIRECT_MARKETING',
  'MARKETING_OVERHEADS',
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

/** COMFAR's six standard cost-centre groups (VII.J). */
export const COST_CENTRE_GROUPS = [
  'PRODUCTION',
  'STORAGE',
  'ENVIRONMENT',
  'MARKETING',
  'SERVICES',
  'ADMINISTRATION',
] as const;
export type CostCentreGroup = (typeof COST_CENTRE_GROUPS)[number];

/** Keys for allocating an indirect cost to products (XI.G), plus the user's own shares. */
export const ALLOCATION_KEYS = [
  'DIRECT_COST',
  'DIRECT_FACTORY_COST',
  'DIRECT_MATERIAL',
  'DIRECT_LABOUR',
  'SALES',
  'EQUAL',
  'SHARES',
] as const;
export type AllocationKey = (typeof ALLOCATION_KEYS)[number];

export type Market = 'LOCAL' | 'EXPORT';

const MATERIALS: ReadonlySet<CostCategory> = new Set([
  'RAW_MATERIALS',
  'FACTORY_SUPPLIES',
  'UTILITIES',
  'ENERGY',
  'SPARE_PARTS',
]);
const FACTORY: ReadonlySet<CostCategory> = new Set([
  ...MATERIALS,
  'LABOUR',
  'LABOUR_OVERHEADS',
  'FACTORY_OVERHEADS',
]);
const OPERATING: ReadonlySet<CostCategory> = new Set([...FACTORY, 'ADMINISTRATIVE_OVERHEADS']);
const MARKETING: ReadonlySet<CostCategory> = new Set(['DIRECT_MARKETING', 'MARKETING_OVERHEADS']);

/** One value for every period, or one value per period. */
export type PerPeriod = DecimalString | DecimalString[];

export interface SalesLine extends PricedItem {
  key: string;
  market: Market;
  /** Quantity sold per period; exactly one of `quantities` and `capacityShares` is entered. */
  quantities?: DecimalString[];
  /** Share of the nominal capacity sold per period (a short period sells `m / 12` of it). */
  capacityShares?: DecimalString[];
  /** Unit price net of sales tax, in the line's currency, at the prices of the horizon's start. */
  price: PerPeriod;
  /** Sales tax as a fraction of the net price (shown in gross sales revenue only). */
  salesTaxRate: PerPeriod;
  /** Subsidy as a fraction of the net sales revenue. */
  subsidyRate: PerPeriod;
  /** Subsidy as an amount per period in the line's currency (added to the rate; not escalated). */
  subsidyAmount: PerPeriod;
  /** Accounts receivable of this market. */
  receivablesCoverage: Coverage;
}

export interface OperationsProduct {
  key: string;
  /** Units per full year for which standard costs at nominal capacity are defined. */
  nominalCapacity?: DecimalString;
  /** First and last period of production (inclusive); the whole production phase when absent. */
  production?: { firstPeriod: number; lastPeriod: number };
  sales: SalesLine[];
  finishedGoodsCoverage: Coverage;
  workInProgressCoverage: Coverage;
}

export type StandardCost =
  | {
      mode: 'AT_NOMINAL_CAPACITY';
      /** Quantity and price of the input at nominal capacity, per full year. */
      quantity: DecimalString;
      price: DecimalString;
      /** Variable part as a fraction; the rest is fixed. */
      variableShare: DecimalString;
    }
  | {
      mode: 'PER_UNIT';
      /** Quantity of the input per unit of output and its price (fully variable). */
      quantity: DecimalString;
      price: DecimalString;
      /** Fixed cost per full year, in the item's currency. */
      fixedCost: DecimalString;
    };

export type CostAllocation =
  | { key: Exclude<AllocationKey, 'SHARES'> }
  | { key: 'SHARES'; shares: Record<string, DecimalString> };

export interface CostItem extends PricedItem {
  key: string;
  category: CostCategory;
  /** The product a direct cost belongs to; an item without a product is an indirect cost. */
  product?: string;
  origin: Origin;
  /** Standard cost of a direct item (indirect costs are entered as adjustments only). */
  standard?: StandardCost;
  /**
   * Adjustments per project period (quantity × price, with their own variable share). In
   * construction periods they are purchases of initial stock (material categories only).
   */
  adjustments?: {
    quantities: DecimalString[];
    prices: DecimalString[];
    variableShares: DecimalString[];
  };
  costCentre?: string;
  /** How an indirect cost is shared among products; required when it has several products. */
  allocation?: CostAllocation;
  /** Stock of a material item; required for the material categories. */
  stockCoverage?: Coverage;
  /** Accounts payable of the item. */
  payablesCoverage: Coverage;
}

export interface CostCentre {
  key: string;
  group: CostCentreGroup;
  /** Products of the centre; all products when absent. */
  products?: string[];
}

export interface OperationsInput extends PriceContext {
  products: OperationsProduct[];
  costs: CostItem[];
  costCentres?: CostCentre[];
  cash: {
    /** Cash-in-hand for local and for foreign costs (basis: operating costs less materials). */
    localCoverage: Coverage;
    foreignCoverage: Coverage;
    /** Share of cash-in-hand held in short-term deposits and their yearly rate. */
    depositShare: DecimalString;
    depositRate: DecimalString;
  };
  /** Current assets and liabilities of an existing enterprise (expansion projects). */
  startingBalances?: OperationsStartingBalances;
}

export interface CostBreakdown {
  /** Every category is listed, zero when it has no items. */
  categories: Record<CostCategory, DecimalString[]>;
  /** Raw materials, factory supplies, utilities, energy and spare parts. */
  materials: DecimalString[];
  /** Materials + labour, labour overheads and factory overheads. */
  factoryCosts: DecimalString[];
  /** Factory costs + administrative overheads. */
  operatingCosts: DecimalString[];
  leasing: DecimalString[];
  /** Direct marketing costs + marketing overheads. */
  marketing: DecimalString[];
  /** Operating costs + leasing + marketing (depreciation and interest are added by ST-34.04). */
  total: DecimalString[];
  fixed: DecimalString[];
  variable: DecimalString[];
  foreign: DecimalString[];
  local: DecimalString[];
}

export interface RevenueLines {
  /** Net sales revenue + sales tax (for information). */
  grossRevenue: DecimalString[];
  salesTax: DecimalString[];
  netRevenue: DecimalString[];
  subsidy: DecimalString[];
  /** Net sales revenue + subsidy. */
  revenue: DecimalString[];
}

export interface ProductSchedule extends RevenueLines {
  key: string;
  quantities: {
    sold: DecimalString[];
    stockBroughtForward: DecimalString[];
    produced: DecimalString[];
    stockCarried: DecimalString[];
  };
  /** Production over the nominal capacity of the period; null without a capacity or production. */
  capacityUtilisation: (DecimalString | null)[];
  lines: (RevenueLines & {
    key: string;
    market: Market;
    quantity: DecimalString[];
    /** Current net unit price in local currency. */
    unitPrice: DecimalString[];
  })[];
  costs: {
    /** Direct costs of the products produced. */
    direct: CostBreakdown;
    /** Direct and allocated indirect costs of the products produced (CPP) and sold (CPS). */
    produced: CostBreakdown;
    sold: CostBreakdown;
  };
}

export interface WorkingCapitalSchedule {
  materials: { key: string; category: CostCategory; origin: Origin; values: DecimalString[] }[];
  workInProgress: { product: string; values: DecimalString[] }[];
  finishedProducts: { product: string; values: DecimalString[] }[];
  receivables: { product: string; line: string; market: Market; values: DecimalString[] }[];
  cash: {
    local: DecimalString[];
    foreign: DecimalString[];
    /** Part of the cash requirement held in short-term deposits, and the rest in hand. */
    deposits: DecimalString[];
    inHand: DecimalString[];
  };
  payables: { key: string; origin: Origin; values: DecimalString[] }[];
  totals: {
    materials: DecimalString[];
    workInProgress: DecimalString[];
    finishedProducts: DecimalString[];
    inventory: DecimalString[];
    receivables: DecimalString[];
    cash: DecimalString[];
    currentAssets: DecimalString[];
    currentLiabilities: DecimalString[];
    netWorkingCapital: DecimalString[];
    /** Increase of the period (a use of funds); a decrease is negative. */
    increase: DecimalString[];
    /** Net working capital by the origin of the underlying costs. */
    foreign: DecimalString[];
    local: DecimalString[];
  };
  /** Net working capital at the end of production, liquidated in the scrap year. */
  liquidation: DecimalString;
  /**
   * Starting balances of an existing enterprise (expansion projects only). Receivables and
   * payables of the starting balance are not part of the requirement algorithm (XI.K): they are
   * collected and paid on the entered day, and until then they are part of `totals.receivables`
   * and `totals.currentLiabilities`. Starting short-term deposits stay in `cash.deposits` to the
   * end. `opening` is the position on the day before the first period, against which the first
   * period's increase is measured.
   */
  starting?: {
    receivables: DecimalString[];
    payables: DecimalString[];
    deposits: DecimalString;
    opening: {
      materials: DecimalString;
      workInProgress: DecimalString;
      finishedProducts: DecimalString;
      receivables: DecimalString;
      cashInHand: DecimalString;
      shortTermDeposits: DecimalString;
      currentAssets: DecimalString;
      currentLiabilities: DecimalString;
      netWorkingCapital: DecimalString;
    };
  };
}

export interface OperationsSchedule {
  products: ProductSchedule[];
  sales: RevenueLines & { local: DecimalString[]; export: DecimalString[] };
  costs: {
    items: {
      key: string;
      category: CostCategory;
      product?: string;
      origin: Origin;
      /** Cost of the products produced. */
      fixed: DecimalString[];
      variable: DecimalString[];
      total: DecimalString[];
      /** Initial stock bought in construction periods. */
      initialStock: DecimalString[];
    }[];
    produced: CostBreakdown;
    sold: CostBreakdown;
    /** Costs not entered for a product, before allocation. */
    indirect: CostBreakdown;
    centres: (Pick<CostBreakdown, 'total' | 'fixed' | 'variable' | 'foreign' | 'local'> & {
      key: string;
      group: CostCentreGroup;
    })[];
    /** Costs per standard group; items without a centre count as production (X.C.3). */
    groups: Record<CostCentreGroup, DecimalString[]>;
  };
  workingCapital: WorkingCapitalSchedule;
  /** `IOS_j = CIH_j × s × r × m / 12`. */
  depositInterest: DecimalString[];
}

const at = (values: Decimal[] | undefined, j: number) => values?.[j] ?? ZERO;
const strings = (values: Decimal[]) => values.map((v) => toDecimalString(v));
const sumRows = (rows: Decimal[][], length: number) =>
  Array.from({ length }, (_, j) => rows.reduce((s, row) => s.plus(at(row, j)), ZERO));
const isNegative = (value: Decimal) => value.isNegative() && !value.isZero();

type Check = (value: Decimal, field: string) => void;
const notNegative =
  (code: EngineMessageCode): Check =>
  (value, field) => {
    if (isNegative(value)) throw new EngineInputError(code, field);
  };
const amount = notNegative('amount.negative');
const rate = notNegative('rate.negative');
const share: Check = (value, field) => {
  if (isNegative(value) || value.gt(1)) throw new EngineInputError('share.outOfRange', field);
};

function scalar(value: DecimalString, field: string, check: Check): Decimal {
  const parsed = toDecimal(value);
  check(parsed, field);
  return parsed;
}

function series(values: DecimalString[], length: number, field: string, check?: Check): Decimal[] {
  if (values.length !== length) {
    throw new EngineInputError('series.lengthMismatch', field, {
      expected: String(length),
      actual: String(values.length),
    });
  }
  return values.map((v, j) => {
    const parsed = toDecimal(v);
    check?.(parsed, `${field}[${j}]`);
    return parsed;
  });
}

function perPeriod(value: PerPeriod, length: number, field: string, check: Check): Decimal[] {
  if (typeof value !== 'string') return series(value, length, field, check);
  const parsed = scalar(value, field, check);
  return Array.from({ length }, () => parsed);
}

interface ParsedLine {
  line: SalesLine;
  quantity: Decimal[];
  unitPrice: Decimal[];
  net: Decimal[];
  tax: Decimal[];
  subsidy: Decimal[];
  receivablesDays: Decimal;
}

interface ParsedProduct {
  product: OperationsProduct;
  capacity: Decimal | undefined;
  firstPeriod: number;
  lastPeriod: number;
  lines: ParsedLine[];
  sold: Decimal[];
  broughtForward: Decimal[];
  produced: Decimal[];
  carried: Decimal[];
  revenue: Decimal[];
  workInProgressDays: Decimal;
}

interface ParsedCost {
  item: CostItem;
  product: ParsedProduct | undefined;
  centre: CostCentre | undefined;
  fixed: Decimal[];
  variableProduced: Decimal[];
  variableSold: Decimal[];
  initialStock: Decimal[];
  stockDays: Decimal | undefined;
  payablesDays: Decimal;
}

/** A cost item, or the part of it allocated to one product. */
interface Cell {
  item: CostItem;
  product: ParsedProduct | undefined;
  fixed: Decimal[];
  variableProduced: Decimal[];
  variableSold: Decimal[];
}

type CellFilter = (item: CostItem) => boolean;
const inSet =
  (set: ReadonlySet<CostCategory>): CellFilter =>
  (item) =>
    set.has(item.category);

/** Costs of the products produced (or sold) of the cells that pass the filter. */
function sumCells(cells: Cell[], sold: boolean, length: number, filter?: CellFilter): Decimal[] {
  const rows = cells.filter((c) => filter === undefined || filter(c.item));
  return Array.from({ length }, (_, j) =>
    rows.reduce(
      (s, c) => s.plus(at(c.fixed, j)).plus(at(sold ? c.variableSold : c.variableProduced, j)),
      ZERO,
    ),
  );
}

function breakdown(cells: Cell[], sold: boolean, length: number): CostBreakdown {
  const of = (filter?: CellFilter) => strings(sumCells(cells, sold, length, filter));
  return {
    categories: Object.fromEntries(
      COST_CATEGORIES.map((c) => [c, of((item) => item.category === c)]),
    ) as Record<CostCategory, DecimalString[]>,
    materials: of(inSet(MATERIALS)),
    factoryCosts: of(inSet(FACTORY)),
    operatingCosts: of(inSet(OPERATING)),
    leasing: of((item) => item.category === 'LEASING'),
    marketing: of(inSet(MARKETING)),
    total: of(),
    fixed: strings(
      sumRows(
        cells.map((c) => c.fixed),
        length,
      ),
    ),
    variable: strings(
      sumRows(
        cells.map((c) => (sold ? c.variableSold : c.variableProduced)),
        length,
      ),
    ),
    foreign: of((item) => item.origin === 'FOREIGN'),
    local: of((item) => item.origin === 'LOCAL'),
  };
}

function revenueLines(lines: ParsedLine[], length: number): RevenueLines {
  const net = sumRows(
    lines.map((l) => l.net),
    length,
  );
  const tax = sumRows(
    lines.map((l) => l.tax),
    length,
  );
  const subsidy = sumRows(
    lines.map((l) => l.subsidy),
    length,
  );
  return {
    grossRevenue: strings(net.map((v, j) => v.plus(at(tax, j)))),
    salesTax: strings(tax),
    netRevenue: strings(net),
    subsidy: strings(subsidy),
    revenue: strings(net.map((v, j) => v.plus(at(subsidy, j)))),
  };
}

/** Sales, production costs and working capital per project period, in local currency. */
export function operationsSchedule(input: OperationsInput): CalculationResult<OperationsSchedule> {
  const periods = input.horizon.periods;
  const length = periods.length;
  const production = periods.map((p) => p.phase !== 'CONSTRUCTION');
  const firstProduction = production.indexOf(true);
  const warnings: CalculationWarning[] = [];
  const centres = input.costCentres ?? [];

  checkInflation(input);
  if (input.products.length === 0) throw new EngineInputError('operations.noProducts', 'products');
  uniqueKeys(
    input.products.map((p) => p.key),
    'products',
  );
  uniqueKeys(
    input.costs.map((c) => c.key),
    'costs',
  );
  uniqueKeys(
    centres.map((c) => c.key),
    'costCentres',
  );

  // Starting balances of an existing enterprise (VII.T), by the item they belong to.
  const sb = input.startingBalances;
  const hasProduct = (key: string) => input.products.some((p) => p.key === key);
  const startingStock = startingByKey(
    sb?.finishedProducts,
    'startingBalances.finishedProducts',
    'product',
    (entry) => entry.product,
    hasProduct,
    (entry, field) => ({
      quantity: startingAmount(entry.quantity, `${field}.quantity`),
      price: startingAmount(entry.price, `${field}.price`),
    }),
  );
  const startingWorkInProgress = startingByKey(
    sb?.workInProgress,
    'startingBalances.workInProgress',
    'product',
    (entry) => entry.product,
    hasProduct,
    (entry, field) => startingAmount(entry.value, `${field}.value`),
  );
  const startingMaterials = startingByKey(
    sb?.materials,
    'startingBalances.materials',
    'cost',
    (entry) => entry.cost,
    (key) => input.costs.some((c) => c.key === key),
    (entry, field) => {
      const item = input.costs.find((c) => c.key === entry.cost);
      if (item !== undefined && !MATERIALS.has(item.category)) {
        throw new EngineInputError('startingBalance.materialItem', `${field}.cost`);
      }
      return startingAmount(entry.value, `${field}.value`);
    },
  );
  const periodEndDays = periods.map((p) => p.endDay);
  const startingReceivables = outstanding(
    sb === undefined
      ? ZERO
      : startingAmount(sb.receivables.value, 'startingBalances.receivables.value'),
    sb === undefined
      ? 0
      : settlementDays(
          sb.receivables.collectionDays,
          'startingBalances.receivables.collectionDays',
        ),
    periodEndDays,
  );
  const startingPayables = outstanding(
    sb === undefined ? ZERO : startingAmount(sb.payables.value, 'startingBalances.payables.value'),
    sb === undefined
      ? 0
      : settlementDays(sb.payables.paymentDays, 'startingBalances.payables.paymentDays'),
    periodEndDays,
  );
  const startingCashInHand =
    sb === undefined ? ZERO : startingAmount(sb.cashInHand, 'startingBalances.cashInHand');
  const startingDeposits =
    sb === undefined
      ? ZERO
      : startingAmount(sb.shortTermDeposits, 'startingBalances.shortTermDeposits');

  // Sales and production programme (XI.L) and sales revenue (X.C.4) of every product.
  const products = input.products.map((product, i): ParsedProduct => {
    const field = `products[${i}]`;
    const capacity =
      product.nominalCapacity === undefined ? undefined : toDecimal(product.nominalCapacity);
    if (capacity !== undefined && !capacity.gt(0)) {
      throw new EngineInputError('amount.notPositive', `${field}.nominalCapacity`);
    }
    const firstPeriod = product.production?.firstPeriod ?? firstProduction;
    const lastPeriod = product.production?.lastPeriod ?? length - 1;
    if (
      !Number.isInteger(firstPeriod) ||
      !Number.isInteger(lastPeriod) ||
      production[firstPeriod] !== true ||
      lastPeriod < firstPeriod ||
      lastPeriod >= length
    ) {
      throw new EngineInputError('production.interval', `${field}.production`);
    }
    uniqueKeys(
      product.sales.map((l) => l.key),
      `${field}.sales`,
    );
    const lines = product.sales.map((line, k): ParsedLine => {
      const at_ = `${field}.sales[${k}]`;
      if (line.market !== 'LOCAL' && line.market !== 'EXPORT') {
        throw new EngineInputError('operations.market', `${at_}.market`);
      }
      if ((line.quantities === undefined) === (line.capacityShares === undefined)) {
        throw new EngineInputError('operations.volume', at_);
      }
      let quantity: Decimal[];
      if (line.quantities !== undefined) {
        quantity = periodAmounts(line.quantities, length, `${at_}.quantities`);
      } else {
        if (capacity === undefined) {
          throw new EngineInputError('operations.nominalCapacityRequired', `${at_}.capacityShares`);
        }
        quantity = periodAmounts(line.capacityShares ?? [], length, `${at_}.capacityShares`).map(
          (s, j) =>
            capacity
              .times(s)
              .times(periods[j]?.months ?? 12)
              .div(12),
        );
      }
      const volume = line.quantities === undefined ? 'capacityShares' : 'quantities';
      quantity.forEach((q, j) => {
        if (production[j] !== true && !q.isZero()) {
          throw new EngineInputError('operations.constructionSales', `${at_}.${volume}[${j}]`);
        }
      });
      const factors = currentPriceFactors(input, line, at_);
      const exchange = ratesFor(line.currency, input, length, `${at_}.currency`);
      const price = perPeriod(line.price, length, `${at_}.price`, amount);
      const taxRate = perPeriod(line.salesTaxRate, length, `${at_}.salesTaxRate`, rate);
      const subsidyRate = perPeriod(line.subsidyRate, length, `${at_}.subsidyRate`, rate);
      const subsidyAmount = perPeriod(line.subsidyAmount, length, `${at_}.subsidyAmount`, amount);
      const unitPrice = price.map((p, j) => p.times(at(factors, j)));
      const net = quantity.map((q, j) => q.times(at(unitPrice, j)));
      return {
        line,
        quantity,
        unitPrice,
        net,
        tax: net.map((v, j) => v.times(at(taxRate, j))),
        subsidy: net.map((v, j) =>
          production[j] === true
            ? v.times(at(subsidyRate, j)).plus(at(subsidyAmount, j).times(exchange?.[j] ?? ONE))
            : ZERO,
        ),
        receivablesDays: coverageDays(line.receivablesCoverage, `${at_}.receivablesCoverage`),
      };
    });
    const sold = sumRows(
      lines.map((l) => l.quantity),
      length,
    );
    const programme = productionProgramme(
      {
        sales: sold,
        months: periods.map((p) => p.months),
        coverageDays: coverageDays(product.finishedGoodsCoverage, `${field}.finishedGoodsCoverage`),
        firstPeriod,
        lastPeriod,
        ...(startingStock.has(product.key)
          ? { openingStock: startingStock.get(product.key)?.quantity ?? ZERO }
          : {}),
      },
      // The first sales line that sells in the period.
      (j) => {
        const k = lines.findIndex((l) => !at(l.quantity, j).isZero());
        const volume = product.sales[k]?.quantities === undefined ? 'capacityShares' : 'quantities';
        return `${field}.sales[${k}].${volume}[${j}]`;
      },
    );
    return {
      product,
      capacity,
      firstPeriod,
      lastPeriod,
      lines,
      sold,
      ...programme,
      revenue: sumRows(
        lines.map((l) => l.net.map((v, j) => v.plus(at(l.subsidy, j)))),
        length,
      ),
      workInProgressDays: coverageDays(
        product.workInProgressCoverage,
        `${field}.workInProgressCoverage`,
      ),
    };
  });
  const productByKey = new Map(products.map((p) => [p.product.key, p]));

  centres.forEach((centre, i) => {
    if (!(COST_CENTRE_GROUPS as readonly string[]).includes(centre.group)) {
      throw new EngineInputError('operations.costCentreGroup', `costCentres[${i}].group`);
    }
    if (centre.products === undefined) return;
    if (centre.products.length === 0) {
      throw new EngineInputError('operations.costCentre', `costCentres[${i}].products`);
    }
    centre.products.forEach((key, k) => {
      if (!productByKey.has(key)) {
        throw new EngineInputError('operations.unknownProduct', `costCentres[${i}].products[${k}]`);
      }
    });
  });

  // Production costs (XI.J): standard costs and adjustments of every item, at current prices.
  const costs = input.costs.map((item, i): ParsedCost => {
    const field = `costs[${i}]`;
    if (!(COST_CATEGORIES as readonly string[]).includes(item.category)) {
      throw new EngineInputError('operations.costCategory', `${field}.category`);
    }
    checkOrigin(item.origin, `${field}.origin`);
    const product = item.product === undefined ? undefined : productByKey.get(item.product);
    if (item.product !== undefined && product === undefined) {
      throw new EngineInputError('operations.unknownProduct', `${field}.product`);
    }
    const centre =
      item.costCentre === undefined ? undefined : centres.find((c) => c.key === item.costCentre);
    if (item.costCentre !== undefined && centre === undefined) {
      throw new EngineInputError('operations.costCentre', `${field}.costCentre`);
    }
    if (
      product !== undefined &&
      centre?.products !== undefined &&
      !centre.products.includes(product.product.key)
    ) {
      throw new EngineInputError('operations.costCentreProduct', `${field}.costCentre`);
    }
    const factors = currentPriceFactors(input, item, field);

    const adjustment = periods.map(() => ZERO);
    let variableShares = adjustment;
    if (item.adjustments !== undefined) {
      const quantities = series(
        item.adjustments.quantities,
        length,
        `${field}.adjustments.quantities`,
      );
      const prices = series(item.adjustments.prices, length, `${field}.adjustments.prices`, amount);
      variableShares = series(
        item.adjustments.variableShares,
        length,
        `${field}.adjustments.variableShares`,
        share,
      );
      quantities.forEach((q, j) => {
        const value = q.times(at(prices, j)).times(at(factors, j));
        if (production[j] !== true) {
          const at_ = `${field}.adjustments.quantities[${j}]`;
          if (isNegative(q)) throw new EngineInputError('amount.negative', at_);
          if (!value.isZero() && !MATERIALS.has(item.category)) {
            throw new EngineInputError('operations.initialStockCategory', at_);
          }
        }
        adjustment[j] = value;
      });
    }

    // Standard cost: fixed part per full year and variable part per unit of output.
    let fixedPerYear = ZERO;
    let perUnit = ZERO;
    const standard = item.standard;
    if (standard !== undefined) {
      if (product === undefined) {
        throw new EngineInputError('operations.indirectStandard', `${field}.standard`);
      }
      const quantity = scalar(standard.quantity, `${field}.standard.quantity`, amount);
      const price = scalar(standard.price, `${field}.standard.price`, amount);
      if (standard.mode === 'AT_NOMINAL_CAPACITY') {
        if (product.capacity === undefined) {
          throw new EngineInputError(
            'operations.nominalCapacityRequired',
            `${field}.standard.mode`,
          );
        }
        const variable = scalar(standard.variableShare, `${field}.standard.variableShare`, share);
        const cost = quantity.times(price);
        fixedPerYear = cost.times(ONE.minus(variable));
        perUnit = cost.times(variable).div(product.capacity);
      } else if (standard.mode === 'PER_UNIT') {
        fixedPerYear = scalar(standard.fixedCost, `${field}.standard.fixedCost`, amount);
        perUnit = quantity.times(price);
      } else {
        throw new EngineInputError('operations.standardMode', `${field}.standard.mode`);
      }
    }

    const fixed: Decimal[] = [];
    const variableProduced: Decimal[] = [];
    const variableSold: Decimal[] = [];
    const initialStock: Decimal[] = [];
    periods.forEach((p, j) => {
      if (production[j] !== true) {
        fixed.push(ZERO);
        variableProduced.push(ZERO);
        variableSold.push(ZERO);
        initialStock.push(at(adjustment, j));
        return;
      }
      const factor = at(factors, j);
      const variableAdjustment = at(adjustment, j).times(at(variableShares, j));
      // Fixed standard costs run over the product's production interval, m / 12 of a year's cost.
      const inInterval =
        product !== undefined && j >= product.firstPeriod && j <= product.lastPeriod;
      const standardFixed = inInterval ? fixedPerYear.times(factor).times(p.months).div(12) : ZERO;
      const unit = perUnit.times(factor);
      const row = [
        standardFixed.plus(at(adjustment, j)).minus(variableAdjustment),
        unit.times(at(product?.produced, j)).plus(variableAdjustment),
        unit.times(at(product?.sold, j)).plus(variableAdjustment),
      ] as const;
      if (row.some(isNegative)) {
        throw new EngineInputError(
          'operations.negativeCost',
          `${field}.adjustments.quantities[${j}]`,
        );
      }
      fixed.push(row[0]);
      variableProduced.push(row[1]);
      variableSold.push(row[2]);
      initialStock.push(ZERO);
    });
    return {
      item,
      product,
      centre,
      fixed,
      variableProduced,
      variableSold,
      initialStock,
      stockDays: MATERIALS.has(item.category)
        ? coverageDays(item.stockCoverage, `${field}.stockCoverage`)
        : undefined,
      payablesDays: coverageDays(item.payablesCoverage, `${field}.payablesCoverage`),
    };
  });

  // Cost allocation (XI.G): a direct cost belongs to its product, an indirect cost is shared among
  // the products of its cost centre (all products without one) by the item's key.
  const itemCells = costs.map((c): Cell => ({ ...c }));
  const directOf = (product: ParsedProduct) => itemCells.filter((c) => c.product === product);
  const weights = (key: AllocationKey, product: ParsedProduct): Decimal[] => {
    const direct = (filter?: CellFilter) => sumCells(directOf(product), false, length, filter);
    switch (key) {
      case 'DIRECT_COST':
        return direct();
      case 'DIRECT_FACTORY_COST':
        return direct(inSet(FACTORY));
      case 'DIRECT_MATERIAL':
        return direct((i) => i.category === 'RAW_MATERIALS' || i.category === 'FACTORY_SUPPLIES');
      case 'DIRECT_LABOUR':
        return direct((i) => i.category === 'LABOUR');
      case 'SALES':
        return product.revenue;
      default:
        return periods.map(() => ONE);
    }
  };
  const cells = costs.flatMap((cost, i): Cell[] => {
    if (cost.product !== undefined) return [itemCells[i] as Cell];
    const field = `costs[${i}].allocation`;
    const eligible =
      cost.centre?.products === undefined
        ? products
        : products.filter((p) => cost.centre?.products?.includes(p.product.key));
    const allocation = cost.item.allocation;
    let rows: Decimal[][];
    if (
      allocation !== undefined &&
      !(ALLOCATION_KEYS as readonly string[]).includes(allocation.key)
    ) {
      throw new EngineInputError('operations.allocationKey', `${field}.key`);
    }
    if (eligible.length === 1) {
      rows = [periods.map(() => ONE)];
    } else if (allocation === undefined) {
      throw new EngineInputError('operations.allocationRequired', field);
    } else if (allocation.key === 'SHARES') {
      let total = ZERO;
      // Shares that are missing altogether add up to 0 and are refused below.
      const entered: Record<string, DecimalString> | undefined = allocation.shares;
      for (const [key, value] of Object.entries(entered ?? {})) {
        if (!eligible.some((p) => p.product.key === key)) {
          throw new EngineInputError('operations.unknownProduct', `${field}.shares.${key}`);
        }
        total = total.plus(scalar(value, `${field}.shares.${key}`, share));
      }
      if (!total.eq(1))
        throw new EngineInputError('operations.allocationShares', `${field}.shares`);
      rows = eligible.map((p) => {
        const own = Object.hasOwn(allocation.shares, p.product.key)
          ? toDecimal(allocation.shares[p.product.key] ?? '0')
          : ZERO;
        return periods.map(() => own);
      });
    } else {
      rows = eligible.map((p) => weights(allocation.key, p));
    }
    const parts = eligible.map((product): Cell => ({
      item: cost.item,
      product,
      fixed: [],
      variableProduced: [],
      variableSold: [],
    }));
    let warned = false;
    periods.forEach((_, j) => {
      const sum = rows.reduce((s, row) => s.plus(at(row, j)), ZERO);
      if (
        sum.isZero() &&
        !warned &&
        !at(cost.fixed, j).plus(at(cost.variableProduced, j)).isZero()
      ) {
        warned = true;
        warnings.push({
          code: 'allocation.noBasis',
          params: { item: cost.item.key, period: String(j + 1) },
        });
      }
      for (const name of ['fixed', 'variableProduced', 'variableSold'] as const) {
        const whole = at(cost[name], j);
        let rest = whole;
        // The last product with a share takes the remainder, so the parts add up to the item
        // exactly and a product without a share gets exactly 0.
        const last = sum.isZero()
          ? parts.length - 1
          : rows.reduce((found, row, p) => (at(row, j).isZero() ? found : p), 0);
        parts.forEach((part, p) => {
          const value =
            p === last
              ? rest
              : p > last
                ? ZERO
                : sum.isZero()
                  ? whole.div(parts.length)
                  : whole.times(at(rows[p], j)).div(sum);
          rest = rest.minus(value);
          part[name].push(value);
        });
      }
    });
    return parts;
  });
  const cellsOf = (product: ParsedProduct) => cells.filter((c) => c.product === product);

  // Net working capital (XI.K, value algorithm).
  const wcPeriods = periods.map((p, j) => ({
    months: p.months,
    production: production[j] === true,
  }));
  // Only material stocks carry a value over; every other item equals its requirement.
  const values = (bases: Decimal[], days: Decimal, purchases?: Decimal[], opening?: Decimal) =>
    workingCapitalValues({
      bases,
      periods: wcPeriods,
      days,
      stock: purchases !== undefined,
      ...(purchases === undefined ? {} : { purchases }),
      ...(opening === undefined ? {} : { opening }),
    });
  /** `value × part / whole`, 0 when the whole is 0. */
  const portion = (value: Decimal, part: Decimal, whole: Decimal) =>
    whole.isZero() ? ZERO : value.times(part).div(whole);
  const foreignOnly =
    (filter: CellFilter): CellFilter =>
    (item) =>
      item.origin === 'FOREIGN' && filter(item);
  const produced = (cost: ParsedCost) =>
    cost.fixed.map((v, j) => v.plus(at(cost.variableProduced, j)));

  const materials = costs
    .filter((c) => c.stockDays !== undefined)
    .map((c) => ({
      cost: c,
      values: values(
        produced(c),
        c.stockDays ?? ZERO,
        c.initialStock,
        startingMaterials.get(c.item.key),
      ),
    }));
  const payables = costs.map((c) => ({ cost: c, values: values(produced(c), c.payablesDays) }));

  const workInProgress = products.map((product) => {
    const own = cellsOf(product);
    const basis = sumCells(own, false, length, inSet(FACTORY));
    const foreignBasis = sumCells(own, false, length, foreignOnly(inSet(FACTORY)));
    const total = values(
      basis,
      product.workInProgressDays,
      undefined,
      startingWorkInProgress.get(product.product.key),
    );
    return {
      product,
      values: total,
      foreign: total.map((v, j) => portion(v, at(foreignBasis, j), at(basis, j))),
    };
  });

  // Finished products: the stock of the programme at the operating cost per unit sold. A period
  // without sales produces nothing either (XI.L), so the stock keeps its value.
  const finishedProducts = products.map((product) => {
    const own = cellsOf(product);
    const operating = (foreign: boolean) =>
      sumCells(own, true, length, foreign ? foreignOnly(inSet(OPERATING)) : inSet(OPERATING));
    const basis = [operating(false), operating(true)] as const;
    // A starting balance is valued at its entered price until a period with sales revalues it.
    const opening = startingStock.get(product.product.key);
    let previous: readonly [Decimal, Decimal] = [
      opening === undefined ? ZERO : opening.quantity.times(opening.price),
      ZERO,
    ];
    const rows = periods.map((_, j) => {
      const stock = at(product.carried, j);
      const quantity = at(product.sold, j);
      if (stock.isZero()) previous = [ZERO, ZERO];
      else if (!quantity.isZero()) {
        previous = [
          stock.times(at(basis[0], j)).div(quantity),
          stock.times(at(basis[1], j)).div(quantity),
        ];
      }
      return previous;
    });
    return { product, values: rows.map((r) => r[0]), foreign: rows.map((r) => r[1]) };
  });

  // Receivables per market: the cost of the products sold (operating + marketing), shared among
  // the product's markets by quantity.
  const receivables = products.flatMap((product) => {
    const own = cellsOf(product);
    const filter: CellFilter = (item) =>
      OPERATING.has(item.category) || MARKETING.has(item.category);
    const basis = sumCells(own, true, length, filter);
    const foreignBasis = sumCells(own, true, length, foreignOnly(filter));
    return product.lines.map((line) => {
      const total = values(
        basis.map((b, j) => portion(b, at(line.quantity, j), at(product.sold, j))),
        line.receivablesDays,
      );
      return {
        product,
        line,
        values: total,
        foreign: total.map((v, j) => portion(v, at(foreignBasis, j), at(basis, j))),
      };
    });
  });

  const cashFilter: CellFilter = (item) =>
    OPERATING.has(item.category) && !MATERIALS.has(item.category);
  // The starting balances are in local currency, so the cash-in-hand is part of the local cash.
  const cashLocal = values(
    sumCells(itemCells, false, length, (item) => item.origin === 'LOCAL' && cashFilter(item)),
    coverageDays(input.cash.localCoverage, 'cash.localCoverage'),
    undefined,
    sb === undefined ? undefined : startingCashInHand,
  );
  const cashForeign = values(
    sumCells(itemCells, false, length, foreignOnly(cashFilter)),
    coverageDays(input.cash.foreignCoverage, 'cash.foreignCoverage'),
  );
  const depositShare = scalar(input.cash.depositShare, 'cash.depositShare', share);
  const depositRate = scalar(input.cash.depositRate, 'cash.depositRate', rate);
  const required = cashLocal.map((v, j) => v.plus(at(cashForeign, j)));
  // Deposits made from the cash requirement earn interest (XI.O); the deposits of the starting
  // balance are added to them and stay to the end. Before production the cash is the starting
  // balance, all of it in hand.
  const earning = required.map((v, j) => (production[j] === true ? v.times(depositShare) : ZERO));
  const deposits = earning.map((v) => v.plus(startingDeposits));
  const cash = required.map((v) => v.plus(startingDeposits));

  const total = (rows: { values: Decimal[] }[]) =>
    sumRows(
      rows.map((r) => r.values),
      length,
    );
  const foreignOf = (rows: { cost: ParsedCost; values: Decimal[] }[]) =>
    total(rows.filter((r) => r.cost.item.origin === 'FOREIGN'));
  const materialsTotal = total(materials);
  const workInProgressTotal = total(workInProgress);
  const finishedTotal = total(finishedProducts);
  const receivablesTotal = sumRows([total(receivables), startingReceivables], length);
  const payablesTotal = sumRows([total(payables), startingPayables], length);
  const openingOf = (entries: Map<string, Decimal>) =>
    [...entries.values()].reduce((s, v) => s.plus(v), ZERO);
  const openingMaterials = openingOf(startingMaterials);
  const openingWorkInProgress = openingOf(startingWorkInProgress);
  const openingFinished = [...startingStock.values()].reduce(
    (s, v) => s.plus(v.quantity.times(v.price)),
    ZERO,
  );
  const openingReceivables =
    sb === undefined ? ZERO : startingAmount(sb.receivables.value, 'startingBalances.receivables');
  const openingPayables =
    sb === undefined ? ZERO : startingAmount(sb.payables.value, 'startingBalances.payables');
  const openingAssets = openingMaterials
    .plus(openingWorkInProgress)
    .plus(openingFinished)
    .plus(openingReceivables)
    .plus(startingCashInHand)
    .plus(startingDeposits);
  const openingNet = openingAssets.minus(openingPayables);
  const inventory = sumRows([materialsTotal, workInProgressTotal, finishedTotal], length);
  const currentAssets = sumRows([inventory, receivablesTotal, cash], length);
  const net = currentAssets.map((v, j) => v.minus(at(payablesTotal, j)));
  const foreignAssets = sumRows(
    [
      foreignOf(materials),
      ...[...workInProgress, ...finishedProducts, ...receivables].map((r) => r.foreign),
      cashForeign,
    ],
    length,
  );
  const foreign = foreignAssets.map((v, j) => v.minus(at(foreignOf(payables), j)));

  const indirect = itemCells.filter((c) => c.product === undefined);
  const lineSchedule = (l: ParsedLine) => ({
    key: l.line.key,
    market: l.line.market,
    quantity: strings(l.quantity),
    unitPrice: strings(l.unitPrice),
    ...revenueLines([l], length),
  });
  const allLines = products.flatMap((p) => p.lines);
  const marketRevenue = (market: Market) =>
    revenueLines(
      allLines.filter((l) => l.line.market === market),
      length,
    ).revenue;
  const centreCells = (centre: CostCentre) =>
    itemCells.filter((c) => c.item.costCentre === centre.key);

  const value: OperationsSchedule = {
    products: products.map((p) => ({
      key: p.product.key,
      quantities: {
        sold: strings(p.sold),
        stockBroughtForward: strings(p.broughtForward),
        produced: strings(p.produced),
        stockCarried: strings(p.carried),
      },
      capacityUtilisation: periods.map((period, j) =>
        p.capacity === undefined || j < p.firstPeriod || j > p.lastPeriod
          ? null
          : toDecimalString(at(p.produced, j).times(12).div(p.capacity.times(period.months))),
      ),
      lines: p.lines.map(lineSchedule),
      ...revenueLines(p.lines, length),
      costs: {
        direct: breakdown(directOf(p), false, length),
        produced: breakdown(cellsOf(p), false, length),
        sold: breakdown(cellsOf(p), true, length),
      },
    })),
    sales: {
      ...revenueLines(allLines, length),
      local: marketRevenue('LOCAL'),
      export: marketRevenue('EXPORT'),
    },
    costs: {
      items: costs.map((c) => ({
        key: c.item.key,
        category: c.item.category,
        ...(c.item.product === undefined ? {} : { product: c.item.product }),
        origin: c.item.origin,
        fixed: strings(c.fixed),
        variable: strings(c.variableProduced),
        total: strings(produced(c)),
        initialStock: strings(c.initialStock),
      })),
      produced: breakdown(itemCells, false, length),
      sold: breakdown(itemCells, true, length),
      indirect: breakdown(indirect, false, length),
      centres: centres.map((centre) => {
        const own = breakdown(centreCells(centre), false, length);
        return {
          key: centre.key,
          group: centre.group,
          total: own.total,
          fixed: own.fixed,
          variable: own.variable,
          foreign: own.foreign,
          local: own.local,
        };
      }),
      groups: Object.fromEntries(
        COST_CENTRE_GROUPS.map((group) => [
          group,
          strings(
            sumCells(
              itemCells.filter((c) => {
                const centre = centres.find((x) => x.key === c.item.costCentre);
                return (centre?.group ?? 'PRODUCTION') === group;
              }),
              false,
              length,
            ),
          ),
        ]),
      ) as Record<CostCentreGroup, DecimalString[]>,
    },
    workingCapital: {
      materials: materials.map((m) => ({
        key: m.cost.item.key,
        category: m.cost.item.category,
        origin: m.cost.item.origin,
        values: strings(m.values),
      })),
      workInProgress: workInProgress.map((w) => ({
        product: w.product.product.key,
        values: strings(w.values),
      })),
      finishedProducts: finishedProducts.map((f) => ({
        product: f.product.product.key,
        values: strings(f.values),
      })),
      receivables: receivables.map((r) => ({
        product: r.product.product.key,
        line: r.line.line.key,
        market: r.line.line.market,
        values: strings(r.values),
      })),
      cash: {
        local: strings(cashLocal),
        foreign: strings(cashForeign),
        deposits: strings(deposits),
        inHand: strings(cash.map((v, j) => v.minus(at(deposits, j)))),
      },
      payables: payables.map((p) => ({
        key: p.cost.item.key,
        origin: p.cost.item.origin,
        values: strings(p.values),
      })),
      totals: {
        materials: strings(materialsTotal),
        workInProgress: strings(workInProgressTotal),
        finishedProducts: strings(finishedTotal),
        inventory: strings(inventory),
        receivables: strings(receivablesTotal),
        cash: strings(cash),
        currentAssets: strings(currentAssets),
        currentLiabilities: strings(payablesTotal),
        netWorkingCapital: strings(net),
        increase: strings(net.map((v, j) => v.minus(j === 0 ? openingNet : at(net, j - 1)))),
        foreign: strings(foreign),
        local: strings(net.map((v, j) => v.minus(at(foreign, j)))),
      },
      liquidation: toDecimalString(at(net, length - 1)),
      ...(sb === undefined
        ? {}
        : {
            starting: {
              receivables: strings(startingReceivables),
              payables: strings(startingPayables),
              deposits: toDecimalString(startingDeposits),
              opening: {
                materials: toDecimalString(openingMaterials),
                workInProgress: toDecimalString(openingWorkInProgress),
                finishedProducts: toDecimalString(openingFinished),
                receivables: toDecimalString(openingReceivables),
                cashInHand: toDecimalString(startingCashInHand),
                shortTermDeposits: toDecimalString(startingDeposits),
                currentAssets: toDecimalString(openingAssets),
                currentLiabilities: toDecimalString(openingPayables),
                netWorkingCapital: toDecimalString(openingNet),
              },
            },
          }),
    },
    depositInterest: strings(
      earning.map((v, j) =>
        production[j] === true
          ? v
              .times(depositRate)
              .times(periods[j]?.months ?? 12)
              .div(12)
          : ZERO,
      ),
    ),
  };
  return { value, modelVersion: MODEL_VERSION, warnings, defaultsUsed: [] };
}
