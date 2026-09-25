import {
  ERROR_MESSAGES_FA,
  type ApiError,
  type ApiErrorDetail,
  type ApiMeta,
  type ErrorCode,
} from '@roshd/types';

export type ApiResult<T> =
  | { ok: true; data: T; meta?: ApiMeta }
  | {
      ok: false;
      status: number;
      code: ErrorCode | 'NETWORK_ERROR';
      message: string;
      details: ApiErrorDetail[];
    };

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

const NETWORK_MESSAGE = 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.';

/** One refresh at a time: concurrent 401s wait for the same rotation. */
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: '{}',
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function send(path: string, method: Method, body: unknown, signal?: AbortSignal) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  return fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      // The browser sets the multipart boundary itself for FormData bodies.
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    signal,
  });
}

/**
 * Browser-side call to the API through the same-origin `/api/*` rewrite (ADR-0002).
 * Sends the CSRF header; on 401 it rotates the session once (refresh cookie) and retries.
 */
export async function apiFetch<T>(
  path: string,
  init: { method?: Method; body?: unknown; signal?: AbortSignal; retryAuth?: boolean } = {},
): Promise<ApiResult<T>> {
  const method = init.method ?? 'GET';
  let response: Response;
  try {
    response = await send(path, method, init.body, init.signal);
    if (response.status === 401 && init.retryAuth !== false && !path.startsWith('/auth/')) {
      if (await refreshSession()) response = await send(path, method, init.body, init.signal);
    }
  } catch {
    return { ok: false, status: 0, code: 'NETWORK_ERROR', message: NETWORK_MESSAGE, details: [] };
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    const envelope = payload as { data: T; meta?: ApiMeta } | undefined;
    return { ok: true, data: envelope?.data as T, meta: envelope?.meta };
  }

  const error = (payload as ApiError | undefined)?.error;
  const code: ErrorCode =
    error?.code ?? (response.status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
  return {
    ok: false,
    status: response.status,
    code,
    message: error?.message ?? ERROR_MESSAGES_FA[code],
    details: error?.details ?? [],
  };
}
