import { Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
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
import { EmailVerificationService } from './email-verification.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly verification: EmailVerificationService,
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

  @Public()
  @StrictRateLimit()
  @Post('password/forgot')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Email a one-time reset link (same response whether or not the account exists)',
  })
  async forgotPassword(
    @ZodBody(forgotPasswordSchema) body: ForgotPasswordInput,
    @Meta() meta: RequestMeta,
  ): Promise<{ message: string }> {
    await this.auth.forgotPassword(body, meta);
    return { message: 'اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی رمز ارسال می‌شود.' };
  }

  @Public()
  @StrictRateLimit()
  @Post('password/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set a new password with a reset link; ends every session' })
  async resetPassword(
    @ZodBody(resetPasswordSchema) body: ResetPasswordInput,
    @Meta() meta: RequestMeta,
  ): Promise<null> {
    await this.auth.resetPassword(body, meta);
    return null;
  }

  @Public()
  @StrictRateLimit()
  @Post('email/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm the email address with a one-time verification link' })
  async verifyEmail(
    @ZodBody(verifyEmailSchema) body: VerifyEmailInput,
    @Meta() meta: RequestMeta,
  ): Promise<null> {
    await this.verification.verify(body, meta);
    return null;
  }

  @StrictRateLimit()
  @Post('email/resend')
  @HttpCode(202)
  @ApiOperation({ summary: 'Send a new verification link to the signed-in user (once a minute)' })
  async resendVerification(
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<{ message: string }> {
    await this.verification.resend(user.userId, meta);
    return { message: 'لینک تأیید به ایمیل شما ارسال شد.' };
  }

  @StrictRateLimit()
  @Post('password/change')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Change the password; other sessions end, this device gets a fresh session',
  })
  async changePassword(
    @CurrentUser() user: Principal,
    @ZodBody(changePasswordSchema) body: ChangePasswordInput,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(req, res, await this.auth.changePassword(user.userId, body, meta));
  }

  @Post('logout-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'End every session of the signed-in user (all devices)' })
  async logoutAll(
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    await this.auth.logoutAll(user.userId, meta);
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
