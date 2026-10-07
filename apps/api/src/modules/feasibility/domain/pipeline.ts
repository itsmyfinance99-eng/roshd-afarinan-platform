import {
  FEASIBILITY_STATUS_LABELS_FA,
  FEASIBILITY_STATUSES,
  type FeasibilityStatus,
} from '@roshd/validation';
import type { CsvRaw } from '../../../common/csv/csv';
import { formatTehranDateTime, tehranFileStamp } from '../../../common/time/iran-time';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days a project has been in its status; a clock that runs behind gives 0, never less. */
export function daysIn(since: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
}

/** One status of the pipeline: how many projects are in it, and for how long. */
export interface PipelineStage {
  status: FeasibilityStatus;
  count: number;
  /** Since when the longest-waiting project is in this status; null when none is. */
  oldestSince: Date | null;
  /** Days of the longest-waiting project; null when none is in this status. */
  longestDays: number | null;
  /** Mean of the whole days the projects have been in this status; null when none is. */
  averageDays: number | null;
}

export interface PipelineSummary {
  total: number;
  /** Every status in the order of the workflow, also the ones without a project. */
  stages: PipelineStage[];
}

/** The pipeline of the given projects at `now`. */
export function pipelineSummary(
  rows: readonly { status: FeasibilityStatus; statusSince: Date }[],
  now: Date,
): PipelineSummary {
  const stages = FEASIBILITY_STATUSES.map((status): PipelineStage => {
    const since = rows.filter((row) => row.status === status).map((row) => row.statusSince);
    if (since.length === 0) {
      return { status, count: 0, oldestSince: null, longestDays: null, averageDays: null };
    }
    const oldest = since.reduce((a, b) => (b < a ? b : a));
    const days = since.map((at) => daysIn(at, now));
    return {
      status,
      count: since.length,
      oldestSince: oldest,
      longestDays: daysIn(oldest, now),
      // One decimal is as exact as whole days are.
      averageDays: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
    };
  });
  return { total: rows.length, stages };
}

export const PIPELINE_EXPORT_HEADER = [
  'کد پروژه',
  'عنوان',
  'حوزه',
  'محل اجرا',
  'وضعیت',
  'از تاریخ',
  'روز در این مرحله',
  'متقاضی',
  'کارشناسان',
  'تاریخ ثبت',
] as const;

export interface ExportableProject {
  code: string;
  title: string;
  sector: string | null;
  location: string | null;
  status: FeasibilityStatus;
  statusSince: Date;
  createdAt: Date;
  applicant: string | null;
  experts: readonly string[];
}

/** One CSV row. Free text (title, location, names) is escaped by the CSV writer. */
export function pipelineExportRow(project: ExportableProject, now: Date): CsvRaw[] {
  return [
    project.code,
    project.title,
    project.sector,
    project.location,
    FEASIBILITY_STATUS_LABELS_FA[project.status],
    formatTehranDateTime(project.statusSince),
    daysIn(project.statusSince, now),
    project.applicant,
    project.experts.join('؛ '),
    formatTehranDateTime(project.createdAt),
  ];
}

/** ASCII file name (Content-Disposition safe): feasibility-projects-20260926-1430.csv */
export function pipelineExportFileName(now: Date): string {
  return `feasibility-projects-${tehranFileStamp(now)}.csv`;
}
