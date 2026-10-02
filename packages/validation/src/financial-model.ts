import { z } from 'zod';
import { MESSAGES, isoDaySchema, optionalText, paginationQuerySchema, text } from './common';
import { toLatinDigits, toPersianDigits } from './normalize';

/**
 * Per-project assumptions of a financial model (ST-34.01, ADR-0009 §3). Every economic value is
 * entered by the user for the project — there are no platform defaults — and carries a unit, a
 * free-text source and as-of date. A draft may be saved incomplete; `checkAssumptionsForCalculation`
 * lists what a calculation still needs, field by field.
 */

export const FINANCIAL_MODEL_MESSAGES = {
  invalidDecimal: 'عدد معتبر وارد کنید (مثلاً ۰٫۱۸ یا ۱۲۵۰۰۰۰).',
  invalidCurrency: 'کد ارز سه حرف لاتین است (مثل IRR یا USD).',
  invalidKey: 'کلید فرض معتبر نیست.',
  duplicateKey: 'این فرض بیش از یک بار وارد شده است.',
  duplicateCurrency: 'این ارز تکراری است.',
  foreignIsLocal: 'ارز خارجی نباید با ارز محلی یکی باشد.',
  reportingCurrency: 'ارز گزارش باید ارز محلی یا یکی از ارزهای خارجی طرح باشد.',
  valueOrPath: 'برای هر فرض یا یک مقدار ثابت وارد کنید یا مسیر دوره‌ای؛ هر دو با هم مجاز نیست.',
  pathLength: (periods: number) =>
    `مسیر دوره‌ای باید برای هر دوره افق طرح یک مقدار داشته باشد (${toPersianDigits(periods)} مقدار).`,
  horizonTooLong: 'افق طرح حداکثر ۶۰۰ ماه (۵۰ سال) است.',
  required: (label: string) => `«${label}» برای محاسبه لازم است.`,
  templateValueRequired: 'هر فرض الگو باید مقدار ثابت یا مسیر دوره‌ای داشته باشد.',
  wholeNumber: 'عدد صحیح وارد کنید.',
  tooFew: (min: number) => `حداقل ${toPersianDigits(min)} مورد لازم است.`,
  tooMany: (max: number) => `حداکثر ${toPersianDigits(max)} مورد مجاز است.`,
  tooSmall: (min: number) => `مقدار باید حداقل ${toPersianDigits(min)} باشد.`,
  tooLarge: (max: number) => `مقدار باید حداکثر ${toPersianDigits(max)} باشد.`,
  chooseYesNo: 'یکی از گزینه‌ها را انتخاب کنید.',
} as const;

const M = FINANCIAL_MODEL_MESSAGES;

/**
 * Decimal number as a string. Persian digits and the Persian decimal point «٫» are accepted; a
 * comma or «٬» only as a thousands separator between groups of three digits after a first group
 * that does not start with 0 (so «0,18» and «0,125» are refused instead of silently becoming 18 or
 * 125). Spaces are not separators. Nothing else is removed or guessed.
 */
export const decimalStringSchema = z
  .string({ error: M.invalidDecimal })
  .transform((v) => toLatinDigits(v).trim().replace(/٫/g, '.'))
  .pipe(
    z
      .string()
      .max(40, { error: M.invalidDecimal })
      .regex(/^[+-]?([1-9]\d{0,2}([,٬]\d{3})+(\.\d+)?|\d+(\.\d*)?|\.\d+)$/, {
        error: M.invalidDecimal,
      }),
  )
  .transform((v) => v.replace(/[,٬]/g, ''));

export const currencyCodeSchema = z
  .string({ error: MESSAGES.required })
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{3}$/, { error: FINANCIAL_MODEL_MESSAGES.invalidCurrency }));

/** Period lengths COMFAR supports: month, quarter, half-year, year. */
export const PERIOD_MONTHS = [1, 3, 6, 12] as const;
export type PeriodMonths = (typeof PERIOD_MONTHS)[number];

export const PERIOD_LABELS_FA: Record<PeriodMonths, string> = {
  1: 'ماهانه',
  3: 'فصلی',
  6: 'شش‌ماهه',
  12: 'سالانه',
};

const periodMonthsSchema = z.union(
  PERIOD_MONTHS.map((m) => z.literal(m)),
  { error: 'طول دوره باید ماهانه، فصلی، شش‌ماهه یا سالانه باشد.' },
);

/** Display unit of the reporting currency, e.g. "million rials". */
export const REPORTING_UNITS = ['1', '1000', '1000000', '1000000000'] as const;
export type ReportingUnit = (typeof REPORTING_UNITS)[number];

export const REPORTING_UNIT_LABELS_FA: Record<ReportingUnit, string> = {
  '1': 'واحد',
  '1000': 'هزار',
  '1000000': 'میلیون',
  '1000000000': 'میلیارد',
};

const MAX_HORIZON_MONTHS = 600;

