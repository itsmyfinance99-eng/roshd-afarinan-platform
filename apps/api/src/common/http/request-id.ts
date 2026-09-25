import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Reuses a well-formed client request ID, otherwise generates a UUID; echoes it in the response. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const id = candidate && SAFE_ID.test(candidate) ? candidate : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/** Reads the request ID assigned by pino-http (`req.id`). */
export function requestIdOf(req: unknown): string {
  const id = (req as { id?: unknown }).id;
  return typeof id === 'string' ? id : typeof id === 'number' ? String(id) : 'unknown';
}
