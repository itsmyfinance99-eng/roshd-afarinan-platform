/**
 * Per-account login lockout (ST-25.10): complements the per-IP rate limit, which a distributed
 * guessing attack spreads across many addresses. After `maxFailures` consecutive wrong
 * passwords the account refuses sign-in for `lockMs`; a success or a password reset clears it.
 */
export interface LockoutPolicy {
  maxFailures: number;
  lockMs: number;
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil > now;
}

/** Whole minutes left (at least 1) for the user-facing message. */
export function minutesLeft(lockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}
