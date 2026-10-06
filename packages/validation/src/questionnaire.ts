import { z } from 'zod';
import { MESSAGES, optionalText, text } from './common';
import { decimalStringSchema } from './financial-model';
import { normalizePersianText, toPersianDigits } from './normalize';

/**
 * Questionnaires of the feasibility platform (ST-35.03, ADR-0010 §4). A template is data: its
 * definition lists sections, questions of a few types and the documents an applicant must hand
 * in. The same definition validates an answer in the API and in the form of the web app.
 */

export const QUESTION_TYPES = [
  'text',
  'long_text',
  'number',
  'single_choice',
  'multiple_choice',
  'date',
  'table',
  'file',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS_FA: Record<QuestionType, string> = {
  text: 'متن کوتاه',
  long_text: 'متن بلند',
  number: 'عدد',
  single_choice: 'تک‌انتخابی',
  multiple_choice: 'چندانتخابی',
  date: 'تاریخ',
  table: 'جدول',
  file: 'فایل',
};

/** Types a column of a table question may have. */
export const TABLE_COLUMN_TYPES = ['text', 'number', 'date', 'single_choice'] as const;
export type TableColumnType = (typeof TABLE_COLUMN_TYPES)[number];

export const QUESTIONNAIRE_LIMITS = {
  sections: 40,
  questionsPerSection: 80,
  questions: 400,
  options: 60,
  units: 20,
  columns: 12,
  rows: 200,
  files: 10,
  documents: 100,
  text: 500,
  longText: 10_000,
  selections: 60,
} as const;

export const QUESTIONNAIRE_MESSAGES = {
  key: 'کلید فقط حروف کوچک انگلیسی، عدد و زیرخط دارد و با حرف شروع می‌شود.',
  duplicateKey: 'این کلید پیش‌تر در همین قالب به کار رفته است.',
  duplicateOption: 'این گزینه تکراری است.',
  range: 'کمینه نباید از بیشینه بزرگ‌تر باشد.',
  required: MESSAGES.required,
  invalidNumber: 'عدد معتبر وارد کنید.',
  integer: 'عدد صحیح وارد کنید.',
  min: (min: string) => `مقدار نباید کمتر از ${toPersianDigits(min)} باشد.`,
  max: (max: string) => `مقدار نباید بیشتر از ${toPersianDigits(max)} باشد.`,
  unit: 'واحد را از فهرست انتخاب کنید.',
  option: 'گزینه را از فهرست انتخاب کنید.',
  minSelected: (n: number) => `دست‌کم ${toPersianDigits(n)} گزینه را انتخاب کنید.`,
  maxSelected: (n: number) => `حداکثر ${toPersianDigits(n)} گزینه را می‌توان انتخاب کرد.`,
  date: 'تاریخ معتبر وارد کنید.',
  minDate: 'تاریخ زودتر از بازه مجاز است.',
  maxDate: 'تاریخ دیرتر از بازه مجاز است.',
  rows: 'سطرهای جدول معتبر نیست.',
  minRows: (n: number) => `دست‌کم ${toPersianDigits(n)} سطر وارد کنید.`,
  maxRows: (n: number) => `حداکثر ${toPersianDigits(n)} سطر مجاز است.`,
  files: 'فایل‌های انتخاب‌شده معتبر نیست.',
  maxFiles: (n: number) => `حداکثر ${toPersianDigits(n)} فایل مجاز است.`,
  unknownQuestion: 'این سؤال در پرسشنامه نیست.',
  text: 'متن معتبر وارد کنید.',
} as const;

const M = QUESTIONNAIRE_MESSAGES;
const L = QUESTIONNAIRE_LIMITS;

/** Stable identifier of a section, question, option, column or document inside a definition. */
export const questionnaireKeySchema = z
  .string({ error: M.required })
  .regex(/^[a-z][a-z0-9_]{0,59}$/, { error: M.key });

const isoDateSchema = z
  .string({ error: M.date })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: M.date })
  .refine(isIsoDate, { error: M.date });

const optionSchema = z.object({ value: questionnaireKeySchema, label: text(1, 200) }).strict();
const optionsSchema = z
  .array(optionSchema, { error: M.required })
  .min(2, { error: 'دست‌کم دو گزینه لازم است.' })
  .max(L.options, { error: `حداکثر ${toPersianDigits(L.options)} گزینه مجاز است.` });

