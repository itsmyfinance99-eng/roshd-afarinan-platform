'use client';

import { useSyncExternalStore } from 'react';

/** Name of the non-secret session indicator cookie set by the API (see auth-cookies.ts). */
export const SESSION_HINT_COOKIE = 'ra_session';

function hasSessionHint(): boolean {
  return document.cookie.split('; ').some((c) => c === `${SESSION_HINT_COOKIE}=1`);
}

const listeners = new Set<() => void>();

/** Call after login/logout so header links update immediately. */
export function notifySessionChange(): void {
  for (const listener of listeners) listener();
}

/** True when a session probably exists (UX only — the API always authorizes). */
export function useSessionHint(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hasSessionHint,
    () => false,
  );
}
