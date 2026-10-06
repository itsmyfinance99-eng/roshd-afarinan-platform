import { z } from 'zod';
import { MESSAGES, optionalText, paginationQuerySchema, text } from './common';
import {
  FINANCIAL_MODEL_MESSAGES,
  REPORTING_UNITS,
  currencyCodeSchema,
  decimalStringSchema,
  horizonPeriods,
  horizonSchema,
} from './financial-model';

/**
 * Stored financial model and its calculation input (ST-34.06, ADR-0009 §6).
 *
 * A model is saved as a draft: its inputs may be incomplete. A calculation needs the complete
 * input of the engine's `projectModel` (comfar-model-spec §3–§4), checked here for shape and size;
 * the engine then checks the economics and reports its own field-level messages. Nothing has a
 * default. The value lists mirror the engine's constants (a test keeps them equal); they are
 * repeated here so that the web bundle does not pull in the whole engine.
 */

export const FINANCIAL_MODEL_INPUT_VERSION = 1;
export const MAX_FINANCIAL_MODELS = 50;
export const MAX_CALCULATION_RUNS = 50;
/**
 * Upper bound of the size of a calculation (see `calculationSize`). It refuses clearly oversized
 * models before any work is done; the API also stops a calculation that runs too long.
 */
export const MAX_CALCULATION_SIZE = 20_000;
/** Largest stored result of one run, in characters of JSON. */
export const MAX_RESULTS_CHARS = 4_000_000;
/** Calculation requests one user may make per minute (valid or not). */
export const CALCULATIONS_PER_MINUTE = 10;
/** Validation messages returned for one calculation request; the rest is summarised. */
export const MAX_REPORTED_ISSUES = 50;
/** File formats a calculation run can be downloaded in (ST-34.09). */
export const CALCULATION_EXPORT_FORMATS = ['xlsx', 'pdf', 'html'] as const;
export type CalculationExportFormat = (typeof CALCULATION_EXPORT_FORMATS)[number];
export const CALCULATION_EXPORT_CONTENT_TYPES: Record<CalculationExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
};
/** Files of calculation runs one user may ask for per minute. */
export const EXPORTS_PER_MINUTE = 10;

const M = FINANCIAL_MODEL_MESSAGES;
const M_TOO_LARGE =
  'این مدل برای محاسبه بیش از حد بزرگ است؛ تعداد دوره‌ها (مثلاً دوره‌های ماهانه ساخت) یا تعداد اقلام را کمتر کنید.';
const M_DRAFT = 'ساختار ورودی‌های مدل معتبر نیست.';
const MAX_PERIODS = 600;
const MAX_ITEMS = 300;

export const INVESTMENT_GROUP_VALUES = [
  'LAND',
  'SITE_PREPARATION',
  'BUILDINGS',
  'MACHINERY',
  'AUXILIARY_EQUIPMENT',
  'INCORPORATED_ASSETS',
  'CONTINGENCY',
  'OTHER_FIXED',
  'PRE_PRODUCTION',
] as const;
export const EQUITY_CLASS_VALUES = ['ORDINARY', 'PREFERENCE', 'JOINT_VENTURE', 'SUBSIDY'] as const;
export const COST_CATEGORY_VALUES = [
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
export const COST_CENTRE_GROUP_VALUES = [
  'PRODUCTION',
  'STORAGE',
  'ENVIRONMENT',
  'MARKETING',
  'SERVICES',
  'ADMINISTRATION',
] as const;
export const ALLOCATION_KEY_VALUES = [
  'DIRECT_COST',
  'DIRECT_FACTORY_COST',
  'DIRECT_MATERIAL',
  'DIRECT_LABOUR',
  'SALES',
  'EQUAL',
] as const;
export const DEPRECIATION_METHOD_VALUES = [
  'LINEAR_TO_ZERO',
  'LINEAR_TO_SCRAP',
  'DECLINING_BALANCE',
  'SUM_OF_YEARS_DIGITS',
] as const;

const choice = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { error: M.chooseYesNo });
const decimal = decimalStringSchema;
const key = z
  .string({ error: MESSAGES.required })
  .trim()
  .min(1, { error: MESSAGES.required })
  .max(80, { error: MESSAGES.tooLong(80) });
