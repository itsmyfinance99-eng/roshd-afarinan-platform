import { hasPermission, type Principal } from '../../rbac/principal';

/** Content editors (cms:write) and catalog managers (catalog:manage) share the media library. */
export const MEDIA_PERMISSIONS = ['cms:write', 'catalog:manage'] as const;

export function canManageMedia(principal: Principal): boolean {
  return MEDIA_PERMISSIONS.some((p) => hasPermission(principal, p));
}
