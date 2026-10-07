import type { FeasibilityActor, FeasibilityStatus } from '@roshd/validation';
import type { StaffRef } from '@/components/dashboard/types';
import type { FileItem } from '@/components/files/files';

/** Mirrors the list items of GET /api/v1/feasibility-projects. */
export interface FeasibilityProjectItem {
  id: string;
  code: string;
  title: string;
  sector: string | null;
  location: string | null;
  status: FeasibilityStatus;
  /** Since when the project is in its status (ST-35.15). */
  statusSince?: string;
  createdAt: string;
  updatedAt: string;
  /** Staff and expert lists only. */
  applicant?: StaffRef | null;
}

/** One status of the pipeline of the staff (ST-35.15). */
export interface FeasibilityPipelineStage {
  status: FeasibilityStatus;
  count: number;
  /** Null, not zero, when no project is in the status. */
  oldestSince: string | null;
  longestDays: number | null;
  averageDays: number | null;
}

export interface FeasibilityPipeline {
  total: number;
  /** The moment the ages are counted to. */
  asOf: string;
  stages: FeasibilityPipelineStage[];
  /** Everybody who works on a project now, for the filter. */
  experts: StaffRef[];
}

export interface FeasibilityStatusEvent {
  fromStatus: FeasibilityStatus | null;
  toStatus: FeasibilityStatus;
  actor: FeasibilityActor;
  note: string | null;
  createdAt: string;
  /** Staff and experts only; the applicant sees the capacity. */
  by?: StaffRef | null;
}

/** The cost estimate of a study; the amount is whole rials as digits. */
export interface FeasibilityCostEstimate {
  amountRials: string;
  scope: string;
  durationDays: number;
  createdAt: string;
}

/** Mirrors GET /api/v1/feasibility-projects/:id. */
export interface FeasibilityProjectDetail extends FeasibilityProjectItem {
  summary: string | null;
  sourceRequest: { id: string; trackingCode: string } | null;
  attachments: FileItem[];
  /** Once the staff entered it; always null for an expert. */
  costEstimate: FeasibilityCostEstimate | null;
  events: FeasibilityStatusEvent[];
  access: {
    transitions: FeasibilityStatus[];
    edit: boolean;
    remove: boolean;
    assignExperts: boolean;
    releaseExperts: boolean;
    /** Make the financial model of the study (staff and experts, while the work lasts). */
    createModel: boolean;
    /** Write an internal note (staff and experts). */
    addNote: boolean;
    /** Start a review thread (the applicant in their review; staff and experts during the work). */
    comment: boolean;
    /** Open the report of the study: its draft and versions, or (the applicant) its newest version. */
    report?: boolean;
  };
  /** Staff and experts only. */
  experts?: { expert: StaffRef; since: string }[];
  /** Staff and experts only; `null` until the model of the study is made. */
  financialModel?: { id: string } | null;
}
