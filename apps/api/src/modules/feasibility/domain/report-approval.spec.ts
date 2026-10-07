import { describe, expect, it } from 'vitest';
import {
  approvalRefusal,
  approvalState,
  approvalView,
  isFinallyApproved,
  type ApprovalRecord,
} from './report-approval';

const record = (
  step: ApprovalRecord['step'],
  decision: ApprovalRecord['decision'],
  by = 'u-officer',
): ApprovalRecord => ({
  step,
  decision,
  note: decision === 'REJECTED' ? 'فصل بازار کامل نیست' : null,
  decidedById: by,
  decidedByName: by === 'u-officer' ? 'مسئول' : 'مدیر',
  createdAt: new Date(step === 'OFFICER' ? '2026-10-08T08:00:00Z' : '2026-10-08T09:00:00Z'),
});

const officer = record('OFFICER', 'APPROVED');
const admin = record('ADMIN', 'APPROVED', 'u-admin');

describe('approval of a report version', () => {
  it('goes from the officer to the admin and is final with both', () => {
    expect(approvalState([])).toBe('pending_officer');
    expect(approvalState([officer])).toBe('pending_admin');
    expect(approvalState([officer, admin])).toBe('approved');
    expect(isFinallyApproved([officer])).toBe(false);
    expect(isFinallyApproved([admin, officer])).toBe(true);
  });

  it('is refused for good by a refusal at either step', () => {
    expect(approvalState([record('OFFICER', 'REJECTED')])).toBe('rejected');
    expect(approvalState([officer, record('ADMIN', 'REJECTED', 'u-admin')])).toBe('rejected');
  });

  it('lets the admin decide only after the officer approved', () => {
    expect(approvalRefusal([], 'admin', 'u-admin')).toBe('officer_first');
    expect(approvalRefusal([], 'officer', 'u-officer')).toBeNull();
    expect(approvalRefusal([officer], 'admin', 'u-admin')).toBeNull();
  });

  it('takes each step once and nothing after the end', () => {
    expect(approvalRefusal([officer], 'officer', 'u-other')).toBe('decided');
    expect(approvalRefusal([officer, admin], 'admin', 'u-other')).toBe('approved');
    expect(approvalRefusal([officer, admin], 'officer', 'u-other')).toBe('approved');
    const refused = [record('OFFICER', 'REJECTED')];
    expect(approvalRefusal(refused, 'officer', 'u-other')).toBe('rejected');
    expect(approvalRefusal(refused, 'admin', 'u-admin')).toBe('rejected');
  });

  it('wants two people for the two approvals', () => {
    expect(approvalRefusal([officer], 'admin', 'u-officer')).toBe('same_person');
    // Whoever approved first has left: the second approval is still somebody else's.
    expect(approvalRefusal([{ ...officer, decidedById: null }], 'admin', 'u-officer')).toBeNull();
  });

  it('shows the staff every decision with its note, in the order of the steps', () => {
    const view = approvalView([record('ADMIN', 'REJECTED', 'u-admin'), officer], false);
    expect(view.state).toBe('rejected');
    expect(view.steps.map((step) => [step.step, step.decision, step.by, step.note])).toEqual([
      ['officer', 'approved', 'مسئول', null],
      ['admin', 'rejected', 'مدیر', 'فصل بازار کامل نیست'],
    ]);
  });

  it('shows the applicant the two approvals of an approved version and nothing else', () => {
    expect(approvalView([], true)).toEqual({ state: 'pending', steps: [] });
    expect(approvalView([officer], true)).toEqual({ state: 'pending', steps: [] });
    expect(approvalView([record('OFFICER', 'REJECTED')], true)).toEqual({
      state: 'pending',
      steps: [],
    });
    const approved = approvalView([officer, admin], true);
    expect(approved.state).toBe('approved');
    expect(approved.steps).toEqual([
      { step: 'officer', decision: 'approved', at: officer.createdAt, by: 'مسئول' },
      { step: 'admin', decision: 'approved', at: admin.createdAt, by: 'مدیر' },
    ]);
  });
});
