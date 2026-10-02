/**
 * Invalid input that makes a calculation meaningless (e.g. a discount rate of −100 %). The UI maps
 * `code` to a Persian message next to `field`; nothing is guessed or silently corrected.
 */
export class EngineInputError extends Error {
  constructor(
    readonly code: string,
    readonly field: string,
    readonly params: Record<string, string> = {},
  ) {
    super(`${code} (${field})`);
    this.name = 'EngineInputError';
  }
}
