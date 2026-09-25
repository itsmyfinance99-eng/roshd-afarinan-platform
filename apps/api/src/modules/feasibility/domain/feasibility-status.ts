/**
 * Feasibility workflow state machine (roadmap §27). Phase 1 defines the contract only;
 * the full workflow (questionnaire, documents, experts) arrives in Phase 3 (EPIC-14).
 *
 * Status changes must go through `transition()` — never a plain update of a status column.
 */
export const FEASIBILITY_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'INITIAL_REVIEW',
  'NEEDS_MORE_INFO',
  'COST_ESTIMATED',
  'CONTRACT_PENDING',
  'IN_PROGRESS',
  'EXPERT_REVIEW',
  'CLIENT_REVIEW',
  'DELIVERED',
  'ARCHIVED',
] as const;

export type FeasibilityStatus = (typeof FEASIBILITY_STATUSES)[number];

/** Who may trigger a transition. Fine-grained permissions are mapped in Phase 3. */
export type FeasibilityActor = 'applicant' | 'staff' | 'expert' | 'system';

interface TransitionRule {
  to: FeasibilityStatus;
  by: readonly FeasibilityActor[];
}

const RULES: Record<FeasibilityStatus, readonly TransitionRule[]> = {
  DRAFT: [{ to: 'SUBMITTED', by: ['applicant'] }],
  SUBMITTED: [{ to: 'INITIAL_REVIEW', by: ['staff'] }],
  INITIAL_REVIEW: [
    { to: 'NEEDS_MORE_INFO', by: ['staff'] },
    { to: 'COST_ESTIMATED', by: ['staff'] },
    { to: 'ARCHIVED', by: ['staff'] },
  ],
  NEEDS_MORE_INFO: [
    { to: 'SUBMITTED', by: ['applicant'] },
    { to: 'ARCHIVED', by: ['staff', 'system'] },
  ],
  COST_ESTIMATED: [
    { to: 'CONTRACT_PENDING', by: ['applicant'] },
    { to: 'ARCHIVED', by: ['applicant', 'staff'] },
  ],
  CONTRACT_PENDING: [
    { to: 'IN_PROGRESS', by: ['staff'] },
    { to: 'ARCHIVED', by: ['staff'] },
  ],
  IN_PROGRESS: [{ to: 'EXPERT_REVIEW', by: ['staff', 'expert'] }],
  EXPERT_REVIEW: [
    { to: 'IN_PROGRESS', by: ['expert'] },
    { to: 'CLIENT_REVIEW', by: ['expert'] },
  ],
  CLIENT_REVIEW: [
    { to: 'IN_PROGRESS', by: ['applicant', 'staff'] },
    { to: 'DELIVERED', by: ['applicant', 'staff'] },
  ],
  DELIVERED: [{ to: 'ARCHIVED', by: ['staff', 'system'] }],
  ARCHIVED: [],
};

export type TransitionResult =
  | { ok: true; from: FeasibilityStatus; to: FeasibilityStatus }
  | { ok: false; reason: 'invalid_transition' | 'actor_not_allowed' };

export function allowedTransitions(
  from: FeasibilityStatus,
  actor: FeasibilityActor,
): FeasibilityStatus[] {
  return RULES[from].filter((r) => r.by.includes(actor)).map((r) => r.to);
}

export function transition(
  from: FeasibilityStatus,
  to: FeasibilityStatus,
  actor: FeasibilityActor,
): TransitionResult {
  const rule = RULES[from].find((r) => r.to === to);
  if (!rule) return { ok: false, reason: 'invalid_transition' };
  if (!rule.by.includes(actor)) return { ok: false, reason: 'actor_not_allowed' };
  return { ok: true, from, to };
}

export const isTerminal = (status: FeasibilityStatus): boolean => RULES[status].length === 0;
