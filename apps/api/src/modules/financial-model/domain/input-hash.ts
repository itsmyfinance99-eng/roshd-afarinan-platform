import { createHash } from 'node:crypto';

/**
 * Canonical JSON of a value: object keys sorted, no whitespace, `undefined` properties left out
 * (as `JSON.stringify` does). Two inputs that differ only in key order give the same text.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v ?? null)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 (hex) of the canonical JSON of a calculation input (ADR-0009 §6). */
export function inputHash(input: unknown): string {
  return createHash('sha256').update(canonicalJson(input), 'utf8').digest('hex');
}
