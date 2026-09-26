import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { VerifyEmailInput } from '@roshd/validation';
import {
  AppException,
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';

const INVALID_LINK = 'لینک تأیید نامعتبر یا منقضی است. از صفحه حساب کاربری لینک تازه بگیرید.';

/** A new link may be requested once a minute per account (the per-IP limit also applies). */
export const RESEND_COOLDOWN_MS = 60_000;

/**
 * Email verification (ST-25.11): one-time, expiring links; only the SHA-256 of a token is
 * stored. Delivery goes through the NotificationProvider port (log adapter until OQ-08).
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly inbox: NotificationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Sends the first link after registration; best-effort, never fails the registration. */
  async sendAfterRegistration(user: { id: string; email: string }, meta: RequestMeta) {
    try {
      await this.issue(user, meta);
    } catch (error) {
      // The account exists either way; the user can ask for a new link from the profile.
      this.logger.warn({ err: error, requestId: meta.requestId }, 'verification email not issued');
    }
  }

  /** New link for the signed-in user; refused when already verified or asked too often. */
  async resend(userId: string, meta: RequestMeta, now = new Date()): Promise<void> {
    const user = await this.users.findById(userId).catch(() => undefined);
    if (!user) throw new NotFoundError();
    if (user.emailVerifiedAt) throw new ConflictError('ایمیل شما قبلاً تأیید شده است.');
    const last = await this.prisma.emailVerificationToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last && now.getTime() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new AppException(
        'RATE_LIMITED',
        'لینک تأیید همین حالا ارسال شد. یک دقیقه بعد دوباره تلاش کنید.',
      );
    }
    await this.issue(user, meta, now);
  }

  /** Consumes a link (single use even under concurrent clicks) and marks the email verified. */
  async verify(input: VerifyEmailInput, meta: RequestMeta, now = new Date()): Promise<void> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(input.token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
    if (!record || record.usedAt || record.expiresAt <= now) {
      throw new BadRequestError(INVALID_LINK);
    }
    const { count } = await this.prisma.emailVerificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    });
    if (count !== 1) throw new BadRequestError(INVALID_LINK);

    await this.users.markEmailVerified(record.userId, now);
    // Other outstanding links of the account are no longer needed.
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    });
    await this.audit.record({
      action: 'auth.email_verified',
      actorId: record.userId,
      entityType: 'user',
      entityId: record.userId,
      meta,
    });
  }

  private async issue(user: { id: string; email: string }, meta: RequestMeta, now = new Date()) {
    const token = randomBytes(32).toString('base64url');
    const ttlHours = this.config.EMAIL_VERIFICATION_TTL_HOURS;
    // Only the newest link works.
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: this.tokens.hashRefreshToken(token),
          expiresAt: new Date(now.getTime() + ttlHours * 3_600_000),
          createdAt: now,
        },
      }),
    ]);
    await this.audit.record({
      action: 'auth.email_verification_sent',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      meta,
    });
    await this.inbox.sendEmail(user.email, {
      template: 'auth.verify-email',
      data: {
        verifyUrl: `${this.config.WEB_BASE_URL}/verify-email?token=${token}`,
        expiresInHours: ttlHours,
      },
    });
  }
}