const numberRules = {
  /** One fixed unit shown next to the value, e.g. «تن در سال». */
  unit: text(1, 40).optional(),
  /** Units the answer chooses from; the chosen one is stored with the value. */
  units: z.array(text(1, 40)).min(2).max(L.units).optional(),
  min: decimalStringSchema.optional(),
  max: decimalStringSchema.optional(),
  integer: z.boolean().optional(),
};
const dateRules = { min: isoDateSchema.optional(), max: isoDateSchema.optional() };

const base = {
  key: questionnaireKeySchema,
  label: text(1, 300),
  help: optionalText(1000).optional(),
  required: z.boolean().optional(),
};

const tableColumnSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('text') }).strict(),
  z.object({ ...base, type: z.literal('number'), ...numberRules }).strict(),
  z.object({ ...base, type: z.literal('date'), ...dateRules }).strict(),
  z.object({ ...base, type: z.literal('single_choice'), options: optionsSchema }).strict(),
]);
export type TableColumn = z.infer<typeof tableColumnSchema>;

const count = (max: number) => z.number().int().min(0).max(max);

export const questionSchema = z.discriminatedUnion('type', [
  z
    .object({ ...base, type: z.literal('text'), maxLength: count(L.text).min(1).optional() })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal('long_text'),
      maxLength: count(L.longText).min(1).optional(),
    })
    .strict(),
  z.object({ ...base, type: z.literal('number'), ...numberRules }).strict(),
  z.object({ ...base, type: z.literal('single_choice'), options: optionsSchema }).strict(),
  z
    .object({
      ...base,
      type: z.literal('multiple_choice'),
      options: optionsSchema,
      minSelected: count(L.options).optional(),
      maxSelected: count(L.options).min(1).optional(),
    })
    .strict(),
  z.object({ ...base, type: z.literal('date'), ...dateRules }).strict(),
  z
    .object({
      ...base,
      type: z.literal('table'),
      columns: z.array(tableColumnSchema).min(1).max(L.columns),
      minRows: count(L.rows).optional(),
      maxRows: count(L.rows).min(1).optional(),
    })
    .strict(),
  z
    .object({ ...base, type: z.literal('file'), maxFiles: count(L.files).min(1).optional() })
    .strict(),
]);
export type Question = z.infer<typeof questionSchema>;

export const questionnaireSectionSchema = z
  .object({
    key: questionnaireKeySchema,
    title: text(1, 200),
    description: optionalText(2000).optional(),
    questions: z.array(questionSchema).max(L.questionsPerSection),
  })
  .strict();
export type QuestionnaireSection = z.infer<typeof questionnaireSectionSchema>;

/** A document the applicant hands in with the questionnaire (uploaded in ST-35.06). */
export const requiredDocumentSchema = z
  .object({
    key: questionnaireKeySchema,
    label: text(1, 300),
    help: optionalText(1000).optional(),
    required: z.boolean().optional(),
  })
  .strict();
export type RequiredDocument = z.infer<typeof requiredDocumentSchema>;

type Issue = { path: (string | number)[]; message: string };

