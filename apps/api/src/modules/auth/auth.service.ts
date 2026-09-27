import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Permission } from '@roshd/types';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@roshd/validation';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import {
  AppException,
  BadRequestError,
  ForbiddenError,
  UnauthenticatedError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from '../notifications/ports/notification-provider';
import { RbacService } from '../rbac/rbac.service';
import { UsersService, type UserView } from '../users/users.service';
import { EmailVerificationService } from './email-verification.service';
import { isLocked, type LockoutPolicy, minutesLeft } from './login-lockout';
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
/**
 * How long after a rotation the previous token may still be presented. Two tabs, or one retried
 * request, race within milliseconds; theft replayed later still ends the session (ST-26.08, F-05).
 */
const REFRESH_REPLAY_MS = 20_000;

const INVALID_RESET_LINK = 'لینک بازیابی نامعتبر یا منقضی است. دوباره درخواست دهید.';

/** 429 for a locked account; the password reset link is the way back in before the lock ends. */
function lockedError(lockedUntil: Date, now: Date): AppException {
  const minutes = minutesLeft(lockedUntil, now).toLocaleString('fa-IR');
  return new AppException(
    'RATE_LIMITED',
    `به‌دلیل تلاش‌های ناموفق پیاپی، ورود به این حساب تا ${minutes} دقیقه دیگر ممکن نیست. می‌توانید رمز عبور را بازیابی کنید.`,
  );
}

