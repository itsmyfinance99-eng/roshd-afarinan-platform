import { Injectable } from '@nestjs/common';
import type { RequestMeta } from '../../common/http/request-meta';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

/** Well-known audit actions. Keep names stable: they are queried by compliance reports. */
export type AuditAction =
  | 'auth.register'
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.refresh_reuse_detected'
  | 'users.roles_changed'
  | (string & {});

export interface AuditEvent {
  action: AuditAction;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  meta?: RequestMeta;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Appends an audit event. Awaited on purpose: security events must not be silently lost. */
  async record(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: event.action,
        actorId: event.actorId ?? null,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: event.metadata,
        ip: event.meta?.ip,
        userAgent: event.meta?.userAgent,
        requestId: event.meta?.requestId,
      },
    });
  }
}
