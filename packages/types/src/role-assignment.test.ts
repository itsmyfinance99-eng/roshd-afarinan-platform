import { describe, expect, it } from 'vitest';
import { decideStatusChange } from './role-assignment';

describe('decideStatusChange', () => {
  const base = { actorId: 'a', targetId: 't' };

  it('lets an admin suspend a regular or staff account', () => {
    expect(
      decideStatusChange({ ...base, actorRoles: ['admin'], targetRoles: ['user', 'support'] }),
    ).toEqual({ allowed: true });
  });

  it('forbids changing your own status', () => {
    expect(
      decideStatusChange({
        actorId: 'a',
        targetId: 'a',
        actorRoles: ['super_admin'],
        targetRoles: [],
      }),
    ).toEqual({ allowed: false, reason: 'self' });
  });

  it('reserves admin accounts for super_admin', () => {
    expect(
      decideStatusChange({ ...base, actorRoles: ['admin'], targetRoles: ['user', 'admin'] }),
    ).toEqual({ allowed: false, reason: 'privileged' });
    expect(
      decideStatusChange({ ...base, actorRoles: ['super_admin'], targetRoles: ['admin'] }),
    ).toEqual({ allowed: true });
  });
});
