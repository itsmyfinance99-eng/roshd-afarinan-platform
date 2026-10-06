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

/** Mirrors GET /api/v1/feasibility-projects/:id. */
export interface FeasibilityProjectDetail extends FeasibilityProjectItem {
  summary: string | null;
  sourceRequest: { id: string; trackingCode: string } | null;
  attachments: FileItem[];
  events: FeasibilityStatusEvent[];
  access: {
    transitions: FeasibilityStatus[];
    edit: boolean;
    remove: boolean;
    assignExperts: boolean;
    releaseExperts: boolean;
  };
  /** Staff and experts only. */
  experts?: { expert: StaffRef; since: string }[];
}