export const horizonSchema = z
  .object(
    {
      /** First day of construction (Gregorian date from the date input). */
      startDate: isoDaySchema,
      construction: z.object(
        {
          periods: z
            .int({ error: M.wholeNumber })
            .min(0, { error: M.tooSmall(0) })
            .max(600, { error: M.tooLarge(600) }),
          periodMonths: periodMonthsSchema,
        },
        { error: MESSAGES.required },
      ),
      production: z.object(
        {
          periods: z
            .int({ error: M.wholeNumber })
            .min(1, { error: 'دوره بهره‌برداری حداقل یک دوره است.' })
            .max(600, { error: M.tooLarge(600) }),
          periodMonths: periodMonthsSchema,
        },
        { error: MESSAGES.required },
      ),
    },
    { error: MESSAGES.required },
  )
  .refine(
    (h) =>
      h.construction.periods * h.construction.periodMonths +
        h.production.periods * h.production.periodMonths <=
      MAX_HORIZON_MONTHS,
    { error: FINANCIAL_MODEL_MESSAGES.horizonTooLong, path: ['production', 'periods'] },
  );
export type Horizon = z.infer<typeof horizonSchema>;

/** Number of project periods (construction + production); per-period paths have this length. */
export function horizonPeriods(horizon: Horizon): number {
  return horizon.construction.periods + horizon.production.periods;
}

export const currenciesSchema = z
  .object(
    {
      /** Calculation currency, e.g. IRR. */
      local: currencyCodeSchema,
      foreign: z
        .array(currencyCodeSchema, { error: MESSAGES.required })
        .max(10, { error: M.tooMany(10) }),
      reporting: z.object(
        {
          currency: currencyCodeSchema,
          unit: z.enum(REPORTING_UNITS, { error: 'واحد نمایش را انتخاب کنید.' }),
        },
        { error: MESSAGES.required },
      ),
    },
    { error: MESSAGES.required },
  )
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    c.foreign.forEach((code, i) => {
      if (code === c.local) {
        ctx.addIssue({
          code: 'custom',
          message: FINANCIAL_MODEL_MESSAGES.foreignIsLocal,
          path: ['foreign', i],
        });
      } else if (seen.has(code)) {
        ctx.addIssue({
          code: 'custom',
          message: FINANCIAL_MODEL_MESSAGES.duplicateCurrency,
          path: ['foreign', i],
        });
      }
      seen.add(code);
    });
    if (c.reporting.currency !== c.local && !c.foreign.includes(c.reporting.currency)) {
      ctx.addIssue({
        code: 'custom',
        message: FINANCIAL_MODEL_MESSAGES.reportingCurrency,
        path: ['reporting', 'currency'],
      });
    }
  });
export type Currencies = z.infer<typeof currenciesSchema>;

/** e.g. `discountRate`, `inflation.IRR`, `exchangeRate.USD`, `custom.landPrice`. */
const assumptionKeySchema = z
  .string({ error: MESSAGES.required })
  .trim()
  .max(80, { error: M.invalidKey })
  .regex(/^[a-z][a-zA-Z0-9]*(\.[A-Za-z0-9_-]+)*$/, { error: FINANCIAL_MODEL_MESSAGES.invalidKey });

const MAX_PATH = 600;

export const assumptionSchema = z
  .object(
    {
      key: assumptionKeySchema,
      label: text(1, 120),
      /** e.g. «درصد در سال», «ریال برای هر دلار». */
      unit: text(1, 40),
      /** One value for the whole horizon. */
      value: decimalStringSchema.optional(),
      /** One value per project period. */
      path: z
        .array(decimalStringSchema, { error: M.invalidDecimal })
        .min(1, { error: M.tooFew(1) })
        .max(MAX_PATH, { error: M.tooMany(MAX_PATH) })
        .optional(),
      /** Free text, e.g. «بانک مرکزی، گزارش تورم». */
      source: optionalText(300).optional(),
      /** Free text, e.g. «۱۴۰۵/۰۶/۳۱». */
      asOf: optionalText(60).optional(),
    },
    { error: MESSAGES.required },
  )
  .refine((a) => a.value === undefined || a.path === undefined, {
    error: FINANCIAL_MODEL_MESSAGES.valueOrPath,
    path: ['path'],
  });
export type Assumption = z.infer<typeof assumptionSchema>;

function uniqueKeys(assumptions: { key: string }[], ctx: z.RefinementCtx, base: string): void {
  const seen = new Set<string>();
  assumptions.forEach((a, i) => {
    if (seen.has(a.key)) {
      ctx.addIssue({
        code: 'custom',
        message: FINANCIAL_MODEL_MESSAGES.duplicateKey,
        path: [base, i, 'key'],
      });
    }
    seen.add(a.key);
  });
}

const MAX_ASSUMPTIONS = 300;

