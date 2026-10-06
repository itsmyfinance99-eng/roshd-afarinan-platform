import { randomInt } from 'node:crypto';
import {
  FEASIBILITY_STATUSES,
  type FeasibilityActor,
  type FeasibilityStatus,
} from '@roshd/validation';

/**
 * Feasibility workflow state machine (ADR-0010 §3). The statuses and actors are shared with the
 * web app through `@roshd/validation`.
 *
 * Status changes must go through `transition()` — never a plain update of a status column.
 */
export { FEASIBILITY_STATUSES, type FeasibilityActor, type FeasibilityStatus };

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

export type TransitionDecision =
  | { ok: true; from: FeasibilityStatus; to: FeasibilityStatus; actor: FeasibilityActor }
  | { ok: false; reason: 'invalid_transition' | 'actor_not_allowed' };

/**
 * The transition for somebody who may act in several capacities on a project (an expert who is
 * also staff): the first capacity the rules accept is the one recorded.
 */
export function transitionAs(
  from: FeasibilityStatus,
  to: FeasibilityStatus,
  actors: readonly FeasibilityActor[],
): TransitionDecision {
  let reason: 'invalid_transition' | 'actor_not_allowed' = 'actor_not_allowed';
  for (const actor of actors) {
    const result = transition(from, to, actor);
    if (result.ok) return { ...result, actor };
    reason = result.reason;
  }
  return { ok: false, reason };
}

/**
 * The capacities of a user on a project. The applicant is only ever the applicant of their own
 * project: staff rights and an assignment do not count there, so nobody reviews their own request.
 */
export function actorsOf(relation: {
  owner: boolean;
  manager: boolean;
  expert: boolean;
}): FeasibilityActor[] {
  if (relation.owner) return ['applicant'];
  return [
    ...(relation.manager ? (['staff'] as const) : []),
    ...(relation.expert ? (['expert'] as const) : []),
  ];
}

/** Crockford-style alphabet without I, L, O, U (no look-alikes when read over the phone). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Public reference of a project like FP-7K3M9QPD (uniqueness enforced by the DB). */
export function generateProjectCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `FP-${code}`;
}
