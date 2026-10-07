import { Injectable } from '@nestjs/common';
import {
  MAX_REPORT_TEMPLATES,
  reportStructureSchema,
  type CreateReportTemplateInput,
  type ListReportTemplatesQuery,
  type ReportStructure,
  type UpdateReportTemplateInput,
} from '@roshd/validation';
import { ConflictError, NotFoundError } from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import type { Principal } from '../rbac/principal';
import type { Db } from './questionnaire-reader';

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  chapters: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} satisfies Prisma.FeasibilityReportTemplateSelect;

type TemplateRow = Prisma.FeasibilityReportTemplateGetPayload<{ select: typeof TEMPLATE_SELECT }>;

export interface ReportTemplateView extends Omit<TemplateRow, 'chapters'> {
  chapters: ReportStructure;
}

/** The chapters of a template as they were stored; a row of another shape has none. */
const storedStructure = (value: Prisma.JsonValue): ReportStructure => {
  const parsed = reportStructureSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};

const view = ({ chapters, ...row }: TemplateRow): ReportTemplateView => ({
  ...row,
  chapters: storedStructure(chapters),
});

/**
 * Report templates (ST-35.12, OQ-35): which chapters of the UNIDO structure a report has, in
 * which order, under which titles and with what guidance for the experts. The staff of the
 * feasibility platform keep them. A report copies the chapters when it takes a template, so a
 * template can change or be archived without changing a report that was started.
 */
@Injectable()
export class ReportTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListReportTemplatesQuery): Promise<ReportTemplateView[]> {
    const rows = await this.prisma.feasibilityReportTemplate.findMany({
      where:
        query.state === 'all'
          ? {}
          : { archivedAt: query.state === 'archived' ? { not: null } : null },
      select: TEMPLATE_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(view);
  }

  async get(id: string): Promise<ReportTemplateView> {
    const row = await this.prisma.feasibilityReportTemplate.findUnique({
      where: { id },
      select: TEMPLATE_SELECT,
    });
    if (!row) throw new NotFoundError();
    return view(row);
  }

  async create(
    input: CreateReportTemplateInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<ReportTemplateView> {
    // Archived templates are history and take no place.
    const count = await this.prisma.feasibilityReportTemplate.count({
      where: { archivedAt: null },
    });
    if (count >= MAX_REPORT_TEMPLATES) {
      throw new ConflictError(
        'حداکثر تعداد قالب‌های فعال گزارش ساخته شده است. یکی از قالب‌های موجود را تغییر دهید یا بایگانی کنید.',
      );
    }
    const row = await this.prisma.feasibilityReportTemplate.create({
      data: { name: input.name, chapters: input.chapters, createdById: actor.userId },
      select: TEMPLATE_SELECT,
    });
    await this.audit.record({
      action: 'feasibility_report_template.created',
      actorId: actor.userId,
      entityType: 'feasibility_report_template',
      entityId: row.id,
      meta,
    });
    return view(row);
  }

  async update(
    id: string,
    input: UpdateReportTemplateInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<ReportTemplateView> {
    const current = await this.prisma.feasibilityReportTemplate.findUnique({
      where: { id },
      select: { archivedAt: true },
    });
    if (!current) throw new NotFoundError();
    const archived = input.archived ?? current.archivedAt !== null;
    const row = await this.prisma.feasibilityReportTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.chapters !== undefined ? { chapters: input.chapters } : {}),
        // The day it was archived is kept when it is archived again.
        ...(archived === (current.archivedAt !== null)
          ? {}
          : { archivedAt: archived ? new Date() : null }),
      },
      select: TEMPLATE_SELECT,
    });
    await this.audit.record({
      action: 'feasibility_report_template.updated',
      actorId: actor.userId,
      entityType: 'feasibility_report_template',
      entityId: id,
      metadata: {
        fields: Object.keys(input).filter((key) => input[key as keyof typeof input] !== undefined),
      },
      meta,
    });
    return view(row);
  }

  /**
   * The chapters a report takes from a template that is still offered; `null` when there is no
   * such template.
   */
  async structureOf(db: Db, id: string): Promise<ReportStructure | null> {
    const row = await db.feasibilityReportTemplate.findFirst({
      where: { id, archivedAt: null },
      select: { chapters: true },
    });
    if (!row) return null;
    const chapters = storedStructure(row.chapters);
    return chapters.length > 0 ? chapters : null;
  }
}
