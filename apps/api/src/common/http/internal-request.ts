import { createHash, timingSafeEqual } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Header carrying INTERNAL_API_TOKEN on server-to-server calls from the web app. */
export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * True for read-only requests from the web server (server-side rendering) that carry the shared
 * internal token. They all come from one address, so they must not share the public per-IP
 * rate limit with real visitors. Mutations are never exempt, even with the token.
 */
export function isInternalRequest(context: ExecutionContext, token: string | undefined): boolean {
  if (!token) return false;
  const req = context.switchToHttp().getRequest<Request>();
  if (!SAFE_METHODS.has(req.method)) return false;
  const received = req.headers[INTERNAL_TOKEN_HEADER];
  if (typeof received !== 'string' || received.length === 0) return false;
  return timingSafeEqual(digest(received), digest(token));
}
