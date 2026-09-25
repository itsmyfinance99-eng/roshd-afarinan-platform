import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission, Role } from '@roshd/types';
import { UnauthenticatedError } from '../../common/errors/app-exception';

/** The authenticated caller, resolved by AuthGuard from the access token + current DB state. */
export interface Principal {
  userId: string;
  sessionId: string;
  roles: Role[];
  permissions: ReadonlySet<Permission>;
  /** How the access token arrived; cookie-authenticated mutations need the CSRF header. */
  via: 'cookie' | 'bearer';
}

export const PRINCIPAL_KEY = 'principal';

export function principalOf(req: unknown): Principal | undefined {
  return (req as Record<string, Principal | undefined>)[PRINCIPAL_KEY];
}

export function hasPermission(principal: Principal, permission: Permission): boolean {
  return principal.permissions.has(permission);
}

/** `@CurrentUser() user: Principal` — only valid on authenticated (non-@Public) routes. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const principal = principalOf(ctx.switchToHttp().getRequest());
  if (!principal) throw new UnauthenticatedError();
  return principal;
});
