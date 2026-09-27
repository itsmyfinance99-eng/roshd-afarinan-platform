/**
 * Only same-site relative paths are allowed as post-login targets (prevents open redirects).
 *
 * Checking prefixes is not enough: browsers strip control characters and whitespace from URLs,
 * so `/\thost` or `/\nhost` becomes `//host`, and a backslash reads like a slash. The value is
 * therefore rejected when it contains such characters and then resolved against the real origin,
 * which must stay the same (ST-26.02, finding F-12).
 */
const CONTROL_OR_SPACE = /[\x00-\x20\x7f]/;

export function safeNextPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || CONTROL_OR_SPACE.test(value)) return fallback;
  // No origin during server rendering: keep the prefix checks only.
  const origin = typeof window === 'undefined' ? undefined : window.location.origin;
  if (!origin) return value.startsWith('//') || value.startsWith('/\\') ? fallback : value;
  try {
    const target = new URL(value, origin);
    return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : fallback;
  } catch {
    return fallback;
  }
}
