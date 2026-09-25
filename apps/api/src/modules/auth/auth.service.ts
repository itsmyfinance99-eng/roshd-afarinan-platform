import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Permission } from '@roshd/types';
import type { LoginInput, RegisterInput } from '@roshd/validation';
import { ForbiddenError, UnauthenticatedError } from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { UsersService, type UserView } from '../users/users.service';
import { PasswordHasher } from './password-hasher';
import { TokenService } from './token.service';

export interface IssuedSession {
  user: UserView;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface MeView extends UserView {
  permissions: Permission[];
}

const INVALID_CREDENTIALS = 'ایمیل یا رمز عبور نادرست است.';
const INVALID_SESSION = 'نشست شما معتبر نیست. لطفاً دوباره وارد شوید.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly rbac: RbacService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterInput, meta: RequestMeta): Promise<IssuedSession> {
    const user = await this.users.create({
      email: input.email,
      fullName: input.fullName,
      mobile: input.mobile,
      passwordHash: await this.hasher.hash(input.password),
    });
    await this.audit.record({
      action: 'auth.register',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      meta,
    });
    return this.startSession(user, meta);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
    const credentials = await this.users.findCredentialsByEmail(input.email);
    const valid = credentials
      ? await this.hasher.verify(credentials.passwordHash, input.password)
      : await this.hasher.verifyAgainstDummy(input.password);

    if (!credentials || !valid) {
      await this.audit.record({
        action: 'auth.login_failed',
        actorId: credentials?.id ?? null,
        metadata: { reason: credentials ? 'bad_password' : 'unknown_email' },
        meta,
      });
      throw new UnauthenticatedError(INVALID_CREDENTIALS);
    }
    if (credentials.status !== 'ACTIVE') {
      await this.audit.record({
        action: 'auth.login_failed',
        actorId: credentials.id,
        metadata: { reason: 'suspended' },
        meta,
      });
      throw new ForbiddenError('حساب کاربری شما غیرفعال است. با پشتیبانی تماس بگیرید.');
    }

    await this.users.markLoggedIn(credentials.id);
    const user = await this.users.findById(credentials.id);
    await this.audit.record({ action: 'auth.login_succeeded', actorId: user.id, meta });
    return this.startSession(user, meta);
  }

  /**
   * Rotates a refresh token. A token that was already used (revoked) signals theft:
   * the whole session family is revoked and the caller must sign in again.
   */
  async refresh(presented: string | undefined, meta: RequestMeta): Promise<IssuedSession> {
    if (!presented) throw new UnauthenticatedError(INVALID_SESSION);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(presented) },
    });
    if (!record) throw new UnauthenticatedError(INVALID_SESSION);

    if (record.revokedAt) {
      await this.revokeFamily(record.familyId);
      await this.audit.record({
        action: 'auth.refresh_reuse_detected',
        actorId: record.userId,
        entityType: 'session',
        entityId: record.familyId,
        meta,
      });
      throw new UnauthenticatedError(INVALID_SESSION);
    }
    if (record.expiresAt <= new Date()) throw new UnauthenticatedError(INVALID_SESSION);

    const user = await this.users.findById(record.userId);
    if (user.status !== 'ACTIVE') {
      await this.revokeFamily(record.familyId);
      throw new UnauthenticatedError(INVALID_SESSION);
    }

    const next = this.newRefreshToken();
    const nextId = randomUUID();
    // Conditional revoke closes the race where the same token is refreshed twice concurrently.
    const consumed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: nextId },
      });
      if (count !== 1) return false;
      await tx.refreshToken.create({
        data: {
          id: nextId,
          userId: record.userId,
          familyId: record.familyId,
          tokenHash: next.hash,
          expiresAt: next.expiresAt,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      return true;
    });
    if (!consumed) {
      await this.revokeFamily(record.familyId);
      throw new UnauthenticatedError(INVALID_SESSION);
    }

    return this.issue(user, record.familyId, next);
  }

  /** Revokes the session family of the presented refresh token (idempotent). */
  async logout(
    presented: string | undefined,
    actorId: string | null,
    meta: RequestMeta,
  ): Promise<void> {
    if (!presented) return;
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(presented) },
      select: { familyId: true, userId: true },
    });
    if (!record) return;
    await this.revokeFamily(record.familyId);
    await this.audit.record({
      action: 'auth.logout',
      actorId: actorId ?? record.userId,
      entityType: 'session',
      entityId: record.familyId,
      meta,
    });
  }

  async me(userId: string): Promise<MeView> {
    const user = await this.users.findById(userId);
    const permissions = await this.rbac.permissionsFor(user.roles);
    return { ...user, permissions: [...permissions].sort() };
  }

  private async startSession(user: UserView, meta: RequestMeta): Promise<IssuedSession> {
    const familyId = randomUUID();
    const token = this.newRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: token.hash,
        expiresAt: token.expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return this.issue(user, familyId, token);
  }

  private async issue(
    user: UserView,
    familyId: string,
    refresh: { value: string; expiresAt: Date },
  ): Promise<IssuedSession> {
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      sid: familyId,
      roles: user.roles,
    });
    return {
      user,
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + this.tokens.accessTtlSeconds * 1000),
      refreshToken: refresh.value,
      refreshTokenExpiresAt: refresh.expiresAt,
    };
  }

  private newRefreshToken() {
    const value = this.tokens.generateRefreshToken();
    return {
      value,
      hash: this.tokens.hashRefreshToken(value),
      expiresAt: new Date(Date.now() + this.tokens.refreshTtlMs),
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
