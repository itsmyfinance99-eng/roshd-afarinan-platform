'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during SSR and until hydration completes. Forms keep their submit button disabled
 * until then, so a fast click can never trigger a native submission that would put
 * personal data (name, mobile) into the URL.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
