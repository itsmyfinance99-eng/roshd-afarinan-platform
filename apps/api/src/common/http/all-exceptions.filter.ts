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

/** Prisma errors are matched structurally so this filter does not depend on the ORM. */
function prismaErrorCode(exception: unknown): ErrorCode | undefined {
  const code = (exception as { code?: unknown })?.code;
  const name = (exception as { name?: unknown })?.name;
  if (name !== 'PrismaClientKnownRequestError' || typeof code !== 'string') return undefined;
  if (code === 'P2002') return 'CONFLICT';
  if (code === 'P2025') return 'NOT_FOUND';
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
      const prisma = prismaErrorCode(exception);
      code = prisma ?? 'INTERNAL_ERROR';
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