const whole = (min: number, max: number) =>
  z
    .int({ error: M.wholeNumber })
    .min(min, { error: M.tooSmall(min) })
    .max(max, { error: M.tooLarge(max) });
const list = <T extends z.ZodType>(item: T, max = MAX_ITEMS) =>
  z.array(item, { error: MESSAGES.required }).max(max, { error: M.tooMany(max) });
const series = list(decimal, MAX_PERIODS);
/** One value for every period (or year), or one value per period. */
const perPeriod = z.union([decimal, series], { error: M.invalidDecimal });
const origin = choice(['LOCAL', 'FOREIGN']);
const periodIndex = whole(0, MAX_PERIODS - 1);

const priced = {
  currency: currencyCodeSchema,
  escalation: perPeriod.optional(),
  firstYearEscalator: whole(0, 100).optional(),
};

const depreciationSchema = z.object({
  method: choice(DEPRECIATION_METHOD_VALUES),
  lifeMonths: whole(1, 1200),
  salvageRate: decimal,
  decliningRate: decimal.optional(),
  startPeriod: periodIndex,
});

const coverageSchema = z.union(
  [z.object({ days: decimal }).strict(), z.object({ shareOfYear: decimal }).strict()],
  { error: MESSAGES.required },
);

const investmentItemSchema = z.object({
  key,
  group: choice(INVESTMENT_GROUP_VALUES),
  origin,
  amounts: series,
  depreciation: depreciationSchema.optional(),
  ...priced,
});

const equitySchema = z.object({
  key,
  class: choice(EQUITY_CLASS_VALUES),
  currency: currencyCodeSchema,
  origin,
  amounts: series,
  /** Equity paid out again (ST-34.12); none when absent. */
  refunds: series.optional(),
});

const dayIndex = whole(1, 36000);
const loanSchema = z.object({
  key,
  currency: currencyCodeSchema,
  origin,
  loan: z.object({
    type: choice(['ANNUITY', 'CONSTANT_PRINCIPAL', 'PROFILE']),
    repaymentMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)], {
      error: M.chooseYesNo,
    }),
    flows: list(z.object({ day: dayIndex, amount: decimal }), MAX_PERIODS),
    rates: list(z.object({ fromDay: dayIndex, rate: decimal }), MAX_PERIODS),
    capitalisedShare: decimal,
    capitaliseUntilDay: dayIndex.optional(),
    numberOfRepayments: whole(1, 1200).optional(),
    firstRepaymentDay: dayIndex.optional(),
    interestDueDay: dayIndex.optional(),
    fees: z
      .object({
        agency: decimal.optional(),
        guarantee: decimal.optional(),
        commitment: decimal.optional(),
        other: decimal.optional(),
      })
      .optional(),
  }),
  depreciation: depreciationSchema.omit({ salvageRate: true }).optional(),
});

const salesLineSchema = z.object({
  key,
  market: choice(['LOCAL', 'EXPORT']),
  quantities: series.optional(),
  capacityShares: series.optional(),
  price: perPeriod,
  salesTaxRate: perPeriod,
  subsidyRate: perPeriod,
  subsidyAmount: perPeriod,
  receivablesCoverage: coverageSchema,
  ...priced,
});

const productSchema = z.object({
  key,
  nominalCapacity: decimal.optional(),
  production: z.object({ firstPeriod: periodIndex, lastPeriod: periodIndex }).optional(),
  sales: list(salesLineSchema, 20),
  finishedGoodsCoverage: coverageSchema,
  workInProgressCoverage: coverageSchema,
});

const standardCostSchema = z.discriminatedUnion(
  'mode',
  [
    z.object({
      mode: z.literal('AT_NOMINAL_CAPACITY'),
      quantity: decimal,
      price: decimal,
      variableShare: decimal,
    }),
    z.object({
      mode: z.literal('PER_UNIT'),
      quantity: decimal,
      price: decimal,
      fixedCost: decimal,
    }),
  ],
  { error: M.chooseYesNo },
);

