import type { NextFunction, Request, Response } from 'express';
import { AppException, ForbiddenError } from '../errors/app-exception';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * `Sec-Fetch-Site` values a state-changing request may carry: the site's own pages
 * (`same-origin`) and directly entered URLs or bookmarks (`none`). `cross-site` and
 * `same-site` come from another site, which is exactly a CSRF attempt.
 */
const ALLOWED_SITES = new Set(['same-origin', 'none']);

/**
 * Blocks browser-initiated cross-site state changes (ST-26.02, finding F-02).
 *
 * The `X-Requested-With` check protects cookie-authenticated calls, but public routes such as
 * login and register had no such protection: a form on another site could sign the victim into
 * the attacker's account. Browsers always send `Sec-Fetch-Site` and a page cannot forge it;
 * non-browser clients (mobile, partners) do not send it at all and are unaffected.
 */
export function isCrossSiteRequest(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  const site = req.headers['sec-fetch-site'];
  return typeof site === 'string' && !ALLOWED_SITES.has(site);
}

/**
 * Content types an HTML form can send without a CORS preflight. Nothing here sends them (clients
 * use JSON, uploads use multipart), so refusing them removes the whole cross-site form vector.
 */
const FORM_CONTENT_TYPES = ['application/x-www-form-urlencoded', 'text/plain'];

export function isFormBody(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  const type = req.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
  return type !== undefined && FORM_CONTENT_TYPES.includes(type);
}

export function blockCrossSiteMutations(req: Request, _res: Response, next: NextFunction): void {
  if (isCrossSiteRequest(req)) {
    next(new ForbiddenError('درخواست از یک سایت دیگر پذیرفته نمی‌شود.'));
    return;
  }
  if (isFormBody(req)) {
    next(new AppException('UNSUPPORTED_MEDIA_TYPE', 'قالب درخواست پشتیبانی نمی‌شود.'));
    return;
  }
  next();
}
