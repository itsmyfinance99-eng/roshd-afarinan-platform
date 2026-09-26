/** Keys whose values must never be shown, even to auditors. */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|hash|cookie|authorization|otp|signature|sig$|api[-_]?key/i;

export const REDACTED = '[redacted]';

/**
 * Deep copy of audit metadata with secret-like values replaced. Audit events are not supposed
 * to carry secrets; this is defence in depth for the read side.
 */
export function redactMetadata(value: unknown, depth = 0): unknown {
  if (depth > 5) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => redactMetadata(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redactMetadata(v, depth + 1),
      ]),
    );
  }
  return value;
}
