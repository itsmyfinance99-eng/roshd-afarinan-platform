import type {
  ReportApprovalDecision,
  ReportApprovalState,
  ReportApprovalStep,
  ReportStructure,
} from '@roshd/validation';
import type { StaffRef } from '@/components/dashboard/types';

export type ChapterKind = 'text' | 'financial' | 'economic';

/** An approved calculation run a report can take its figures from. */
export interface ApprovedRun {
  id: string;
  number: number;
  modelVersion: number;
  engineVersion: string;
  inputHash: string;
  createdAt: string;
  approvedAt: string;
}

export interface DraftChapter {
  key: string;
  kind: ChapterKind;
  title: string;
  guidance: string | null;
  body: string;
  answerKeys: string[];
  version: number;
  updatedAt: string;
  updatedBy: StaffRef | null;
}

export interface ReportDraft {
  report: {
    template: { id: string; name: string } | null;
    run: ApprovedRun | null;
    chapters: DraftChapter[];
    excluded: { key: string; title: string; hasText: boolean }[];
    createdAt: string;
    updatedAt: string;
  } | null;
  runs: ApprovedRun[];
  questions: { key: string; label: string; type: string; answered: boolean }[];
  templates: { id: string; name: string }[];
  access: { edit: boolean; issue: boolean };
}

export type QuotedScalar =
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: string; unit?: string }
  | { kind: 'date'; value: string };

export type QuotedValue =
  | QuotedScalar
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; columns: string[]; rows: QuotedScalar[][] };

export interface QuotedAnswer {
  key: string;
  label: string;
  value: QuotedValue;
}

/** A value of a schedule as the API formatted it (Persian digits, «—» for a missing value). */
export interface BlockValue {
  text: string;
  ltr?: boolean;
}

export type ReportBlock =
  | {
      kind: 'table';
      title: string;
      note?: string;
      columns: { label: string }[];
      sections: {
        title?: string;
        rows: { label: string; strong?: boolean; values: BlockValue[] }[];
      }[];
    }
  | {
      kind: 'pairs';
      title?: string;
      rows: { label: string; value: BlockValue; notes?: string[] }[];
    }
  | { kind: 'grid'; title: string; head: string[]; rows: BlockValue[][] }
  | { kind: 'list'; title: string; items: string[] }
  | { kind: 'text'; text: string };

export interface ReportPart {
  id: string;
  title: string;
  blocks: ReportBlock[];
}

export interface ReportChapter {
  key: string;
  kind: ChapterKind;
  title: string;
  body: string;
  answers: QuotedAnswer[];
  parts?: ReportPart[];
}

/** Where the two approvals of a version stand (ST-35.14). */
export interface ReportApproval {
  state: ReportApprovalState;
  steps: {
    step: ReportApprovalStep;
    decision: ReportApprovalDecision;
    at: string;
    by: string;
    /** Staff and experts only. */
    note?: string | null;
  }[];
}

/** A version of a report, or the preview of its draft (`number` null). */
export interface ReportDocument {
  number: number | null;
  issuedAt: string | null;
  contentHash: string | null;
  project: { code: string; title: string; sector: string | null; location: string | null };
  run: (Omit<ApprovedRun, 'id'> & { modelTitle: string }) | null;
  chapters: ReportChapter[];
  note?: string | null;
  issuedBy?: StaffRef | null;
  /** A version only. */
  approval?: ReportApproval;
  /** Staff only: which decision the reader may take on this version now. */
  access?: { officer: boolean; admin: boolean };
  omitted?: { key: string; title: string }[];
  issues?: { path: string; message: string }[];
}

export interface ReportVersionSummary {
  number: number;
  contentHash: string;
  createdAt: string;
  approval: ReportApproval;
  note?: string | null;
  issuedBy?: StaffRef | null;
}

export interface ReportTemplate {
  id: string;
  name: string;
  chapters: ReportStructure;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
