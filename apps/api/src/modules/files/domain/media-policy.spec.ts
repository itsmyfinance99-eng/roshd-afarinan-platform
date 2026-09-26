import type { Permission } from '@roshd/types';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../../rbac/principal';
import { canManageMedia } from './media-policy';

const principal = (...permissions: Permission[]): Principal => ({
  userId: 'u1',
  sessionId: 's1',
  roles: [],
  permissions: new Set(permissions),
  via: 'bearer',
});

describe('canManageMedia', () => {
  it('allows content editors or catalog managers', () => {
    expect(canManageMedia(principal('cms:write'))).toBe(true);
    expect(canManageMedia(principal('catalog:manage'))).toBe(true);
  });

  it('denies everyone else, including other staff', () => {
    expect(canManageMedia(principal())).toBe(false);
    expect(canManageMedia(principal('cms:publish'))).toBe(false);
    expect(canManageMedia(principal('requests:manage', 'tickets:reply'))).toBe(false);
  });
});