const allocationSchema = z.discriminatedUnion(
  'key',
  [
    z.object({ key: z.enum(ALLOCATION_KEY_VALUES) }),
    z.object({ key: z.literal('SHARES'), shares: z.record(key, decimal) }),
  ],
  { error: M.chooseYesNo },
);

const costItemSchema = z.object({
  key,
  category: choice(COST_CATEGORY_VALUES),
  product: key.optional(),
  origin,
  standard: standardCostSchema.optional(),
  adjustments: z.object({ quantities: series, prices: series, variableShares: series }).optional(),
  costCentre: key.optional(),
  allocation: allocationSchema.optional(),
  stockCoverage: coverageSchema.optional(),
  payablesCoverage: coverageSchema,
  ...priced,
});

const statementsSchema = z.object({
  tax: z.object({
    brackets: list(z.object({ lowerLimit: decimal, rate: perPeriod }), 20),
    holidayYears: whole(0, 50),
    lossCarryForwardYears: whole(0, 50),
  }),
  allowances: z.object({ investment: series, depreciation: series }).optional(),
  assetSales: list(z.object({ item: key, period: periodIndex, proceeds: decimal })).optional(),
  profitDistribution: z.object({
    retainedShare: perPeriod,
    shareholders: list(
      z.object({
        equity: key,
        preferredRate: perPeriod,
        preferredAmount: perPeriod,
        ordinaryShare: perPeriod,
        repatriatedShare: decimal,
        /** Share of the net worth at the end of the project (ST-34.12). */
        netWorthShare: decimal.optional(),
      }),
      50,
    ),
  }),
  discounting: z.object({
    totalCapitalRate: perPeriod,
    equityRate: perPeriod,
    reference: choice(['START_OF_FIRST_PERIOD', 'END_OF_FIRST_YEAR']).optional(),
    reinvestmentRate: decimal.optional(),
    borrowingRate: decimal.optional(),
  }),
  referenceYear: whole(0, 49),
  breakEvenYear: whole(0, 49).optional(),
  residualValueTiming: choice(['YEAR_AFTER_PRODUCTION', 'END_OF_PRODUCTION']).optional(),
  automaticCashCoverage: z.boolean({ error: M.chooseYesNo }).optional(),
});

/**
 * Starting balances of an existing enterprise (ST-34.11; the engine's `StartingBalances`): present
 * for an expansion or rehabilitation project. Every amount is entered; "0" and an empty list are
 * explicit.
 */
const settlementDays = whole(0, 36000);
const startingBalancesSchema = z.object({
  fixedAssets: list(z.object({ item: key, value: decimal })),
  materials: list(z.object({ cost: key, value: decimal })),
  workInProgress: list(z.object({ product: key, value: decimal }), 50),
  finishedProducts: list(z.object({ product: key, quantity: decimal, price: decimal }), 50),
  receivables: z.object({ value: decimal, collectionDays: settlementDays }),
  payables: z.object({ value: decimal, paymentDays: settlementDays }),
  cashInHand: decimal,
  shortTermDeposits: decimal,
  cashSurplus: decimal,
  loans: list(z.object({ loan: key, balance: decimal }), 50),
  equity: list(z.object({ equity: key, value: decimal }), 50),
});

/** What a cost item is in the value-added schedule, and the skill of labour (ST-37.01). */
export const INPUT_NATURE_VALUES = ['MATERIALS', 'WAGES', 'OTHER'] as const;
export const LABOUR_SKILL_VALUES = ['SKILLED', 'UNSKILLED'] as const;
/** How a local item would be traded without the project (ST-37.02). */
export const TRADE_CATEGORY_VALUES = ['IMPORTABLE', 'EXPORTABLE'] as const;

/**
 * Economic analysis (ST-37.01; the engine's `EconomicInput`): present when the user asks for it.
 * The rate of discount and the taxes on dividends are entered ("0" is explicit); an item without
 * an adjustment keeps its financial value.
 */
