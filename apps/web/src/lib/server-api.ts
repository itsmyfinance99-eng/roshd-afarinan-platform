import 'server-only';
import type { ApiMeta } from '@roshd/types';
import { apiInternalUrl } from './env';

export type ServerResult<T> = { ok: true; data: T; meta?: ApiMeta } | { ok: false; status: number };

/**
 * Server-side GET to the API (server components). Never throws: an unreachable API
 * yields `{ ok: false, status: 0 }` so pages render an error/empty state instead of failing.
 */
export async function serverGet<T>(
  path: string,
  options: { revalidate?: number | false; tags?: string[] } = {},
): Promise<ServerResult<T>> {
  try {
    const response = await fetch(`${apiInternalUrl}/api/v1${path}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: options.revalidate ?? 60, tags: options.tags },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { ok: false, status: response.status };
    const payload = (await response.json()) as { data: T; meta?: ApiMeta };
    return { ok: true, data: payload.data, meta: payload.meta };
  } catch {
    return { ok: false, status: 0 };
  }
}
