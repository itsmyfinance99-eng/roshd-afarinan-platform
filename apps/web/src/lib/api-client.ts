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

export type DownloadResult =
  | { ok: true; blob: Blob; fileName: string; rows: number | null }
  | { ok: false; status: number; message: string };

/** File name from `Content-Disposition` (plain `filename="…"` form used by the API). */
function fileNameOf(response: Response, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '');
  return match?.[1] ?? fallback;
}

/**
 * GET a file (e.g. a CSV export) with the same session refresh as `apiFetch`; errors still
 * arrive as the JSON envelope and are mapped to a Persian message.
 */
export async function apiDownload(
  path: string,
  fallbackName = 'download',
): Promise<DownloadResult> {
  let response: Response;
  try {
    response = await send(path, 'GET', undefined);
    if (response.status === 401 && (await refreshSession())) {
      response = await send(path, 'GET', undefined);
    }
  } catch {
    return { ok: false, status: 0, message: NETWORK_MESSAGE };
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as ApiError | undefined;
    const code: ErrorCode =
      payload?.error?.code ?? (response.status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    return {
      ok: false,
      status: response.status,
      message: payload?.error?.message ?? ERROR_MESSAGES_FA[code],
    };
  }
  const rows = Number(response.headers.get('X-Export-Rows'));
  return {
    ok: true,
    blob: await response.blob(),
    fileName: fileNameOf(response, fallbackName),
    rows: Number.isFinite(rows) && response.headers.has('X-Export-Rows') ? rows : null,
  };
}

/** Hands a downloaded blob to the browser as a file. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
