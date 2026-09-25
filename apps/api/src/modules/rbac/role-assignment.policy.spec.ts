import { describe, expect, it } from 'vitest';
import { decideRoleAssignment, normaliseRoles } from './role-assignment.policy';

const base = { actorId: 'a', targetId: 't', currentRoles: ['user'] as const };

describe('decideRoleAssignment', () => {
  it('lets an admin grant non-privileged roles', () => {
    expect(
      decideRoleAssignment({ ...base, actorRoles: ['admin'], nextRoles: ['user', 'editor'] }),
    ).toEqual({ allowed: true });
  });

  it('forbids changing your own roles, even as super_admin', () => {
    expect(
      decideRoleAssignment({
        ...base,
        targetId: 'a',
        actorRoles: ['super_admin'],
        nextRoles: ['user'],
      }),
    ).toEqual({ allowed: false, reason: 'self' });
  });

  it('requires super_admin to grant admin', () => {
    expect(
      decideRoleAssignment({ ...base, actorRoles: ['admin'], nextRoles: ['user', 'admin'] }),
    ).toEqual({ allowed: false, reason: 'privileged' });
    expect(
      decideRoleAssignment({ ...base, actorRoles: ['super_admin'], nextRoles: ['user', 'admin'] }),
    ).toEqual({ allowed: true });
  });

  it('requires super_admin to demote an existing admin', () => {
    expect(
      decideRoleAssignment({
        ...base,
        currentRoles: ['user', 'admin'],
        actorRoles: ['admin'],
        nextRoles: ['user'],
      }),
    ).toEqual({ allowed: false, reason: 'privileged' });
  });

  it('rejects an empty role set', () => {
    expect(decideRoleAssignment({ ...base, actorRoles: ['admin'], nextRoles: [] })).toEqual({
      allowed: false,
      reason: 'empty',
    });
  });
});

describe('normaliseRoles', () => {
  it('deduplicates, always keeps user and drops guest', () => {
    expect(normaliseRoles(['editor', 'editor', 'guest'])).toEqual(['editor', 'user']);
  });
});
