import { toPersianDigits, type ReportingUnit } from '@roshd/validation';
import { isolate, type ReportPart } from './document';
import { frameOfHorizon, type Column } from './frame';
import { unitLabel } from './indicators';
import { formatDecimalFa } from './numbers';
import type { RunReportSource } from './report';
import { cellNumber, tableColumns } from './tables';
import { BASIS_LABELS_FA, type Basis } from './warnings';

/**
 * The report of a feasibility study as a document (ST-35.13): the chapters the experts wrote,
 * the answers of the questionnaire they quote, and — for the financial and the economic chapter —
 * the parts of the report of a calculation run with its charts. The PDF of a version is written
 * from this one document; it is plain data, so that it can be handed to a worker thread.
 */

/** One value of a quoted answer; a date is an ISO day and a number a decimal string. */
export type StudyScalar =
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: string; unit?: string }
  | { kind: 'date'; value: string };

export type StudyAnswerValue =
  | StudyScalar
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; columns: string[]; rows: StudyScalar[][] };

export interface StudyAnswer {
  label: string;
  value: StudyAnswerValue;
}

/** A line chart over the periods of a run; a second series is drawn dashed. */
export interface StudyChart {
  /** The part of the run's report the chart belongs to. */
  part: string;
  title: string;
  /** The largest and the smallest value, as text. */
  caption: string;
  columns: Column[];
  /** One canonical decimal string per column. */
  series: { label: string; values: string[] }[];
}

export interface StudyChapter {
  title: string;
  /** Markdown. */
  body: string;
  answers: StudyAnswer[];
  /** The schedules of the calculation run, for the financial and the economic chapter. */
  parts?: ReportPart[];
  charts?: StudyChart[];
}

/** An approval of the version, as it stands on the report. */
export interface StudyApproval {
  /** Who approves at this step, e.g. «مسئول امکان‌سنجی». */
  role: string;
  name: string;
  at: Date | string;
}

export interface StudyDocument {
  project: { code: string; title: string; sector: string | null; location: string | null };
  version: {
    number: number;
    issuedAt: Date | string;
    contentHash: string;
    /** The approvals the version has, in their order; with both it is the approved report. */
    approvals?: StudyApproval[];
    /** Whether the version has every approval a report needs. */
    approved?: boolean;
  };
  chapters: StudyChapter[];
}

/** An ISO day in the Persian calendar, e.g. «۱۴۰۵/۰۶/۲۱»; anything else as it is. */
export function dayFa(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** A value of a quoted answer as the report shows it; «—» where nothing was answered. */
export function scalarText(value: StudyScalar): string {
  switch (value.kind) {
    case 'text':
      return value.text;
    case 'number': {
      const number = /^-?\d+(\.\d+)?$/.test(value.value)
        ? formatDecimalFa(value.value)
        : toPersianDigits(value.value);
      // The figure keeps its own direction next to a unit in any script.
      return value.unit ? `⁦${number}⁩ ${isolate(value.unit)}` : number;
    }
    case 'date':
      return dayFa(value.value);
    default:
      return '—';
  }
}

const BASES: Basis[] = ['totalCapital', 'equity'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A stored series: one decimal string per column, or nothing when it has another shape. */
function series(value: unknown, length: number, unit: ReportingUnit): string[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const numbers = value.map((item) =>
    typeof item === 'string' ? cellNumber(item, 'amount', unit) : null,
  );
  return numbers.every((item): item is string => item !== null && Number.isFinite(Number(item)))
    ? numbers
    : null;
}

/**
 * The charts of a run, as the result page draws them: the cumulative net cash flow and its
 * present value for the total capital and for the equity. Read from the stored run; a run whose
 * data has another shape has no chart, and its tables say what could not be read.
 */
export function runCharts(source: RunReportSource): StudyChart[] {
  const input = isRecord(source.input) ? source.input : {};
  const frame = frameOfHorizon(input.horizon);
  const statements =
    isRecord(source.results) && isRecord(source.results.statements)
      ? source.results.statements
      : null;
  if (!frame || !statements) return [];
  const currency = typeof input.localCurrency === 'string' ? input.localCurrency : '';
  const amounts = unitLabel(source.unit, isolate(currency));
  return BASES.flatMap((basis): StudyChart[] => {
    const flow = statements[basis];
    if (!isRecord(flow)) return [];
    const columns = tableColumns(frame, flow.salvageColumn === true);
    const cumulative = series(flow.cumulative, columns.length, source.unit);
    const present = series(flow.cumulativePresentValue, columns.length, source.unit);
    if (!cumulative || !present || columns.length < 2) return [];
    const all = [...cumulative, ...present];
    const pick = (better: (a: number, b: number) => boolean) =>
      all.reduce((best, value) => (better(Number(value), Number(best)) ? value : best));
    const figure = (value: string) => `⁦${formatDecimalFa(value)}⁩`;
    return [
      {
        part: 'discounted',
        title: `نمودار جریان نقد تجمعی ${BASIS_LABELS_FA[basis]}`,
        caption: `بیشترین: ${figure(pick((a, b) => a > b))} · کمترین: ${figure(
          pick((a, b) => a < b),
        )} (${amounts})`,
        columns,
        series: [
          { label: `جریان نقد خالص تجمعی ${BASIS_LABELS_FA[basis]}`, values: cumulative },
          { label: 'ارزش فعلی تجمعی', values: present },
        ],
      },
    ];
  });
}
