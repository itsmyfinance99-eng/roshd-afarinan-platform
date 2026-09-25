import { type ExecutionContext, SetMetadata } from '@nestjs/common';

export const AUTH_THROTTLED = 'roshd:auth-throttled';

/** Applies the stricter `auth` throttler (AUTH_THROTTLE_LIMIT per THROTTLE_TTL_MS per IP). */
export const AuthRateLimit = () => SetMetadata(AUTH_THROTTLED, true);

/** `skipIf` for the `auth` throttler: only routes marked with @AuthRateLimit() are counted. */
export function skipUnlessAuthThrottled(context: ExecutionContext): boolean {
  const handler = context.getHandler();
  return Reflect.getMetadata(AUTH_THROTTLED, handler) !== true;
}
