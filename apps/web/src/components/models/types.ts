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
}

export interface CalculationRunRef {
  id: string;
  number: number;
}
