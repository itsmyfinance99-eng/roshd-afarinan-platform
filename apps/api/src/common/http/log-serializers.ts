import type { IncomingMessage } from 'node:http';

/**
 * Query strings carry personal data and live credentials: the guest tracking route takes a
 * mobile number, signed download links carry `exp`/`sig`, and search terms are user content.
 * The request log therefore keeps only the path (ST-26.06, finding F-03).
 */
export function logPath(url: string | undefined): string {
  if (!url) return '';
  const [path = '', query] = url.split('?', 2);
  return query === undefined ? path : `${path}?[REDACTED]`;
}

interface LoggedRequest {
  id: unknown;
  method: string | undefined;
  url: string;
  remoteAddress: string | undefined;
  remotePort: number | undefined;
  headers: Record<string, unknown>;
}

/** Headers worth keeping: enough to debug a request, nothing that identifies or authenticates. */
const KEPT_HEADERS = ['host', 'user-agent', 'referer', 'content-type', 'content-length'] as const;

/** Replaces pino-http's default request serializer, which logs the full URL and parsed query. */
export function requestSerializer(req: IncomingMessage & { id?: unknown }): LoggedRequest {
  const headers: Record<string, unknown> = {};
  for (const name of KEPT_HEADERS) {
    const value = req.headers[name];
    if (value !== undefined) headers[name] = name === 'referer' ? logPath(String(value)) : value;
  }
  const socket = req.socket as { remoteAddress?: string; remotePort?: number } | undefined;
  return {
    id: req.id,
    method: req.method,
    url: logPath(req.url),
    remoteAddress: socket?.remoteAddress,
    remotePort: socket?.remotePort,
    headers,
  };
}