export const projectAssumptionsSchema = z
  .object(
    {
      horizon: horizonSchema,
      currencies: currenciesSchema,
      /** COMFAR special feature: calculate with inflation (current prices). */
      inflationEnabled: z.boolean({ error: M.chooseYesNo }),
      assumptions: z
        .array(assumptionSchema, { error: MESSAGES.required })
        .max(MAX_ASSUMPTIONS, { error: M.tooMany(MAX_ASSUMPTIONS) }),
    },
    { error: MESSAGES.required },
  )
  .superRefine((input, ctx) => {
    uniqueKeys(input.assumptions, ctx, 'assumptions');
    const periods = horizonPeriods(input.horizon);
    input.assumptions.forEach((a, i) => {
      if (a.path !== undefined && a.path.length !== periods) {
        ctx.addIssue({
          code: 'custom',
          message: FINANCIAL_MODEL_MESSAGES.pathLength(periods),
          path: ['assumptions', i, 'path'],
        });
      }
    });
  });
export type ProjectAssumptions = z.infer<typeof projectAssumptionsSchema>;

/** Assumptions a calculation needs for this project, with their Persian labels. */
export function requiredAssumptions(
  input: Pick<ProjectAssumptions, 'currencies' | 'inflationEnabled'>,
): { key: string; label: string }[] {
  const required = [{ key: 'discountRate', label: 'نرخ تنزیل' }];
  for (const code of input.currencies.foreign) {
    // A value alone is the initial rate (constant, or derived from relative inflation when
    // inflation is on — COMFAR rule); a path is the user's own exchange-rate path.
    required.push({ key: `exchangeRate.${code}`, label: `نرخ ارز ${code}` });
  }
  if (input.inflationEnabled) {
    for (const code of [input.currencies.local, ...input.currencies.foreign]) {
      required.push({ key: `inflation.${code}`, label: `نرخ تورم ${code}` });
    }
  }
  return required;
}

export interface AssumptionIssue {
  /** The missing assumption; the editor shows the message at the field for this key. */
  key: string;
  /**
   * Path in the project input: the empty value of an existing entry, or `['assumptions']` when
   * the entry does not exist yet (the editor then places the message by `key`).
   */
  path: (string | number)[];
  code: 'assumption.required';
  message: string;
}

/**
 * What blocks a calculation: every required assumption must be present with a value or a path.
 * Nothing is filled in; the user sees one message per missing field.
 */
export function checkAssumptionsForCalculation(input: ProjectAssumptions): AssumptionIssue[] {
  const byKey = new Map(input.assumptions.map((a, i) => [a.key, { a, i }]));
  const issues: AssumptionIssue[] = [];
  for (const { key, label } of requiredAssumptions(input)) {
    const entry = byKey.get(key);
    if (entry !== undefined && (entry.a.value !== undefined || entry.a.path !== undefined)) {
      continue;
    }
    issues.push({
      key,
      path: entry === undefined ? ['assumptions'] : ['assumptions', entry.i, 'value'],
      code: 'assumption.required',
      message: FINANCIAL_MODEL_MESSAGES.required(label),
    });
  }
  return issues;
}

/**
 * Copies a template's assumptions into a project: entries with the same key are replaced, the
 * others added; project assumptions the template does not mention stay as they are. Only ever run
 * on the user's explicit request — templates are never applied automatically.
 */
export function applyAssumptionTemplate(
  project: Assumption[],
  template: Assumption[],
): { assumptions: Assumption[]; replaced: string[]; added: string[] } {
  const fromTemplate = new Map(template.map((a) => [a.key, a]));
  const replaced: string[] = [];
  const assumptions = project.map((a) => {
    const replacement = fromTemplate.get(a.key);
    if (replacement === undefined) return a;
    replaced.push(a.key);
    fromTemplate.delete(a.key);
    return copyAssumption(replacement);
  });
  const added = [...fromTemplate.keys()];
  for (const a of fromTemplate.values()) assumptions.push(copyAssumption(a));
  return { assumptions, replaced, added };
}

function copyAssumption(a: Assumption): Assumption {
  return a.path === undefined ? { ...a } : { ...a, path: [...a.path] };
}

// ---------------------------------------------------------------------------------------------
// Personal assumption templates

export const assumptionTemplateSchema = z
  .object(
    {
      name: text(1, 120),
      description: optionalText(500).optional(),
      assumptions: z
        .array(assumptionSchema, { error: MESSAGES.required })
        .min(1, { error: 'الگو باید حداقل یک فرض داشته باشد.' })
        .max(MAX_ASSUMPTIONS, { error: M.tooMany(MAX_ASSUMPTIONS) }),
    },
    { error: MESSAGES.required },
  )
  .superRefine((t, ctx) => {
    uniqueKeys(t.assumptions, ctx, 'assumptions');
    // A template exists to carry values: an empty entry would blank a filled one when copied.
    t.assumptions.forEach((a, i) => {
      if (a.value === undefined && a.path === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: M.templateValueRequired,
          path: ['assumptions', i, 'value'],
        });
      }
    });
  });
export type AssumptionTemplateInput = z.infer<typeof assumptionTemplateSchema>;

export const listAssumptionTemplatesQuerySchema = paginationQuerySchema;
export type ListAssumptionTemplatesQuery = z.infer<typeof listAssumptionTemplatesQuerySchema>;

/** Templates one user may keep. */
export const MAX_ASSUMPTION_TEMPLATES = 50;
