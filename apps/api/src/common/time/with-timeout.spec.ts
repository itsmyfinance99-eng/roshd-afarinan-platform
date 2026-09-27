import { describe, expect, it, vi } from 'vitest';
import { TimeoutError, withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('passes a value through and clears its timer', async () => {
    vi.useFakeTimers();
    try {
      const clear = vi.spyOn(globalThis, 'clearTimeout');
      await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
      expect(clear).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with the operation name once the ceiling passes', async () => {
    vi.useFakeTimers();
    try {
      const pending = withTimeout(new Promise<never>(() => undefined), 5000, 'notification send');
      const caught = pending.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(5000);
      const error = await caught;
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as Error).message).toBe('notification send timed out after 5000ms');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the original rejection and normalises a thrown non-error', async () => {
    const cause = new Error('gateway refused');
    await expect(withTimeout(Promise.reject(cause), 1000)).rejects.toBe(cause);
    // A provider outside our code can reject with anything, not only an Error.
    const notAnError = new Promise<never>((_resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the point of the test
      reject('nope');
    });
    await expect(withTimeout(notAnError, 1000)).rejects.toThrow('nope');
  });
});
