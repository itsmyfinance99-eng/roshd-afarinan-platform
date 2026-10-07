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
  createdAt: string;
  updatedAt: string;
  /** Staff and expert lists only. */
  applicant?: StaffRef | null;
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
  };
  /** Staff and experts only. */
  experts?: { expert: StaffRef; since: string }[];
  /** Staff and experts only; `null` until the model of the study is made. */
  financialModel?: { id: string } | null;
}
