import { ERROR_MESSAGES_FA, type ApiErrorDetail, type ErrorCode } from '@roshd/types';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

/**
 * Transport-agnostic application error. Services throw these; the global
 * exception filter turns them into the standard error envelope.
 */
export class AppException extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message ?? ERROR_MESSAGES_FA[code]);
    this.name = 'AppException';
    this.status = statusForCode(code);
  }
}

export class ValidationFailedError extends AppException {
  constructor(details: ApiErrorDetail[], message?: string) {
    super('VALIDATION_FAILED', message, details);
  }
}

export class BadRequestError extends AppException {
  constructor(message?: string) {
    super('BAD_REQUEST', message);
  }
}

export class UnauthenticatedError extends AppException {
  constructor(message?: string) {
    super('UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends AppException {
  constructor(message?: string) {
    super('FORBIDDEN', message);
  }
}

export class NotFoundError extends AppException {
  constructor(message?: string) {
    super('NOT_FOUND', message);
  }
}

export class ConflictError extends AppException {
  constructor(message?: string) {
    super('CONFLICT', message);
  }
}

export class ServiceUnavailableError extends AppException {
  constructor(message?: string, details?: ApiErrorDetail[]) {
    super('SERVICE_UNAVAILABLE', message, details);
  }
}
