import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { requestIdOf } from './request-id';

/** Transport details passed explicitly from controllers to services (for audit logging). */
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export function requestMetaOf(req: Request): RequestMeta {
  const userAgent = req.headers['user-agent'];
  return {
    ip: req.ip,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : undefined,
    requestId: requestIdOf(req),
  };
}

/** `@Meta() meta: RequestMeta` */
export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta =>
  requestMetaOf(ctx.switchToHttp().getRequest<Request>()),
);