const economicAdjustment = {
  item: key,
  taxesIncluded: decimal.optional(),
  valueAddedIncluded: list(decimal, 3).optional(),
};
const tradable = {
  trade: choice(TRADE_CATEGORY_VALUES),
  share: decimal,
  borderPriceFactor: decimal,
};
const indirectForeignExchangeItem = z.object({
  key,
  currency: currencyCodeSchema,
  amounts: series,
});
/** Indirect effects on the balance of payments (ST-37.02); every list is entered, empty or not. */
const indirectForeignExchangeSchema = z.object({
  outputs: list(z.object({ product: key, line: key, ...tradable })),
  inputs: list(z.object({ item: key, ...tradable })),
  otherInflows: list(indirectForeignExchangeItem, 50),
  otherOutflows: list(indirectForeignExchangeItem, 50),
});
const employmentGroup = z.object({ workers: decimal, wageBill: decimal });
const indirectEmployment = z.object({
  unskilled: employmentGroup,
  skilled: employmentGroup,
  investment: decimal,
});
/** Jobs of the reference year (ST-37.03); "0" is explicit. */
const employmentSchema = z.object({
  direct: z.object({ unskilled: decimal, skilled: decimal }),
  indirect: z.object({ inputSupplying: indirectEmployment, outputUsing: indirectEmployment }),
});
const economicSchema = z.object({
  discountRate: perPeriod,
  costs: list(
    z.object({
      ...economicAdjustment,
      nature: choice(INPUT_NATURE_VALUES).optional(),
      skill: choice(LABOUR_SKILL_VALUES).optional(),
    }),
  ),
  investment: list(z.object(economicAdjustment)),
  dividendTax: z.object({ local: decimal, foreign: decimal }),
  indirectForeignExchange: indirectForeignExchangeSchema.optional(),
  employment: employmentSchema.optional(),
});

/** Inputs that may carry a note: their path in the input, e.g. `exchangeRates.USD`. */
export const MAX_INPUT_NOTES = 300;

/**
 * Where an assumption comes from and the date it was valid on (ST-34.01): free text the user
 * enters next to an input. It is stored with the run but never used in the calculation.
 */
const notesSchema = z
  .record(
    z.string().min(1).max(120),
    z.object({ source: optionalText(300).optional(), asOf: optionalText(60).optional() }),
    { error: MESSAGES.required },
  )
  .refine((notes) => Object.keys(notes).length <= MAX_INPUT_NOTES, {
    error: M.tooMany(MAX_INPUT_NOTES),
  });

const projectInputFieldsSchema = z.object({
  horizon: horizonSchema,
  localCurrency: currencyCodeSchema,
  exchangeRates: z.record(currencyCodeSchema, series),
  inflation: z.record(currencyCodeSchema, series).optional(),
  investment: z.object({ items: list(investmentItemSchema) }),
  financing: z.object({ equity: list(equitySchema, 50), loans: list(loanSchema, 50) }),
  operations: z.object({
    products: list(productSchema, 50),
    costs: list(costItemSchema),
    costCentres: list(
      z.object({
        key,
        group: choice(COST_CENTRE_GROUP_VALUES),
        products: list(key, 50).optional(),
      }),
      50,
    ).optional(),
    cash: z.object({
      localCoverage: coverageSchema,
      foreignCoverage: coverageSchema,
      depositShare: decimal,
      depositRate: decimal,
    }),
  }),
  statements: statementsSchema,
  startingBalances: startingBalancesSchema.optional(),
  economic: economicSchema.optional(),
  notes: notesSchema.optional(),
});

/**
 * Rough size of a calculation: project periods × everything computed per period — input lines
 * (investment items, equity, loans, sales lines, cost items), products, cost centres and a fixed
 * part for the statements, and the lines of the economic schedules when they are asked for — plus
 * the allocation of every indirect cost to every product.
 */
