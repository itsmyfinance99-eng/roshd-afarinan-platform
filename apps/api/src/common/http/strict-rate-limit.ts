import { type ExecutionContext, SetMetadata } from '@nestjs/common';

export const STRICT_THROTTLED = 'roshd:strict-throttled';

/**
 * Applies the stricter `strict` throttler (AUTH_THROTTLE_LIMIT per THROTTLE_TTL_MS per IP)
 * to abuse-prone endpoints: login/register/refresh and public form submissions.
 */
export const StrictRateLimit = () => SetMetadata(STRICT_THROTTLED, true);

/** `skipIf` for the `strict` throttler: only routes marked with @StrictRateLimit() are counted. */
export function skipUnlessStrictThrottled(context: ExecutionContext): boolean {
  return Reflect.getMetadata(STRICT_THROTTLED, context.getHandler()) !== true;
}