/** What a definition must satisfy beyond the shape of its parts. */
function definitionIssues(definition: {
  sections: QuestionnaireSection[];
  documents: RequiredDocument[];
}): Issue[] {
  const issues: Issue[] = [];
  const unique = (keys: string[], path: (i: number) => (string | number)[], message: string) => {
    const seen = new Set<string>();
    keys.forEach((key, i) => {
      if (seen.has(key)) issues.push({ path: path(i), message });
      seen.add(key);
    });
  };
  const rules = (
    rule: { type: string } & Record<string, unknown>,
    path: (string | number)[],
  ): void => {
    const options = rule.options as { value: string }[] | undefined;
    if (options) {
      unique(
        options.map((o) => o.value),
        (i) => [...path, 'options', i, 'value'],
        M.duplicateOption,
      );
    }
    const units = rule.units as string[] | undefined;
    if (units) unique(units, (i) => [...path, 'units', i], M.duplicateOption);
    if (rule.unit !== undefined && units) {
      issues.push({
        path: [...path, 'units'],
        message: 'واحد ثابت و فهرست واحدها با هم نمی‌آیند.',
      });
    }
    const { min, max } = rule as { min?: string; max?: string };
    if (min !== undefined && max !== undefined) {
      const reversed = rule.type === 'date' ? min > max : compareDecimals(min, max) > 0;
      if (reversed) issues.push({ path: [...path, 'max'], message: M.range });
    }
    for (const [low, high] of [
      ['minSelected', 'maxSelected'],
      ['minRows', 'maxRows'],
    ] as const) {
      const a = rule[low] as number | undefined;
      const b = rule[high] as number | undefined;
      if (a !== undefined && b !== undefined && a > b) {
        issues.push({ path: [...path, high], message: M.range });
      }
    }
    if (rule.type === 'multiple_choice' && options) {
      for (const bound of ['minSelected', 'maxSelected'] as const) {
        const n = rule[bound] as number | undefined;
        if (n !== undefined && n > options.length) {
          issues.push({ path: [...path, bound], message: M.range });
        }
      }
    }
  };

  unique(
    definition.sections.map((s) => s.key),
    (i) => ['sections', i, 'key'],
    M.duplicateKey,
  );
  // Answers are stored by the key of their question, so it is unique in the whole template.
  const seen = new Set<string>();
  let total = 0;
  definition.sections.forEach((section, s) => {
    section.questions.forEach((question, q) => {
      const path = ['sections', s, 'questions', q];
      total += 1;
      if (seen.has(question.key)) issues.push({ path: [...path, 'key'], message: M.duplicateKey });
      seen.add(question.key);
      rules(question, path);
      if (question.type === 'table') {
        unique(
          question.columns.map((c) => c.key),
          (i) => [...path, 'columns', i, 'key'],
          M.duplicateKey,
        );
        question.columns.forEach((column, c) => rules(column, [...path, 'columns', c]));
      }
    });
  });
  if (total > L.questions) {
    issues.push({
      path: ['sections'],
      message: `حداکثر ${toPersianDigits(L.questions)} سؤال در یک قالب مجاز است.`,
    });
  }
  unique(
    definition.documents.map((d) => d.key),
    (i) => ['documents', i, 'key'],
    M.duplicateKey,
  );
  return issues;
}

/** The content of one version of a template. */
export const questionnaireDefinitionSchema = z
  .object({
    sections: z.array(questionnaireSectionSchema).max(L.sections),
    documents: z.array(requiredDocumentSchema).max(L.documents).default([]),
  })
  .strict()
  .superRefine((definition, ctx) => {
    for (const issue of definitionIssues(definition)) {
      ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }
  });
export type QuestionnaireDefinition = z.infer<typeof questionnaireDefinitionSchema>;

/** Every question of a definition, in the order of the form. */
export function questionsOf(definition: Pick<QuestionnaireDefinition, 'sections'>): Question[] {
  return definition.sections.flatMap((section) => section.questions);
}

// ───────────────────────────────── Answers ─────────────────────────────────

export interface NumberAnswer {
  value: string;
  /** Present when the question lets the answer choose its unit. */
  unit?: string;
}
export type TableCell = string | NumberAnswer | null;
export type TableRow = Record<string, TableCell>;
/** The stored form of an answer; `null` means "not answered". */
export type AnswerValue = string | string[] | NumberAnswer | TableRow[] | null;

export type AnswerResult =
  { ok: true; value: AnswerValue } | { ok: false; issues: { path: string; message: string }[] };

type Parsed<T> = { ok: true; value: T | null } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const empty = (value: unknown): boolean => value === undefined || value === null || value === '';

function isIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Compares two plain decimal strings exactly (no floating point). */
export function compareDecimals(a: string, b: string): number {
  const parse = (raw: string) => {
    const negative = raw.startsWith('-');
    const [whole = '', fraction = ''] = raw.replace(/^[+-]/, '').split('.');
    const int = whole.replace(/^0+(?=\d)/, '') || '0';
    const frac = fraction.replace(/0+$/, '');
    return { negative: negative && !(int === '0' && frac === ''), int, frac };
  };
  const x = parse(a);
  const y = parse(b);
  if (x.negative !== y.negative) return x.negative ? -1 : 1;
  const sign = x.negative ? -1 : 1;
  if (x.int.length !== y.int.length) return sign * (x.int.length < y.int.length ? -1 : 1);
  if (x.int !== y.int) return sign * (x.int < y.int ? -1 : 1);
  const width = Math.max(x.frac.length, y.frac.length);
  const fx = x.frac.padEnd(width, '0');
  const fy = y.frac.padEnd(width, '0');
  return fx === fy ? 0 : sign * (fx < fy ? -1 : 1);
}

