import type {
  ReportApprovalDecision,
  ReportApprovalState,
  ReportApprovalStep,
} from '@roshd/validation';

/**
 * The two approvals of a version of a report (ST-35.14, ADR-0010 §8, OQ-37): first the
 * feasibility officer, then an admin, in that order only. A decision is written once; a version
 * that was refused at either step stays refused, and the correction is a new version.
 */

/** A decision as it is stored. */
export interface ApprovalRecord {
  step: 'OFFICER' | 'ADMIN';
  decision: 'APPROVED' | 'REJECTED';
  note: string | null;
  decidedById: string | null;
  /** The name of who decided, as it was then: it stays on the report. */
  decidedByName: string;
  createdAt: Date;
}

export interface ApprovalStepView {
  step: ReportApprovalStep;
  decision: ReportApprovalDecision;
  at: Date;
  /** The name of who decided. */
  by: string;
  /** Those who work on the study only: why a version was refused, or a remark. */
  note?: string | null;
}

export interface VersionApprovalView {
  state: ReportApprovalState;
  steps: ApprovalStepView[];
}

const STEP_ORDER: Record<ApprovalRecord['step'], number> = { OFFICER: 0, ADMIN: 1 };

const of = (records: readonly ApprovalRecord[], step: ApprovalRecord['step']) =>
  records.find((record) => record.step === step);

/** Where the approval of a version stands. */
export function approvalState(
  records: readonly ApprovalRecord[],
): Exclude<ReportApprovalState, 'pending'> {
  if (records.some((record) => record.decision === 'REJECTED')) return 'rejected';
  if (!of(records, 'OFFICER')) return 'pending_officer';
  return of(records, 'ADMIN') ? 'approved' : 'pending_admin';
}

/** Whether both approvals were given: only such a version is delivered. */
export const isFinallyApproved = (records: readonly ApprovalRecord[]): boolean =>
  approvalState(records) === 'approved';

export type ApprovalRefusal =
  /** The version was refused; a new one has to be issued. */
  | 'rejected'
  /** Both approvals are given; nothing is left to decide. */
  | 'approved'
  /** This step was decided already. */
  | 'decided'
  /** The admin decides after the officer approved. */
  | 'officer_first'
  /** The two approvals are given by two people. */
  | 'same_person';

/** Why `userId` cannot decide `step` of a version now; null when they can. */
export function approvalRefusal(
  records: readonly ApprovalRecord[],
  step: ReportApprovalStep,
  userId: string,
): ApprovalRefusal | null {
  const state = approvalState(records);
  if (state === 'rejected' || state === 'approved') return state;
  if (step === 'officer') return state === 'pending_officer' ? null : 'decided';
  if (state === 'pending_officer') return 'officer_first';
  return of(records, 'OFFICER')?.decidedById === userId ? 'same_person' : null;
}

const stepView = (record: ApprovalRecord, notes: boolean): ApprovalStepView => ({
  step: record.step === 'OFFICER' ? 'officer' : 'admin',
  decision: record.decision === 'APPROVED' ? 'approved' : 'rejected',
  at: record.createdAt,
  by: record.decidedByName,
  ...(notes ? { note: record.note } : {}),
});

/**
 * The approval of a version as it is read. Those who work on the study see every decision with
 * its note. The applicant sees the two approvals of an approved version, with the names that
 * stand on the report, and nothing of a version that is still decided on or was refused.
 */
export function approvalView(
  records: readonly ApprovalRecord[],
  applicant: boolean,
): VersionApprovalView {
  const ordered = [...records].sort((a, b) => STEP_ORDER[a.step] - STEP_ORDER[b.step]);
  const state = approvalState(ordered);
  if (!applicant) return { state, steps: ordered.map((record) => stepView(record, true)) };
  return state === 'approved'
    ? { state, steps: ordered.map((record) => stepView(record, false)) }
    : { state: 'pending', steps: [] };
}
