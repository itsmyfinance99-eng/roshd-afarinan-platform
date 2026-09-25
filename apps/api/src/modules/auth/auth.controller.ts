import { Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
} from '@roshd/validation';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ForbiddenError } from '../../common/errors/app-exception';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody } from '../../common/http/zod';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { CurrentUser, principalOf, type Principal } from '../rbac/principal';
import { StrictRateLimit } from '../../common/http/strict-rate-limit';
import {
  clearAuthCookies,
  cookieValue,
  passesCsrfCheck,
  REFRESH_COOKIE,
  setAuthCookies,
  wantsTokenTransport,
} from './auth-cookies';
import { AuthService, type IssuedSession, type MeView } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @StrictRateLimit()
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  async register(
    @ZodBody(registerSchema) body: RegisterInput,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(req, res, await this.auth.register(body, meta));
  }

  @Public()
  @StrictRateLimit()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(
    @ZodBody(loginSchema) body: LoginInput,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(req, res, await this.auth.login(body, meta));
  }

  @Public()
  @StrictRateLimit()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  async refresh(
    @ZodBody(refreshSchema) body: RefreshInput,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = body.refreshToken ?? this.refreshCookie(req);
    try {
      return this.respond(req, res, await this.auth.refresh(presented, meta));
    } catch (error) {
      if (!body.refreshToken) clearAuthCookies(res, this.config);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @ZodBody(refreshSchema) body: RefreshInput,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    const presented = body.refreshToken ?? this.refreshCookie(req);
    await this.auth.logout(presented, principalOf(req)?.userId ?? null, meta);
    clearAuthCookies(res, this.config);
    return null;
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user with roles and effective permissions' })
  me(@CurrentUser() user: Principal): Promise<MeView> {
    return this.auth.me(user.userId);
  }

  /** Reads the refresh cookie; cookie-based calls must pass the CSRF header check. */
  private refreshCookie(req: Request): string | undefined {
    const value = cookieValue(req, REFRESH_COOKIE);
    if (value && !passesCsrfCheck(req)) throw new ForbiddenError();
    return value;
  }

  /** Browsers get httpOnly cookies only; token-transport clients get tokens in the body. */
  private respond(req: Request, res: Response, session: IssuedSession) {
    if (wantsTokenTransport(req)) return session;
    setAuthCookies(res, this.config, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshTokenExpiresAt,
    });
    return { user: session.user, accessTokenExpiresAt: session.accessTokenExpiresAt };
  }
}