function parseText(value: unknown, max: number): Parsed<string> {
  if (typeof value !== 'string') return fail(M.text);
  const normal = normalizePersianText(value);
  if (normal === '') return { ok: true, value: null };
  if (normal.length > max) return fail(MESSAGES.tooLong(max));
  return { ok: true, value: normal };
}

function parseLongText(value: unknown, max: number): Parsed<string> {
  if (typeof value !== 'string') return fail(M.text);
  // Line breaks are part of a long answer, so only its ends are trimmed.
  const trimmed = value.replace(/\r\n?/g, '\n').trim();
  if (trimmed === '') return { ok: true, value: null };
  if (trimmed.length > max) return fail(MESSAGES.tooLong(max));
  return { ok: true, value: trimmed };
}

type NumberRule = {
  unit?: string;
  units?: string[];
  min?: string;
  max?: string;
  integer?: boolean;
};

function parseNumber(value: unknown, rule: NumberRule): Parsed<NumberAnswer> {
  const raw =
    typeof value === 'string'
      ? { value }
      : value && typeof value === 'object' && !Array.isArray(value)
        ? (value as { value?: unknown; unit?: unknown })
        : undefined;
  if (!raw) return fail(M.invalidNumber);
  if (empty(typeof raw.value === 'string' ? raw.value.trim() : raw.value)) {
    return { ok: true, value: null };
  }
  const parsed = decimalStringSchema.safeParse(raw.value);
  if (!parsed.success) return fail(M.invalidNumber);
  const number = parsed.data;
  if (rule.integer && !/^[+-]?\d+(\.0*)?$/.test(number)) return fail(M.integer);
  if (rule.min !== undefined && compareDecimals(number, rule.min) < 0) return fail(M.min(rule.min));
  if (rule.max !== undefined && compareDecimals(number, rule.max) > 0) return fail(M.max(rule.max));
  if (!rule.units) return { ok: true, value: { value: number } };
  const unit = 'unit' in raw && typeof raw.unit === 'string' ? normalizePersianText(raw.unit) : '';
  if (!rule.units.includes(unit)) return fail(M.unit);
  return { ok: true, value: { value: number, unit } };
}

function parseDate(value: unknown, rule: { min?: string; max?: string }): Parsed<string> {
  if (empty(value)) return { ok: true, value: null };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !isIsoDate(value)) {
    return fail(M.date);
  }
  if (rule.min !== undefined && value < rule.min) return fail(M.minDate);
  if (rule.max !== undefined && value > rule.max) return fail(M.maxDate);
  return { ok: true, value };
}

function parseChoice(value: unknown, options: { value: string }[]): Parsed<string> {
  if (empty(value)) return { ok: true, value: null };
  if (typeof value !== 'string' || !options.some((o) => o.value === value)) return fail(M.option);
  return { ok: true, value };
}

