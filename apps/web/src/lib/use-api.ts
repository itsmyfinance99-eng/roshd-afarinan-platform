'use client';

import type { ApiMeta } from '@roshd/types';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api-client';

export type ApiState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string; httpStatus: number }
  | { status: 'success'; data: T; meta?: ApiMeta };

/** GET with loading / error / success states and a reload() for retry buttons. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void apiFetch<T>(path, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'success', data: result.data, meta: result.meta }
          : { status: 'error', message: result.message, httpStatus: result.status },
      );
    });
    return () => controller.abort();
  }, [path, version]);

  /** `silent` keeps the current data on screen while refetching (e.g. after a successful edit). */
  const reload = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) setState({ status: 'loading' });
    setVersion((v) => v + 1);
  }, []);

  return { state, reload };
}
