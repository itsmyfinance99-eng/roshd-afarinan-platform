import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface PurgeResult {
  refreshTokens: number;
  passwordResets: number;
  emailVerifications: number;
}

/**
 * Deletes single-use and expired credentials once they can no longer serve any purpose
 * (ST-27.03). Nothing removed them before, so `refresh_tokens` in particular grew with every
 * sign-in for the life of the deployment.
 *
 * A row is kept while it could still explain something: a refresh token is only dropped after
 * both its expiry and the retention window have passed, so reuse detection and the audit trail
 * still cover a recent family. `cutoff` is the instant before which spent rows may go.
 */
@Injectable()
export class TokenRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async purge(cutoff: Date): Promise<PurgeResult> {
    const [refreshTokens, passwordResets, emailVerifications] = await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({
        // Revoked rows are the losing side of a rotation or a reuse response; expired rows can
        // never be presented again. Either way the token itself is dead.
        where: {
          createdAt: { lt: cutoff },
          OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
        },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }],
        },
      }),
      this.prisma.emailVerificationToken.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }],
        },
      }),
    ]);
    return {
      refreshTokens: refreshTokens.count,
      passwordResets: passwordResets.count,
      emailVerifications: emailVerifications.count,
    };
  }
}
