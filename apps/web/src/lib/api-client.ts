import {
  ERROR_MESSAGES_FA,
  type ApiError,
  type ApiErrorDetail,
  type ErrorCode,
} from '@roshd/types';

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      code: ErrorCode | 'NETWORK_ERROR';
      message: string;
      details: ApiErrorDetail[];
    };

const NETWORK_MESSAGE = 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.';

/**
 * Browser-side call to the API through the same-origin `/api/*` rewrite (ADR-0002).
 * Always sends the CSRF header required for cookie-authenticated mutations.
 */
export async function apiFetch<T>(
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch {
    return { ok: false, status: 0, code: 'NETWORK_ERROR', message: NETWORK_MESSAGE, details: [] };
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok) return { ok: true, data: (payload as { data: T }).data };

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