/** Access tokens signed at or before this instant are rejected (millisecond precision). */
const revocationInstant = () => new Date();

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly rbac: RbacService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly verification: EmailVerificationService,
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
    await this.verification.sendAfterRegistration(user, meta);
    return this.startSession(user, meta);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
    const now = new Date();
    const credentials = await this.users.findCredentialsByEmail(input.email);
    // A locked account is refused before the password is checked, so guesses gain nothing.
    if (credentials && isLocked(credentials.lockedUntil, now)) {
      await this.audit.record({
        action: 'auth.login_failed',
        actorId: credentials.id,
        metadata: { reason: 'locked' },
        meta,
      });
      throw lockedError(credentials.lockedUntil as Date, now);
    }
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
      if (credentials) {
        const lockedUntil = await this.users.recordLoginFailure(
          credentials.id,
          this.lockoutPolicy(),
          now,
        );
        if (lockedUntil) {
          await this.audit.record({
            action: 'auth.account_locked',
            actorId: credentials.id,
            entityType: 'user',
            entityId: credentials.id,
            metadata: { until: lockedUntil.toISOString() },
            meta,
          });
        }
      }
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

  private lockoutPolicy(): LockoutPolicy {
    return {
      maxFailures: this.config.LOGIN_MAX_FAILURES,
      lockMs: this.config.LOGIN_LOCK_MINUTES * 60_000,
    };
  }

  /**
   * Rotates a refresh token. A token that was already used (revoked) signals theft:
   * the whole session family is revoked and the caller must sign in again.
   */
  async refresh(presented: string | undefined, meta: RequestMeta): Promise<IssuedSession> {
    if (!presented) throw new UnauthenticatedError(INVALID_SESSION);
    const now = new Date();
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(presented) },
    });
    if (!record) throw new UnauthenticatedError(INVALID_SESSION);

    if (record.revokedAt) {
      // Two tabs (or a retried request) can present the same token at almost the same moment.
      // Inside a short window the rotation is simply replayed: the successor that the first
      // caller received is returned again, instead of ending the session (ST-26.08, F-05).
      const replay = await this.replayRotation(record, meta, now);
      if (replay) return replay;

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

    const account = await this.users.findCredentialsById(record.userId);
    // Suspended accounts, and sessions older than a revocation (password change or reset,
    // sign out everywhere, suspension), never come back, even after reactivation.
    if (
      !account ||
      account.status !== 'ACTIVE' ||
      (account.sessionsRevokedAt !== null && record.createdAt <= account.sessionsRevokedAt)
    ) {
      await this.revokeFamily(record.familyId);
      throw new UnauthenticatedError(INVALID_SESSION);
    }
    const rotated = await this.rotate(record, meta);
    if (rotated) return rotated;

    // Another caller consumed this very row a moment ago: the same race as above, seen from the
    // losing side. Replay its rotation instead of ending the session (ST-26.08, finding F-05).
    const consumed = await this.prisma.refreshToken.findUnique({
      where: { id: record.id },
      select: { id: true, familyId: true, userId: true, revokedAt: true, replacedById: true },
    });
    const replay = consumed && (await this.replayRotation(consumed, meta, new Date()));
    if (replay) return replay;

    await this.revokeFamily(record.familyId);
    throw new UnauthenticatedError(INVALID_SESSION);
  }

  /**
   * Replaces one refresh token with its successor inside a transaction and issues a session for
   * it. Returns undefined when another caller consumed the same row first.
   */
  private async rotate(
    record: { id: string; familyId: string; userId: string },
    meta: RequestMeta,
  ): Promise<IssuedSession | undefined> {
    const user = await this.users.findById(record.userId);
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
    return consumed ? this.issue(user, record.familyId, next) : undefined;
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

  // ─────────────────────────────── password & sessions ───────────────────────────────

  /**
   * Sends a one-time reset link. The response never reveals whether the email exists; earlier
   * unused links of the account stop working.
   */
  async forgotPassword(input: ForgotPasswordInput, meta: RequestMeta): Promise<void> {
    const account = await this.users.findCredentialsByEmail(input.email);
    if (!account || account.status !== 'ACTIVE') return;

    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: account.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: account.id,
          tokenHash: this.tokens.hashRefreshToken(token),
          expiresAt: new Date(now.getTime() + this.config.PASSWORD_RESET_TTL_MINUTES * 60_000),
          requestedIp: meta.ip,
        },
      }),
    ]);
    await this.audit.record({
      action: 'auth.password_reset_requested',
      actorId: account.id,
      entityType: 'user',
      entityId: account.id,
      meta,
    });
    await this.notify(
      input.email,
      'auth.password-reset',
      {
        resetUrl: `${this.config.WEB_BASE_URL}/reset-password?token=${token}`,
        expiresInMinutes: this.config.PASSWORD_RESET_TTL_MINUTES,
      },
      meta,
    );
  }

  /** Consumes a reset link: sets the new password and ends every session of the account. */
  async resetPassword(input: ResetPasswordInput, meta: RequestMeta): Promise<void> {
    const now = new Date();
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(input.token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
    if (!record || record.usedAt || record.expiresAt <= now) {
      throw new BadRequestError(INVALID_RESET_LINK);
    }
    // Single use even under concurrent submissions.
    const { count } = await this.prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    });
    const account = await this.users.findCredentialsById(record.userId);
    if (count !== 1 || !account || account.status !== 'ACTIVE') {
      throw new BadRequestError(INVALID_RESET_LINK);
    }
    await this.users.setPassword(
      account.id,
      await this.hasher.hash(input.password),
      revocationInstant(),
    );
    await this.revokeAllRefreshTokens(account.id);
    // The reset link reached the mailbox, which proves the address as well.
    await this.users.markEmailVerified(account.id);
    await this.audit.record({
      action: 'auth.password_reset',
      actorId: account.id,
      entityType: 'user',
      entityId: account.id,
      meta,
    });
    await this.notify(account.email, 'auth.password-changed', {}, meta);
  }

  /**
   * Changes the password of the signed-in user. Every other session ends; the current device
   * receives a fresh session so it stays signed in.
   */
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const account = await this.users.findCredentialsById(userId);
    if (!account) throw new UnauthenticatedError();
    if (!(await this.hasher.verify(account.passwordHash, input.currentPassword))) {
      await this.audit.record({
        action: 'auth.password_change_failed',
        actorId: userId,
        entityType: 'user',
        entityId: userId,
        meta,
      });
      throw new ValidationFailedError([
        { path: 'currentPassword', message: 'رمز فعلی درست نیست.' },
      ]);
    }
    await this.users.setPassword(
      userId,
      await this.hasher.hash(input.newPassword),
      revocationInstant(),
    );
    await this.revokeAllRefreshTokens(userId);
    await this.audit.record({
      action: 'auth.password_changed',
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      meta,
    });
    await this.notify(account.email, 'auth.password-changed', {}, meta);
    return this.startSession(await this.users.findById(userId), meta);
  }

  /** Ends every session of the user, including the current one. */
  async logoutAll(userId: string, meta: RequestMeta): Promise<void> {
    await this.users.revokeSessions(userId, revocationInstant());
    await this.revokeAllRefreshTokens(userId);
    await this.audit.record({
      action: 'auth.logout_all',
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      meta,
    });
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Delivery problems never break the auth flow; they are logged without the recipient. */
  private async notify(
    to: string,
    template: string,
    data: Record<string, string | number>,
    meta: RequestMeta,
  ): Promise<void> {
    try {
      await this.notifications.send({ channel: 'email', to, template, data });
    } catch (error) {
      this.logger.warn(
        { err: error, requestId: meta.requestId, template },
        'auth notification failed',
      );
    }
  }

  /**
   * A token rotated moments ago is a race between the user's own tabs, not theft. Within
   * REFRESH_REPLAY_MS the successor is still active, so a fresh access token is issued for it
   * and the session survives. Outside the window, or when the successor is already gone, the
   * caller falls through to reuse detection.
   */
  private async replayRotation(
    record: {
      id: string;
      familyId: string;
      revokedAt: Date | null;
      replacedById: string | null;
      userId: string;
    },
    meta: RequestMeta,
    now: Date,
  ): Promise<IssuedSession | undefined> {
    if (!record.revokedAt || !record.replacedById) return undefined;
    if (now.getTime() - record.revokedAt.getTime() > REFRESH_REPLAY_MS) return undefined;
    const successor = await this.prisma.refreshToken.findFirst({
      where: { id: record.replacedById, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, familyId: true, userId: true, createdAt: true },
    });
    if (!successor) return undefined;
    // Rotate from the successor instead, so the family keeps exactly one active token and this
    // caller receives a usable pair.
    return this.rotate(successor, meta).catch(() => undefined);
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
