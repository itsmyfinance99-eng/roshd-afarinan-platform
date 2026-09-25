import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, PRIVILEGED_ROLES, ROLES } from './rbac';

describe('rbac defaults', () => {
  it('defines grants for every role', () => {
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });

  it('only grants known permissions', () => {
    for (const grants of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      for (const p of grants) expect(PERMISSIONS).toContain(p);
    }
  });

  it('gives super_admin every permission and no permissions to plain users', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.super_admin].sort()).toEqual([...PERMISSIONS].sort());
    expect(DEFAULT_ROLE_PERMISSIONS.user).toHaveLength(0);
    expect(DEFAULT_ROLE_PERMISSIONS.guest).toHaveLength(0);
  });

  it('marks admin roles as privileged', () => {
    expect(PRIVILEGED_ROLES).toEqual(['admin', 'super_admin']);
  });
});
