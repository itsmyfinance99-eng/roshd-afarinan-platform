import { PRIVILEGED_ROLES, type Role } from './rbac';

export type RoleAssignmentDecision =
  { allowed: true } | { allowed: false; reason: 'self' | 'privileged' | 'empty' };

/**
 * Pure policy for changing a user's roles (security baseline):
 * - nobody changes their own roles (prevents self-escalation and lock-out),
 * - granting or revoking admin/super_admin, or editing an admin, requires super_admin,
 * - the `user` role is always kept so every account keeps baseline access.
 * The caller must already hold `users:manage-roles`. Shared so the dashboard can disable exactly
 * what the API refuses; the API remains the authority.
 */
export function decideRoleAssignment(input: {
  actorId: string;
  actorRoles: readonly Role[];
  targetId: string;
  currentRoles: readonly Role[];
  nextRoles: readonly Role[];
}): RoleAssignmentDecision {
  if (input.actorId === input.targetId) return { allowed: false, reason: 'self' };
  if (input.nextRoles.length === 0) return { allowed: false, reason: 'empty' };

  const touchesPrivileged = [...input.currentRoles, ...input.nextRoles].some((r) =>
    PRIVILEGED_ROLES.includes(r),
  );
  if (touchesPrivileged && !input.actorRoles.includes('super_admin')) {
    return { allowed: false, reason: 'privileged' };
  }
  return { allowed: true };
}

export type StatusChangeDecision =
  { allowed: true } | { allowed: false; reason: 'self' | 'privileged' };

/**
 * Pure policy for suspending or reactivating an account: nobody changes their own status, and
 * only a super_admin may change the status of an admin or super_admin account.
 */
export function decideStatusChange(input: {
  actorId: string;
  actorRoles: readonly Role[];
  targetId: string;
  targetRoles: readonly Role[];
}): StatusChangeDecision {
  if (input.actorId === input.targetId) return { allowed: false, reason: 'self' };
  const privileged = input.targetRoles.some((r) => PRIVILEGED_ROLES.includes(r));
  if (privileged && !input.actorRoles.includes('super_admin')) {
    return { allowed: false, reason: 'privileged' };
  }
  return { allowed: true };
}

/** Normalises a requested role set: unique, always includes `user`, never `guest`. */
export function normaliseRoles(roles: readonly Role[]): Role[] {
  const set = new Set<Role>(roles.filter((r) => r !== 'guest'));
  set.add('user');
  return [...set].sort();
}
