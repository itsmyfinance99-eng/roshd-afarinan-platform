import {
  reportChapterKind,
  type AnswerValue,
  type FeasibilityReportChapterKind,
  type NumberAnswer,
  type Question,
  type TableColumn,
} from '@roshd/validation';
import { canonicalHash } from '../../../common/json/canonical-json';

/** Shape of the stored content of a report version (`REPORT_CONTENT_SCHEMA`). */
export const REPORT_CONTENT_SCHEMA = 1;

/** One value of a quoted answer; a date is an ISO day and a number a decimal string. */
export type QuotedScalar =
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: string; unit?: string }
  | { kind: 'date'; value: string };

export type QuotedValue =
  | QuotedScalar
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; columns: string[]; rows: QuotedScalar[][] };

/** An answer of the questionnaire as a report quotes it: the question and what was answered. */
export interface QuotedAnswer {
  key: string;
  label: string;
  value: QuotedValue;
}

export interface ReportChapterContent {
  key: string;
  kind: FeasibilityReportChapterKind;
  title: string;
  /** Markdown. */
  body: string;
  answers: QuotedAnswer[];
}

/** The run a report takes its figures from, as the report names it. */
export interface ReportRunRef {
  id: string;
  number: number;
  modelVersion: number;
  engineVersion: string;
  inputHash: string;
  createdAt: string;
  approvedAt: string;
}

/** What a version of a report keeps: everything of it that is not in the calculation run. */
export interface ReportContent {
  schema: typeof REPORT_CONTENT_SCHEMA;
  project: { code: string; title: string; sector: string | null; location: string | null };
  run: ReportRunRef | null;
  chapters: ReportChapterContent[];
}

/** A chapter of the draft as the composition reads it. */
export interface DraftChapter {
  key: string;
  title: string;
  body: string;
  answerKeys: string[];
}

const NONE: QuotedScalar = { kind: 'none' };

const isNumberAnswer = (value: unknown): value is NumberAnswer =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { value?: unknown }).value === 'string';

const optionLabel = (options: { value: string; label: string }[], value: string): string =>
  options.find((option) => option.value === value)?.label ?? value;

function numberOf(value: unknown, fixedUnit: string | undefined): QuotedScalar {
  if (!isNumberAnswer(value)) return NONE;
  const unit = value.unit ?? fixedUnit;
  return { kind: 'number', value: value.value, ...(unit ? { unit } : {}) };
}

function cellOf(column: TableColumn, value: unknown): QuotedScalar {
  if (value === null || value === undefined || value === '') return NONE;
  switch (column.type) {
    case 'number':
      return numberOf(value, column.unit);
    case 'date':
      return typeof value === 'string' ? { kind: 'date', value } : NONE;
    case 'single_choice':
      return typeof value === 'string'
        ? { kind: 'text', text: optionLabel(column.options, value) }
        : NONE;
    default:
      return typeof value === 'string' ? { kind: 'text', text: value } : NONE;
  }
}

/**
 * An answer as a report quotes it. The stored value was checked against its question when it
 * was written; a value of another shape (the question may have changed since) is quoted as not
 * answered. The files of a file question are not quoted: they stay with the project.
 */
export function quoteAnswer(question: Question, value: AnswerValue | undefined): QuotedValue {
  if (value === null || value === undefined || value === '') return NONE;
  switch (question.type) {
    case 'text':
    case 'long_text':
      return typeof value === 'string' ? { kind: 'text', text: value } : NONE;
    case 'number':
      return numberOf(value, question.unit);
    case 'date':
      return typeof value === 'string' ? { kind: 'date', value } : NONE;
    case 'single_choice':
      return typeof value === 'string'
        ? { kind: 'text', text: optionLabel(question.options, value) }
        : NONE;
    case 'multiple_choice': {
      if (!Array.isArray(value)) return NONE;
      const items = value.flatMap((item) =>
        typeof item === 'string' ? [optionLabel(question.options, item)] : [],
      );
      return items.length > 0 ? { kind: 'list', items } : NONE;
    }
    case 'table': {
      if (!Array.isArray(value)) return NONE;
      const rows = value.flatMap((row) =>
        typeof row === 'object' && row !== null && !Array.isArray(row)
          ? [question.columns.map((column) => cellOf(column, row[column.key]))]
          : [],
      );
      return rows.length > 0
        ? { kind: 'table', columns: question.columns.map((column) => column.label), rows }
        : NONE;
    }
    default:
      return NONE;
  }
}

/** Whether a question can be quoted in a report. */
export const isQuotable = (question: Question): boolean => question.type !== 'file';

export interface Composition {
  chapters: ReportChapterContent[];
  /** Chapters of the structure the report leaves out, and why. */
  omitted: { key: string; title: string }[];
  /** What keeps the draft from being issued, as the API reports it. */
  issues: { path: string; message: string }[];
}

/**
 * Puts the chapters of a draft together (ST-35.12).
 *
 * - A written chapter needs its text or at least one quoted answer.
 * - The financial chapter is the schedules of the approved run, so it needs one.
 * - The economic chapter is in the report when the run has an economic analysis or the experts
 *   wrote something for it; otherwise it is left out, because not every study has one.
 * - A quoted question that is not in the questionnaire any more is dropped.
 */
export function composeChapters(
  drafts: DraftChapter[],
  questions: Question[],
  answers: ReadonlyMap<string, AnswerValue>,
  run: { selected: boolean; economic: boolean },
): Composition {
  const byKey = new Map(questions.filter(isQuotable).map((question) => [question.key, question]));
  const composition: Composition = { chapters: [], omitted: [], issues: [] };
  for (const draft of drafts) {
    const kind = reportChapterKind(draft.key);
    const body = draft.body.trim();
    const quoted = draft.answerKeys.flatMap((key) => {
      const question = byKey.get(key);
      return question
        ? [{ key, label: question.label, value: quoteAnswer(question, answers.get(key)) }]
        : [];
    });
    if (kind === 'economic' && !run.economic && body === '' && quoted.length === 0) {
      composition.omitted.push({ key: draft.key, title: draft.title });
      continue;
    }
    if (kind === 'text' && body === '' && quoted.length === 0) {
      composition.issues.push({
        path: `chapters.${draft.key}`,
        message: `فصل «${draft.title}» هنوز متن یا پاسخ منتخبی ندارد.`,
      });
    }
    if (kind === 'financial' && !run.selected) {
      composition.issues.push({
        path: 'runId',
        message: `فصل «${draft.title}» از یک اجرای تأییدشده مدل مالی ساخته می‌شود؛ اجرای تأییدشده‌ای را انتخاب کنید.`,
      });
    }
    composition.chapters.push({ key: draft.key, kind, title: draft.title, body, answers: quoted });
  }
  return composition;
}

/** SHA-256 (hex) of the canonical JSON of the content of a version. */
export const reportContentHash = (content: ReportContent): string => canonicalHash(content);