function parseCell(value: unknown, column: TableColumn): Parsed<string | NumberAnswer> {
  switch (column.type) {
    case 'text':
      return empty(value) ? { ok: true, value: null } : parseText(value, L.text);
    case 'number':
      return empty(value) ? { ok: true, value: null } : parseNumber(value, column);
    case 'date':
      return parseDate(value, column);
    case 'single_choice':
      return parseChoice(value, column.options);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks one answer against its question and returns it in the stored form. An empty answer is
 * `null`; whether a required question may stay empty is the caller's choice (`complete`): a
 * draft is saved with gaps, a submission is not.
 */
export function validateAnswer(
  question: Question,
  value: unknown,
  options: { complete?: boolean } = {},
): AnswerResult {
  const at = (message: string, path = question.key): AnswerResult => ({
    ok: false,
    issues: [{ path, message }],
  });
  const done = (parsed: Parsed<AnswerValue>): AnswerResult => {
    if (!parsed.ok) return at(parsed.message);
    if (parsed.value === null && options.complete && question.required) return at(M.required);
    return { ok: true, value: parsed.value };
  };

  switch (question.type) {
    case 'text':
      return done(
        empty(value) ? { ok: true, value: null } : parseText(value, question.maxLength ?? L.text),
      );
    case 'long_text':
      return done(
        empty(value)
          ? { ok: true, value: null }
          : parseLongText(value, question.maxLength ?? L.longText),
      );
    case 'number':
      return done(empty(value) ? { ok: true, value: null } : parseNumber(value, question));
    case 'date':
      return done(parseDate(value, question));
    case 'single_choice':
      return done(parseChoice(value, question.options));
    case 'multiple_choice': {
      if (empty(value)) return done({ ok: true, value: null });
      if (!Array.isArray(value) || value.length > L.selections) return at(M.option);
      const chosen = [...new Set(value as unknown[])];
      if (
        !chosen.every((v) => typeof v === 'string' && question.options.some((o) => o.value === v))
      ) {
        return at(M.option);
      }
      if (chosen.length === 0) return done({ ok: true, value: null });
      if (question.minSelected !== undefined && chosen.length < question.minSelected) {
        return at(M.minSelected(question.minSelected));
      }
      if (question.maxSelected !== undefined && chosen.length > question.maxSelected) {
        return at(M.maxSelected(question.maxSelected));
      }
      // In the order of the options, so the same choice is always stored the same way.
      const ordered = question.options.map((o) => o.value).filter((v) => chosen.includes(v));
      return done({ ok: true, value: ordered });
    }
    case 'file': {
      if (empty(value)) return done({ ok: true, value: null });
      if (!Array.isArray(value)) return at(M.files);
      const ids = [...new Set(value as unknown[])];
      if (!ids.every((id) => typeof id === 'string' && UUID.test(id))) return at(M.files);
      const max = question.maxFiles ?? L.files;
      if (ids.length > max) return at(M.maxFiles(max));
      return done({
        ok: true,
        value: ids.length ? (ids as string[]).map((id) => id.toLowerCase()) : null,
      });
    }
    case 'table': {
      if (empty(value)) return done({ ok: true, value: null });
      const maxRows = question.maxRows ?? L.rows;
      if (!Array.isArray(value)) return at(M.rows);
      if (value.length > maxRows) return at(M.maxRows(maxRows));
      const issues: { path: string; message: string }[] = [];
      const rows: TableRow[] = [];
      (value as unknown[]).forEach((raw, r) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          issues.push({ path: `${question.key}.${r}`, message: M.rows });
          return;
        }
        const row: TableRow = {};
        let filled = false;
        for (const column of question.columns) {
          const cell = parseCell((raw as Record<string, unknown>)[column.key], column);
          const path = `${question.key}.${r}.${column.key}`;
          if (!cell.ok) {
            issues.push({ path, message: cell.message });
            filled = true;
            continue;
          }
          row[column.key] = cell.value;
          if (cell.value !== null) filled = true;
        }
        // A row left entirely empty is not an answer; it is dropped.
        if (!filled) return;
        if (options.complete) {
          for (const column of question.columns) {
            if (column.required && row[column.key] === null) {
              issues.push({ path: `${question.key}.${r}.${column.key}`, message: M.required });
            }
          }
        }
        rows.push(row);
      });
      if (issues.length > 0) return { ok: false, issues };
      if (rows.length === 0) return done({ ok: true, value: null });
      if (options.complete && question.minRows !== undefined && rows.length < question.minRows) {
        return at(M.minRows(question.minRows));
      }
      return done({ ok: true, value: rows });
    }
  }
}

export type AnswersResult =
  | { ok: true; answers: Record<string, AnswerValue> }
  | { ok: false; issues: { path: string; message: string }[] };

/**
 * Checks a set of answers against the questions they belong to. With `complete`, every question
 * is checked, so a required one without an answer is reported; otherwise only the answers that
 * are given are checked. An answer to a question the form does not have is refused.
 */
export function validateAnswers(
  questions: readonly Question[],
  answers: Record<string, unknown>,
  options: { complete?: boolean } = {},
): AnswersResult {
  const byKey = new Map(questions.map((question) => [question.key, question]));
  const issues: { path: string; message: string }[] = [];
  const result: Record<string, AnswerValue> = {};
  for (const key of Object.keys(answers)) {
    if (!byKey.has(key)) issues.push({ path: key, message: M.unknownQuestion });
  }
  for (const question of questions) {
    const given = Object.prototype.hasOwnProperty.call(answers, question.key);
    if (!given && !options.complete) continue;
    const checked = validateAnswer(question, given ? answers[question.key] : null, options);
    if (checked.ok) result[question.key] = checked.value;
    else issues.push(...checked.issues);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, answers: result };
}
