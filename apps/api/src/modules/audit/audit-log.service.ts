import { Injectable } from '@nestjs/common';
import type { ListAuditLogsQuery } from '@roshd/validation';
import { PageResult } from '../../common/http/page-result';
import { tehranDayRange } from '../../common/time/iran-time';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { redactMetadata } from './domain/redact';

export interface AuditLogView {
  id: string;
  action: string;
  actor: { id: string; fullName: string; email: string } | null;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  requestId: string | null;
  createdAt: Date;
}

/** Read side of the audit trail (append-only; there is no update or delete). */
@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async list(query: ListAuditLogsQuery): Promise<PageResult<AuditLogView>> {
    let actorId: string | undefined;
    if (query.actor) {
      const id = await this.users.findIdByEmail(query.actor);
      if (!id) return new PageResult([], query.page, query.pageSize, 0);
      actorId = id;
    }
    const createdAt = tehranDayRange(query.from, query.to);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action
        ? query.action.endsWith('.') || !query.action.includes('.')
          ? { action: { startsWith: query.action } }
          : { action: query.action }
        : {}),
      ...(actorId ? { actorId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          actorId: true,
          entityType: true,
          entityId: true,
          metadata: true,
          ip: true,
          requestId: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actors = await this.users.contactsByIds(
      rows.flatMap((r) => (r.actorId ? [r.actorId] : [])),
    );
    const items = rows.map(({ actorId: id, metadata, ...row }) => {
      const contact = id ? actors.get(id) : undefined;
      return {
        ...row,
        actor: id && contact ? { id, ...contact } : null,
        metadata: redactMetadata(metadata),
      };
    });
    return new PageResult(items, query.page, query.pageSize, total);
  }
}
