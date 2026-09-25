import type { CookieOptions, Request, Response } from 'express';
import type { AppConfig } from '../../config/app-config';

export const ACCESS_COOKIE = 'ra_at';
export const REFRESH_COOKIE = 'ra_rt';
/**
 * Non-secret session indicator (value '1', readable by the web app). It lets the web UI and
 * route proxy know a session exists without exposing any token. Authorization never trusts it.
 */
export const SESSION_HINT_COOKIE = 'ra_session';
/** Refresh cookie is only sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Clients that cannot hold cookies (mobile, partners) send this header to receive tokens in the body. */
export const TOKEN_TRANSPORT_HEADER = 'x-auth-transport';

export function wantsTokenTransport(req: Request): boolean {
  return req.headers[TOKEN_TRANSPORT_HEADER] === 'token';
}

function base(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    domain: config.COOKIE_DOMAIN,
  };
}

export function setAuthCookies(
  res: Response,
  config: AppConfig,
  tokens: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(config),
    path: '/',
    maxAge: config.JWT_ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(config),
    path: REFRESH_COOKIE_PATH,
    expires: tokens.refreshExpiresAt,
  });
  res.cookie(SESSION_HINT_COOKIE, '1', {
    ...base(config),
    httpOnly: false,
    path: '/',
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response, config: AppConfig): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(config), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(config), path: REFRESH_COOKIE_PATH });
  res.clearCookie(SESSION_HINT_COOKIE, { ...base(config), httpOnly: false, path: '/' });
}

export function cookieValue(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests (together with SameSite=Lax):
 * state-changing requests must carry `X-Requested-With: XMLHttpRequest`,
 * which a cross-site form cannot set without a CORS preflight.
 */
export function passesCsrfCheck(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  return req.headers['x-requested-with'] === 'XMLHttpRequest';
}
