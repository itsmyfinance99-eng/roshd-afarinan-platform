import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from '../../common/decorators/public.decorator';
import { ForbiddenError, UnauthenticatedError } from '../../common/errors/app-exception';
import { PrismaService } from '../database/prisma.service';
import { PRINCIPAL_KEY, type Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
import { ACCESS_COOKIE, cookieValue, passesCsrfCheck } from './auth-cookies';
import { TokenService } from './token.service';

/**
 * Global default-deny guard. Every route requires a valid access token unless marked @Public().
 * Roles are re-read from the database on each request so revocations apply immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly rbac: RbacService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();

    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    const cookie = cookieValue(req, ACCESS_COOKIE);
    const token = bearer ?? cookie;

    if (!token) {
      if (isPublic) return true;
      throw new UnauthenticatedError();
    }

    const claims = await this.tokens.verifyAccessToken(token);
    const user = claims
      ? await this.prisma.user.findUnique({
          where: { id: claims.sub },
          select: { id: true, status: true, sessionsRevokedAt: true },
        })
      : null;

    // Tokens issued before a password change, reset or "sign out everywhere" are dead.
    const issuedAtMs = claims?.iatMs ?? (claims?.iat ?? 0) * 1000;
    const revoked =
      user?.sessionsRevokedAt !== null &&
      user?.sessionsRevokedAt !== undefined &&
      issuedAtMs <= user.sessionsRevokedAt.getTime();

    if (!claims || !user || user.status !== 'ACTIVE' || revoked) {
      // A stale cookie must not break public pages; it only fails protected routes.
      if (isPublic) return true;
      throw new UnauthenticatedError();
    }

    const via = bearer ? 'bearer' : 'cookie';
    if (via === 'cookie' && !passesCsrfCheck(req)) throw new ForbiddenError();

    const roles = await this.rbac.rolesOfUser(user.id);
    const principal: Principal = {
      userId: user.id,
      sessionId: claims.sid,
      roles,
      permissions: await this.rbac.permissionsFor(roles),
      via,
    };
    (req as unknown as Record<string, Principal>)[PRINCIPAL_KEY] = principal;
    return true;
  }
}
