import { canonicalHash, canonicalJson } from '../../../common/json/canonical-json';

export { canonicalJson };

/** SHA-256 (hex) of the canonical JSON of a calculation input (ADR-0009 §6). */
export function inputHash(input: unknown): string {
  return canonicalHash(input);
}
