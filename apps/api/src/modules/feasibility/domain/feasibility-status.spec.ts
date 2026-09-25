import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  FEASIBILITY_STATUSES,
  type FeasibilityStatus,
  isTerminal,
  transition,
} from './feasibility-status';

describe('feasibility status machine', () => {
  it('walks the happy path from draft to archive', () => {
    const path: [FeasibilityStatus, FeasibilityStatus, Parameters<typeof transition>[2]][] = [
      ['DRAFT', 'SUBMITTED', 'applicant'],
      ['SUBMITTED', 'INITIAL_REVIEW', 'staff'],
      ['INITIAL_REVIEW', 'COST_ESTIMATED', 'staff'],
      ['COST_ESTIMATED', 'CONTRACT_PENDING', 'applicant'],
      ['CONTRACT_PENDING', 'IN_PROGRESS', 'staff'],
      ['IN_PROGRESS', 'EXPERT_REVIEW', 'expert'],
      ['EXPERT_REVIEW', 'CLIENT_REVIEW', 'expert'],
      ['CLIENT_REVIEW', 'DELIVERED', 'applicant'],
      ['DELIVERED', 'ARCHIVED', 'system'],
    ];
    for (const [from, to, actor] of path) {
      expect(transition(from, to, actor)).toEqual({ ok: true, from, to });
    }
  });

  it('rejects skipping steps', () => {
    expect(transition('DRAFT', 'IN_PROGRESS', 'staff')).toEqual({
      ok: false,
      reason: 'invalid_transition',
    });
    expect(transition('SUBMITTED', 'DELIVERED', 'staff').ok).toBe(false);
  });

  it('rejects actors without the right to a valid transition', () => {
    expect(transition('SUBMITTED', 'INITIAL_REVIEW', 'applicant')).toEqual({
      ok: false,
      reason: 'actor_not_allowed',
    });
    expect(transition('EXPERT_REVIEW', 'CLIENT_REVIEW', 'applicant').ok).toBe(false);
  });

  it('supports the more-information loop', () => {
    expect(transition('INITIAL_REVIEW', 'NEEDS_MORE_INFO', 'staff').ok).toBe(true);
    expect(transition('NEEDS_MORE_INFO', 'SUBMITTED', 'applicant').ok).toBe(true);
  });

  it('has exactly one terminal state and every state is reachable', () => {
    expect(FEASIBILITY_STATUSES.filter(isTerminal)).toEqual(['ARCHIVED']);
    const reachable = new Set<FeasibilityStatus>(['DRAFT']);
    const actors = ['applicant', 'staff', 'expert', 'system'] as const;
    let grew = true;
    while (grew) {
      grew = false;
      for (const s of [...reachable])
        for (const a of actors)
          for (const next of allowedTransitions(s, a))
            if (!reachable.has(next)) {
              reachable.add(next);
              grew = true;
            }
    }
    expect([...reachable].sort()).toEqual([...FEASIBILITY_STATUSES].sort());
  });
});
