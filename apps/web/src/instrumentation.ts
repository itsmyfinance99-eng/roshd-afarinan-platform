import { routeOf, scrub } from '@roshd/types';
import type { Instrumentation } from 'next';

export function register(): void {
  // Nothing to initialise: errors are reported through onRequestError below.
}

/**
 * Server-side rendering and route errors (ST-25.08): one structured JSON line on stderr, collected
 * with the container logs. Messages are scrubbed and the query string is dropped; the digest is
 * what the error page shows to the visitor, so a reported code leads straight to this line.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const err = error instanceof Error ? (error as Error & { digest?: string }) : undefined;
  console.error(
    JSON.stringify({
      level: 'error',
      source: 'web',
      time: new Date().toISOString(),
      digest: err?.digest,
      name: err?.name ?? 'Error',
      message: scrub(err?.message ?? String(error)).slice(0, 500),
      method: request.method,
      route: context.routePath || routeOf(request.path),
      routeType: context.routeType,
      renderSource: context.renderSource,
    }),
  );
};
