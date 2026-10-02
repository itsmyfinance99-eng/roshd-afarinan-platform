import { Injectable } from '@nestjs/common';
import {
  MAX_ASSUMPTION_TEMPLATES,
  type Assumption,
  type AssumptionTemplateInput,
  type ListAssumptionTemplatesQuery,
} from '@roshd/validation';
import { ConflictError, NotFoundError } from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import type { Principal } from '../rbac/principal';

const SUMMARY_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AssumptionTemplateSelect;

export type AssumptionTemplateSummary = Prisma.AssumptionTemplateGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;

export interface AssumptionTemplateDetail extends AssumptionTemplateSummary {
  assumptions: Assumption[];
}

/**
 * Personal assumption templates (ST-34.01). A template belongs to one user and is visible to that
 * user only — staff included — because it is the user's own working material; any other id is a
 * 404, never a 403, so ids cannot be probed. The platform creates none.
 */
@Injectable()
export class AssumptionTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listMine(
    ownerId: string,
    query: ListAssumptionTemplatesQuery,
  ): Promise<PageResult<AssumptionTemplateSummary>> {
    const where = { ownerId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.assumptionTemplate.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.assumptionTemplate.count({ where }),
    ]);
    return new PageResult(items, query.page, query.pageSize, total);
  }

  async get(id: string, ownerId: string): Promise<AssumptionTemplateDetail> {
    const template = await this.prisma.assumptionTemplate.findFirst({
      where: { id, ownerId },
      select: { ...SUMMARY_SELECT, assumptions: true },
    });
    if (!template) throw new NotFoundError();
    return toDetail(template);
  }

  async create(
    input: AssumptionTemplateInput,
    owner: Principal,
    meta: RequestMeta,
  ): Promise<AssumptionTemplateDetail> {
    // A soft cap against runaway use: concurrent creates may each pass the count and end a few
    // templates above it (the request throttle bounds how many).
    const template = await this.prisma.$transaction(async (tx) => {
      const count = await tx.assumptionTemplate.count({ where: { ownerId: owner.userId } });
      if (count >= MAX_ASSUMPTION_TEMPLATES) {
        throw new ConflictError(
          'حداکثر تعداد الگوها پر شده است. برای ساخت الگوی تازه، یکی از الگوهای قبلی را حذف کنید.',
        );
      }
      return tx.assumptionTemplate.create({
        data: {
          ownerId: owner.userId,
          name: input.name,
          description: input.description || null,
          assumptions: input.assumptions,
        },
        select: { ...SUMMARY_SELECT, assumptions: true },
      });
    });
    await this.audit.record({
      action: 'assumption_template.created',
      actorId: owner.userId,
      entityType: 'assumption_template',
      entityId: template.id,
      meta,
    });
    return toDetail(template);
  }

  async update(
    id: string,
    input: AssumptionTemplateInput,
    owner: Principal,
    meta: RequestMeta,
  ): Promise<AssumptionTemplateDetail> {
    const { count } = await this.prisma.assumptionTemplate.updateMany({
      where: { id, ownerId: owner.userId },
      data: {
        name: input.name,
        description: input.description || null,
        assumptions: input.assumptions,
      },
    });
    if (count !== 1) throw new NotFoundError();
    await this.audit.record({
      action: 'assumption_template.updated',
      actorId: owner.userId,
      entityType: 'assumption_template',
      entityId: id,
      meta,
    });
    return this.get(id, owner.userId);
  }

  async remove(id: string, owner: Principal, meta: RequestMeta): Promise<void> {
    const { count } = await this.prisma.assumptionTemplate.deleteMany({
      where: { id, ownerId: owner.userId },
    });
    if (count !== 1) throw new NotFoundError();
    await this.audit.record({
      action: 'assumption_template.deleted',
      actorId: owner.userId,
      entityType: 'assumption_template',
      entityId: id,
      meta,
    });
  }
}

function toDetail(
  row: AssumptionTemplateSummary & { assumptions: Prisma.JsonValue },
): AssumptionTemplateDetail {
  return { ...row, assumptions: row.assumptions as unknown as Assumption[] };
}
