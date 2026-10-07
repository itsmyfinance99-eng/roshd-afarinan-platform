import type { StaffRef } from '@/components/dashboard/types';

/** Shapes of the financial-model API (`/financial-models`, ST-34.06). */

export interface FinancialModelSummary {
  id: string;
  title: string;
  /** Raised by every save; a save on top of an older version is refused. */
  version: number;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialModelDetail extends FinancialModelSummary {
  /** The draft of the inputs; it may be incomplete. */
  inputs: unknown;
  access: { edit: boolean; approve: boolean; assign: boolean; remove: boolean };
  assignee?: StaffRef | null;
  /** The feasibility project the model belongs to; `null` for a personal model. */
  projectId: string | null;
}

export interface CalculationRunRef {
  id: string;
  number: number;
}

/** A calculation run in a list (`GET /financial-models/:id/runs`). */
export interface CalculationRunSummary extends CalculationRunRef {
  /** Version of the model's inputs that was calculated. */
  modelVersion: number;
  inputHash: string;
  engineVersion: string;
  createdAt: string;
  approvedAt: string | null;
  /** The caller may approve this run now (four eyes: never the one who calculated it). */
  canApprove: boolean;
}

/** A run with its input snapshot and results; `results` is the engine's `ProjectModel`. */
export interface CalculationRunDetail extends CalculationRunSummary {
  input: unknown;
  results: unknown;
  warnings: { code: string; params?: Record<string, string> }[];
  defaultsUsed: { key: string; value: string; item?: string }[];
}
