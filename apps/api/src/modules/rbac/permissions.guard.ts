import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@roshd/types';
import { ForbiddenError } from '../../common/errors/app-exception';
import { principalOf } from './principal';
import { REQUIRED_PERMISSIONS } from './permissions.decorator';

/** Enforces @RequirePermissions(). Runs after AuthGuard, which resolves the principal. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const principal = principalOf(context.switchToHttp().getRequest());
    if (!principal || !required.every((p) => principal.permissions.has(p))) {
      throw new ForbiddenError();
    }
    return true;
  }
}
