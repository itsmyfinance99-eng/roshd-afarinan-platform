import { routeOf, scrub } from '@roshd/types';

/**
 * Port for error reporting (ST-25.08). The log adapter writes structured error records now; a
 * hosted service (Sentry-compatible or similar) can replace it behind this port once one is
 * chosen. Reports never carry request bodies, headers, cookies or query strings, and personal
 * data is scrubbed from messages before an adapter sees them.
 */
export const ERROR_REPORTER = Symbol('ERROR_REPORTER');

export interface ErrorContext {
  /** `http` for failed requests, `process` for unhandled rejections and crashes. */
  source: 'http' | 'process';
  requestId?: string;
  method?: string;
  /** Route pattern (e.g. /api/v1/tickets/:id) or path without its query string. */
  route?: string;
  statusCode?: number;
  userId?: string;
}

export interface ErrorReport {
  name: string;
  message: string;
  /** First stack frames only. */
  stack?: string;
  context: ErrorContext;
  at: string;
}

export interface ErrorReporter {
  readonly driver: string;
  /** Must never throw: reporting is best-effort and must not break the failing request. */
  report(error: unknown, context: ErrorContext): void;
}

const MAX_MESSAGE = 500;
const MAX_STACK_LINES = 12;

/** Normalises anything thrown into a bounded, scrubbed report. */
export function toErrorReport(
  error: unknown,
  context: ErrorContext,
  now = new Date(),
): ErrorReport {
  const err = error instanceof Error ? error : undefined;
  const message = err ? err.message : typeof error === 'string' ? error : 'Non-error value thrown';
  const stack = err?.stack
    ?.split('\n')
    .slice(1, MAX_STACK_LINES + 1)
    .map((line) => line.trim())
    .join('\n');
  return {
    name: err?.name ?? 'Error',
    message: scrub(message).slice(0, MAX_MESSAGE),
    ...(stack ? { stack: scrub(stack) } : {}),
    context: { ...context, route: context.route ? routeOf(context.route) : undefined },
    at: now.toISOString(),
  };
}
