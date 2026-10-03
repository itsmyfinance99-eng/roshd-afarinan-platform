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

/**
 * True for an `EngineInputError`, also when it comes from another copy of the engine module (e.g.
 * CommonJS and ESM builds loaded side by side), where `instanceof` would fail.
 */
export function isEngineInputError(error: unknown): error is EngineInputError {
  return (
    error instanceof Error &&
    error.name === 'EngineInputError' &&
    typeof (error as Partial<EngineInputError>).code === 'string' &&
    typeof (error as Partial<EngineInputError>).field === 'string'
  );
}
