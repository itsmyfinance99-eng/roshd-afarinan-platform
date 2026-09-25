import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@roshd/types';

export const REQUIRED_PERMISSIONS = 'roshd:required-permissions';

/** The caller must hold every listed permission (checked by PermissionsGuard). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
