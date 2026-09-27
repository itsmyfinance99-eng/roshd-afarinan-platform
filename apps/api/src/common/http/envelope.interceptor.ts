import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiSuccess } from '@roshd/types';
import { map, type Observable } from 'rxjs';
import { PageResult } from './page-result';
import { requestIdOf } from './request-id';

export const RAW_RESPONSE = 'roshd:raw-response';
/** Opts a handler out of the `{ data, meta }` envelope (e.g. file streams, redirects). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw || context.getType() !== 'http') return next.handle();

    const requestId = requestIdOf(context.switchToHttp().getRequest());
    return next.handle().pipe(
      map((value: unknown): ApiSuccess<unknown> => {
        if (value instanceof PageResult) {
          return {
            data: value.items,
            meta: {
              requestId,
              page: value.page,
              pageSize: value.pageSize,
              total: value.total,
            },
          };
        }
        return { data: value ?? null, meta: { requestId } };
      }),
    );
  }
}
