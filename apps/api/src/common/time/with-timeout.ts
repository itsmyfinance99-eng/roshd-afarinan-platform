/**
 * Bounds an outbound call. Every port that talks to a third party carries a timeout in its
 * contract (ST-26.10, findings I-07 and I-08): without one, a provider that accepts the
 * connection and never answers holds a request — and its database connection — open until the
 * client gives up.
 */
export class TimeoutError extends Error {
  constructor(operation: string, ms: number) {
    super(`${operation} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/** Rejects with a `TimeoutError` when `promise` has not settled within `ms`. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  operation = 'operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(operation, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
