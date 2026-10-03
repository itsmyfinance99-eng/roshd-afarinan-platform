import { z } from 'zod';
import { MESSAGES, paginationQuerySchema, text } from './common';
import {
  FINANCIAL_MODEL_MESSAGES,
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
 * Upper bound of the size of a calculation: project periods × input lines (investment items,
 * equity, loans, sales lines, cost items). The engine runs inside the request and its results are
 * stored whole; 10 000 keeps a run around a second and its results around a megabyte.
 */
export const MAX_CALCULATION_SIZE = 10_000;
/** Largest stored result of one run, in characters of JSON. */
export const MAX_RESULTS_CHARS = 4_000_000;
/** Calculations one user may start per minute. */
export const CALCULATIONS_PER_MINUTE = 10;

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
});

/** Complete input of a calculation: the engine's `ProjectInput`, bounded in size. */
export const projectInputSchema = projectInputFieldsSchema.superRefine((input, ctx) => {
  const lines =
    input.investment.items.length +
    input.financing.equity.length +
    input.financing.loans.length +
    input.operations.costs.length +
    input.operations.products.reduce((sum, product) => sum + product.sales.length, 0);
  // The horizon was checked above, so its periods can be counted.
  const size = horizonPeriods(input.horizon) * lines;
  if (size > MAX_CALCULATION_SIZE) {
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
