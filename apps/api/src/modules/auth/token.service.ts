import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@roshd/types';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  /** Informational for clients; authorization always re-reads roles from the database. */
  roles: Role[];
  /** Issued-at (seconds), set by the signer. */
  iat?: number;
  /** Issued-at in milliseconds, so revocation is exact within the same second. */
  iatMs?: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get accessTtlSeconds(): number {
    return this.config.JWT_ACCESS_TTL_SECONDS;
  }

  get refreshTtlMs(): number {
    return this.config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(
      { ...claims, iatMs: Date.now() },
      {
        secret: this.config.JWT_ACCESS_SECRET,
        expiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
        algorithm: 'HS256',
      },
    );
  }

  /** Returns the claims, or undefined for any invalid/expired/tampered token. */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims | undefined> {
    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
      });
      return typeof claims.sub === 'string' && typeof claims.sid === 'string' ? claims : undefined;
    } catch {
      return undefined;
    }
  }

  /** 256-bit opaque refresh token; only its hash is ever stored. */
  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
