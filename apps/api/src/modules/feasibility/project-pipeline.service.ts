import { Injectable } from '@nestjs/common';
import {
  FEASIBILITY_EXPORT_MAX_ROWS,
  type ExportFeasibilityProjectsQuery,
  type FeasibilityPipelineQuery,
} from '@roshd/validation';
import { toCsv } from '../../common/csv/csv';
import { BadRequestError, ForbiddenError } from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { hasPermission, type Principal } from '../rbac/principal';
import { staffRefs, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import {
  PIPELINE_EXPORT_HEADER,
  pipelineExportFileName,
  pipelineExportRow,
  pipelineSummary,
  type PipelineSummary,
} from './domain/pipeline';

const MANAGE_PERMISSION = 'feasibility:manage';

/** The projects the filters of the pipeline leave: by sector, and by the expert working on them. */
export function pipelineWhere(
  query: FeasibilityPipelineQuery,
): Prisma.FeasibilityProjectWhereInput {
  return {
    ...(query.sector ? { sector: query.sector } : {}),
    ...(query.expertId === 'none'
      ? { experts: { none: { endedAt: null } } }
      : query.expertId
        ? { experts: { some: { expertId: query.expertId, endedAt: null } } }
        : {}),
  };
}

export interface PipelineView extends PipelineSummary {
  /** The moment the ages are counted to. */
  asOf: Date;
  /** Everybody who works on a project now, for the filter (sorted by name). */
  experts: StaffRef[];
}

/**
 * The pipeline of the feasibility projects for the staff (ST-35.15): how many projects are in
 * every status and how long they have been there, narrowed by sector and expert, and the same
 * projects as a CSV file. Both are for `feasibility:manage` and cover every project, as the
 * staff's list does.
 */
@Injectable()
export class ProjectPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async summary(query: FeasibilityPipelineQuery, actor: Principal): Promise<PipelineView> {
    if (!hasPermission(actor, MANAGE_PERMISSION)) throw new ForbiddenError();
    const [rows, assigned] = await this.prisma.$transaction([
      this.prisma.feasibilityProject.findMany({
        where: pipelineWhere(query),
        select: { status: true, statusSince: true },
      }),
      // The filter offers everybody who works on a project, whatever is filtered now.
      this.prisma.expertAssignment.findMany({
        where: { endedAt: null },
        select: { expertId: true },
        distinct: ['expertId'],
      }),
    ]);
    const asOf = new Date();
    return {
      ...pipelineSummary(rows, asOf),
      asOf,
      experts: staffRefs(await this.users.namesByIds(assigned.map((row) => row.expertId))),
    };
  }

  /**
   * CSV export for the staff (UTF-8 BOM, formula-safe). Every export is audited with its filters
   * and row count because the file names the applicants.
   */
  async exportCsv(
    query: ExportFeasibilityProjectsQuery,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<{ fileName: string; csv: string; rows: number }> {
    if (!hasPermission(actor, MANAGE_PERMISSION)) throw new ForbiddenError();
    const where: Prisma.FeasibilityProjectWhereInput = {
      ...pipelineWhere(query),
      ...(query.status ? { status: query.status } : {}),
    };
    const total = await this.prisma.feasibilityProject.count({ where });
    if (total > FEASIBILITY_EXPORT_MAX_ROWS) {
      throw new BadRequestError(
        `تعداد پروژه‌ها بیش از ${FEASIBILITY_EXPORT_MAX_ROWS.toLocaleString('fa-IR')} است؛ فیلترها را محدودتر کنید.`,
      );
    }
    const projects = await this.prisma.feasibilityProject.findMany({
      where,
      select: {
        code: true,
        title: true,
        sector: true,
        location: true,
        status: true,
        statusSince: true,
        createdAt: true,
        ownerId: true,
        experts: {
          where: { endedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { expertId: true },
        },
      },
      // The longest in its status first: what the file is read for.
      orderBy: [{ statusSince: 'asc' }, { id: 'asc' }],
    });
    const names = await this.users.namesByIds(
      projects.flatMap((project) => [
        project.ownerId,
        ...project.experts.map((assignment) => assignment.expertId),
      ]),
    );
    const now = new Date();
    const rows = projects.map(({ ownerId, experts, ...project }) =>
      pipelineExportRow(
        {
          ...project,
          applicant: names.get(ownerId) ?? null,
          experts: experts.flatMap((assignment) => names.get(assignment.expertId) ?? []),
        },
        now,
      ),
    );
    await this.audit.record({
      action: 'feasibility_projects.exported',
      actorId: actor.userId,
      entityType: 'feasibility_project',
      metadata: {
        filters: {
          status: query.status ?? null,
          sector: query.sector ?? null,
          expertId: query.expertId ?? null,
        },
        rows: rows.length,
      },
      meta,
    });
    return {
      fileName: pipelineExportFileName(now),
      csv: toCsv(PIPELINE_EXPORT_HEADER, rows),
      rows: rows.length,
    };
  }
}
