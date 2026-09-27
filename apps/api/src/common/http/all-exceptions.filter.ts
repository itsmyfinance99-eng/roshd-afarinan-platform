import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ERROR_MESSAGES_FA, type ApiError, type ErrorCode } from '@roshd/types';
import type { Request, Response } from 'express';
import { AppException, statusForCode } from '../errors/app-exception';
import { ERROR_REPORTER, type ErrorReporter } from '../../modules/monitoring/ports/error-reporter';
import { principalOf } from '../../modules/rbac/principal';
import { requestIdOf } from './request-id';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Prisma and driver codes that mean "the database is unreachable or saturated", not a bug. */
const UNAVAILABLE_CODES = new Set([
  'P1001', // cannot reach the database server
  'P1002', // database server timed out
  'P1008', // operation timed out
  'P1017', // server closed the connection
  'P2024', // timed out fetching a connection from the pool
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  '57014', // PostgreSQL: statement cancelled (statement_timeout)
]);

/** Timeouts surface as plain errors from the driver, so the message is checked as well. */
const UNAVAILABLE_MESSAGES =
  /timed out|timeout|connection terminated|connection refused|unable to start a transaction|connection pool|too many clients/i;

/**
 * Prisma errors are matched structurally so this filter does not depend on the ORM.
 * Database outages and pool exhaustion become 503, not 500 (ST-26.05, finding F-13): they are
 * retryable infrastructure states, and reporting them as bugs floods the error reporter.
 */
export function unavailableOrKnownCode(exception: unknown): ErrorCode | undefined {
  const { code, name, message } = (exception ?? {}) as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
  };
  if (typeof code === 'string' && UNAVAILABLE_CODES.has(code)) return 'SERVICE_UNAVAILABLE';
  if (typeof name === 'string' && name.startsWith('PrismaClient')) {
    if (code === 'P2002') return 'CONFLICT';
    if (code === 'P2025') return 'NOT_FOUND';
  }
  // The driver reports a pool or connection timeout as a plain Error, so the message decides.
  if (typeof message === 'string' && UNAVAILABLE_MESSAGES.test(message)) {
    return 'SERVICE_UNAVAILABLE';
  }
  return undefined;
}

/** Body-parser failure types (http-errors `type`) and the code each one really means. */
const BODY_ERROR_CODES: Record<string, ErrorCode> = {
  'entity.too.large': 'PAYLOAD_TOO_LARGE',
  'entity.parse.failed': 'BAD_REQUEST',
  'entity.verify.failed': 'BAD_REQUEST',
  'request.aborted': 'BAD_REQUEST',
  'request.size.invalid': 'BAD_REQUEST',
  'stream.encoding.set': 'BAD_REQUEST',
  'parameters.too.many': 'BAD_REQUEST',
  'charset.unsupported': 'UNSUPPORTED_MEDIA_TYPE',
  'encoding.unsupported': 'UNSUPPORTED_MEDIA_TYPE',
};

/**
 * Malformed, oversized or wrongly encoded bodies are client mistakes. They arrive as
 * `http-errors` objects (a 4xx `status` plus a `type`) and used to fall through to 500, which
 * let anyone raise server-error alerts at will (ST-26.05, finding F-10).
 */
function bodyErrorCode(exception: unknown): ErrorCode | undefined {
  const { type, status, statusCode } = (exception ?? {}) as {
    type?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  if (typeof type === 'string' && BODY_ERROR_CODES[type]) return BODY_ERROR_CODES[type];
  const httpStatus = typeof status === 'number' ? status : statusCode;
  if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
    return CODE_BY_STATUS[httpStatus] ?? 'BAD_REQUEST';
  }
  return undefined;
}

/**
 * Converts every thrown value into the standard error envelope. Never leaks internals; 5xx
 * errors go to the ErrorReporter with the request id so a user's error code leads to the log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = requestIdOf(req);

    let code: ErrorCode;
    let message: string;
    let details: ApiError['error']['details'];

    if (exception instanceof AppException) {
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      code = CODE_BY_STATUS[exception.getStatus()] ?? 'INTERNAL_ERROR';
      message = ERROR_MESSAGES_FA[code];
    } else {
      code = unavailableOrKnownCode(exception) ?? bodyErrorCode(exception) ?? 'INTERNAL_ERROR';
      message = ERROR_MESSAGES_FA[code];
    }

    const status = statusForCode(code);
    if (status >= 500) {
      this.reporter.report(exception, {
        source: 'http',
        requestId,
        method: req.method,
        route: (req.route as { path?: string } | undefined)?.path ?? req.originalUrl,
        statusCode: status,
        userId: principalOf(req)?.userId,
      });
    }

    const body: ApiError = { error: { code, message, requestId } };
    if (details?.length) body.error.details = details;
    res.status(status).json(body);
  }
}