export function calculationSize(input: z.infer<typeof projectInputFieldsSchema>): number {
  const { products, costs, costCentres } = input.operations;
  const lines =
    input.investment.items.length +
    input.financing.equity.length +
    input.financing.loans.length +
    costs.length +
    products.reduce((sum, product) => sum + product.sales.length, 0);
  const indirect = costs.filter((cost) => cost.product === undefined).length;
  const tradables = input.economic?.indirectForeignExchange;
  const economic =
    input.economic === undefined
      ? 0
      : 70 +
        (tradables === undefined
          ? 0
          : tradables.outputs.length +
            tradables.inputs.length +
            tradables.otherInflows.length +
            tradables.otherOutflows.length);
  const perPeriod =
    lines +
    products.length +
    (costCentres?.length ?? 0) +
    20 +
    economic +
    (indirect * products.length) / 10;
  return Math.ceil(horizonPeriods(input.horizon) * perPeriod);
}

/** Complete input of a calculation: the engine's `ProjectInput`, bounded in size. */
export const projectInputSchema = projectInputFieldsSchema.superRefine((input, ctx) => {
  // The periods can only be counted on a horizon that passed its own checks (reported above).
  if (!horizonSchema.safeParse(input.horizon).success) return;
  if (calculationSize(input) > MAX_CALCULATION_SIZE) {
    ctx.addIssue({ code: 'custom', message: M_TOO_LARGE, path: ['horizon'] });
  }
});
export type ProjectInputData = z.infer<typeof projectInputSchema>;

/**
 * A draft: any JSON object. Its size is bounded by the API's body limit; its content is checked
 * with `projectInputSchema` when a calculation is requested.
 */
const MAX_DRAFT_DEPTH = 12;
const MAX_DRAFT_NODES = 200_000;

/** JSON the database can store: no NUL characters, bounded depth and number of values. */
function storable(value: unknown): boolean {
  let nodes = 0;
  const walk = (node: unknown, depth: number): boolean => {
    nodes += 1;
    if (nodes > MAX_DRAFT_NODES || depth > MAX_DRAFT_DEPTH) return false;
    if (typeof node === 'string') return !node.includes('\u0000');
    if (Array.isArray(node)) return node.every((item) => walk(item, depth + 1));
    if (node !== null && typeof node === 'object') {
      return Object.entries(node).every(
        ([name, item]) => !name.includes('\u0000') && walk(item, depth + 1),
      );
    }
    return true;
  };
  return walk(value, 0);
}

const draftInputsSchema = z
  .record(z.string(), z.unknown(), { error: MESSAGES.required })
  .refine(storable, { error: M_DRAFT });

export const createFinancialModelSchema = z.object({
  title: text(3, 150),
  inputs: draftInputsSchema.default({}),
});
export type CreateFinancialModelInput = z.infer<typeof createFinancialModelSchema>;

export const updateFinancialModelSchema = z.object({
  title: text(3, 150),
  inputs: draftInputsSchema,
  /** Version the editor loaded; a save on top of a newer version is refused (409). */
  version: z.int({ error: M.wholeNumber }).min(1).max(2_147_483_647),
});
export type UpdateFinancialModelInput = z.infer<typeof updateFinancialModelSchema>;

export const FINANCIAL_MODEL_SCOPES = ['mine', 'assigned', 'all'] as const;
export type FinancialModelScope = (typeof FINANCIAL_MODEL_SCOPES)[number];

export const listFinancialModelsQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(FINANCIAL_MODEL_SCOPES).default('mine'),
});
export type ListFinancialModelsQuery = z.infer<typeof listFinancialModelsQuerySchema>;

export const listCalculationRunsQuerySchema = paginationQuerySchema;
export type ListCalculationRunsQuery = z.infer<typeof listCalculationRunsQuerySchema>;

/** Download of a run: the file format and the display unit of the amounts in local currency. */
export const exportCalculationRunQuerySchema = z.object({
  format: z.enum(CALCULATION_EXPORT_FORMATS, { error: 'قالب خروجی را انتخاب کنید.' }),
  unit: z.enum(REPORTING_UNITS, { error: 'واحد نمایش را انتخاب کنید.' }).default('1'),
});
export type ExportCalculationRunQuery = z.infer<typeof exportCalculationRunQuerySchema>;
