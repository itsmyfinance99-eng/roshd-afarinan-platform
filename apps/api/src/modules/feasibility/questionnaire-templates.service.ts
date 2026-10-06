import { Injectable } from '@nestjs/common';
import {
  questionsOf,
  type CreateQuestionnaireTemplateInput,
  type ListQuestionnaireTemplatesQuery,
  type QuestionnaireDefinition,
  type SaveQuestionnaireDraftInput,
  type UpdateQuestionnaireTemplateInput,
} from '@roshd/validation';
import {
  ConflictError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import type { Principal } from '../rbac/principal';
import { staffRef, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import { storedDefinition } from './questionnaire-reader';

const ENTITY = 'questionnaire_template';
const ARCHIVED_TEMPLATE = 'قالب بایگانی‌شده تغییر نمی‌کند. نخست آن را از بایگانی درآورید.';
const EMPTY_DEFINITION: QuestionnaireDefinition = { sections: [], documents: [] };

const json = (definition: QuestionnaireDefinition): Prisma.InputJsonValue => definition;

const VERSION_META = {
  version: true,
  status: true,
  updatedAt: true,
  publishedAt: true,
  publishedById: true,
} satisfies Prisma.QuestionnaireTemplateVersionSelect;

const SUMMARY_SELECT = {
  id: true,
  title: true,
  sector: true,
  isDemo: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  versions: { orderBy: { version: 'desc' }, select: VERSION_META },
} satisfies Prisma.QuestionnaireTemplateSelect;

type SummaryRow = Prisma.QuestionnaireTemplateGetPayload<{ select: typeof SUMMARY_SELECT }>;

export interface QuestionnaireTemplateSummary {
  id: string;
  title: string;
  /** `null` for the general questionnaire of every sector. */
  sector: string | null;
  isDemo: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** The version new projects start with. */
  published: { version: number; publishedAt: Date | null } | null;
  /** The version that is being written, if any. */
  draft: { version: number; updatedAt: Date } | null;
}

export interface QuestionnaireVersionView {
  version: number;
  status: 'DRAFT' | 'PUBLISHED';
  updatedAt: Date;
  publishedAt: Date | null;
  publishedBy: StaffRef | null;
}

export interface QuestionnaireTemplateDetail extends QuestionnaireTemplateSummary {
  versions: QuestionnaireVersionView[];
  /** The content of the draft, when there is one. */
  draftDefinition: QuestionnaireDefinition | null;
  /** The content of the latest published version, when there is one. */
  publishedDefinition: QuestionnaireDefinition | null;
}

export interface QuestionnaireVersionDetail extends QuestionnaireVersionView {
  definition: QuestionnaireDefinition;
}

const summaryOf = ({ versions, ...template }: SummaryRow): QuestionnaireTemplateSummary => {
  const published = versions.find((version) => version.status === 'PUBLISHED');
  const draft = versions.find((version) => version.status === 'DRAFT');
  return {
    ...template,
    published: published
      ? { version: published.version, publishedAt: published.publishedAt }
      : null,
    draft: draft ? { version: draft.version, updatedAt: draft.updatedAt } : null,
  };
};

/**
 * Questionnaire templates (ST-35.03, ADR-0010 §4), written by the staff of the feasibility
 * platform (`feasibility:manage`, checked on every route).
 *
 * - The content of a template lives in its versions. At most one version is a draft; it is
 *   edited freely and becomes the next published version.
 * - A published version never changes (the database refuses it too), because projects are
 *   pinned to it. A correction is a new version, which only projects that start later get.
 */
@Injectable()
export class QuestionnaireTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async list(
    query: ListQuestionnaireTemplatesQuery,
  ): Promise<PageResult<QuestionnaireTemplateSummary>> {
    const where: Prisma.QuestionnaireTemplateWhereInput =
      query.state === 'all'
        ? {}
        : { archivedAt: query.state === 'archived' ? { not: null } : null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.questionnaireTemplate.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.questionnaireTemplate.count({ where }),
    ]);
    return new PageResult(rows.map(summaryOf), query.page, query.pageSize, total);
  }

  async get(id: string): Promise<QuestionnaireTemplateDetail> {
    const row = await this.prisma.questionnaireTemplate.findUnique({
      where: { id },
      select: SUMMARY_SELECT,
    });
    if (!row) throw new NotFoundError();
    const summary = summaryOf(row);
    const wanted = [summary.draft?.version, summary.published?.version].filter(
      (version): version is number => version !== undefined,
    );
    const contents = await this.prisma.questionnaireTemplateVersion.findMany({
      where: { templateId: id, version: { in: wanted } },
      select: { version: true, definition: true },
    });
    const definitionOf = (version: number | undefined): QuestionnaireDefinition | null => {
      const found = contents.find((content) => content.version === version);
      return found ? storedDefinition(found.definition) : null;
    };
    const names = await this.users.namesByIds(
      row.versions.flatMap((version) => version.publishedById ?? []),
    );
    return {
      ...summary,
      versions: row.versions.map(({ publishedById, ...version }) => ({
        ...version,
        publishedBy: staffRef(publishedById, names),
      })),
      draftDefinition: definitionOf(summary.draft?.version),
      publishedDefinition: definitionOf(summary.published?.version),
    };
  }

  async getVersion(id: string, version: number): Promise<QuestionnaireVersionDetail> {
    const row = await this.prisma.questionnaireTemplateVersion.findUnique({
      where: { templateId_version: { templateId: id, version } },
      select: { ...VERSION_META, definition: true },
    });
    if (!row) throw new NotFoundError();
    const { publishedById, definition, ...meta } = row;
    const names = await this.users.namesByIds(publishedById ? [publishedById] : []);
    return {
      ...meta,
      publishedBy: staffRef(publishedById, names),
      definition: storedDefinition(definition),
    };
  }

  /** A new template with the draft of its first version. */
  async create(
    input: CreateQuestionnaireTemplateInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<QuestionnaireTemplateDetail> {
    const template = await this.prisma.questionnaireTemplate.create({
      data: {
        title: input.title,
        sector: input.sector,
        createdById: actor.userId,
        versions: {
          create: { version: 1, definition: json(input.definition ?? EMPTY_DEFINITION) },
        },
      },
      select: { id: true },
    });
    await this.audit.record({
      action: 'questionnaire_template.created',
      actorId: actor.userId,
      entityType: ENTITY,
      entityId: template.id,
      meta,
    });
    return this.get(template.id);
  }

  /** Title, sector and archive; none of them touches a version or a project that has started. */
  async update(
    id: string,
    input: UpdateQuestionnaireTemplateInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<QuestionnaireTemplateDetail> {
    const data: Prisma.QuestionnaireTemplateUpdateManyMutationInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.sector !== undefined ? { sector: input.sector } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
    };
    const { count } = await this.prisma.questionnaireTemplate.updateMany({ where: { id }, data });
    if (count !== 1) throw new NotFoundError();
    await this.audit.record({
      action: 'questionnaire_template.updated',
      actorId: actor.userId,
      entityType: ENTITY,
      entityId: id,
      metadata: { fields: Object.keys(data) },
      meta,
    });
    return this.get(id);
  }

  /** Saves the draft; after a publication the first save starts the next version. */
  async saveDraft(
    id: string,
    input: SaveQuestionnaireDraftInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<QuestionnaireTemplateDetail> {
    const saved = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const versions = await tx.questionnaireTemplateVersion.findMany({
        where: { templateId: id },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, status: true },
      });
      const draft = versions.find((version) => version.status === 'DRAFT');
      if (draft) {
        await tx.questionnaireTemplateVersion.update({
          where: { id: draft.id },
          data: { definition: json(input.definition) },
        });
        return { version: draft.version, started: false };
      }
      const version = (versions[0]?.version ?? 0) + 1;
      await tx.questionnaireTemplateVersion.create({
        data: { templateId: id, version, definition: json(input.definition) },
      });
      return { version, started: true };
    });
    if (saved.started) {
      // Every save of a draft would only be noise; the start of a new version is recorded.
      await this.audit.record({
        action: 'questionnaire_template.version_started',
        actorId: actor.userId,
        entityType: ENTITY,
        entityId: id,
        metadata: { version: saved.version },
        meta,
      });
    }
    return this.get(id);
  }

  /** Publishes the draft: from now on new projects of the sector start with it. */
  async publish(
    id: string,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<QuestionnaireTemplateDetail> {
    const version = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const draft = await tx.questionnaireTemplateVersion.findFirst({
        where: { templateId: id, status: 'DRAFT' },
        select: { id: true, version: true, definition: true },
      });
      if (!draft) throw new ConflictError('این قالب پیش‌نویسی برای انتشار ندارد.');
      if (questionsOf(storedDefinition(draft.definition)).length === 0) {
        throw new ValidationFailedError([
          { path: 'definition.sections', message: 'پرسشنامه بدون سؤال منتشر نمی‌شود.' },
        ]);
      }
      await tx.questionnaireTemplateVersion.update({
        where: { id: draft.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: actor.userId },
      });
      return draft.version;
    });
    await this.audit.record({
      action: 'questionnaire_template.published',
      actorId: actor.userId,
      entityType: ENTITY,
      entityId: id,
      metadata: { version },
      meta,
    });
    return this.get(id);
  }

  /** Drops the draft of a template that has a published version to fall back on. */
  async discardDraft(
    id: string,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<QuestionnaireTemplateDetail> {
    const version = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const versions = await tx.questionnaireTemplateVersion.findMany({
        where: { templateId: id },
        select: { id: true, version: true, status: true },
      });
      const draft = versions.find((candidate) => candidate.status === 'DRAFT');
      if (!draft) throw new ConflictError('این قالب پیش‌نویسی ندارد.');
      if (versions.length === 1) {
        throw new ConflictError(
          'نخستین نسخه قالب کنار گذاشته نمی‌شود. اگر قالب را نمی‌خواهید، آن را بایگانی کنید.',
        );
      }
      await tx.questionnaireTemplateVersion.delete({ where: { id: draft.id } });
      return draft.version;
    });
    await this.audit.record({
      action: 'questionnaire_template.draft_discarded',
      actorId: actor.userId,
      entityType: ENTITY,
      entityId: id,
      metadata: { version },
      meta,
    });
    return this.get(id);
  }

  /** One change of the versions of a template at a time; an archived template has none. */
  private async lock(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { archived: boolean }[]
    >`SELECT "archivedAt" IS NOT NULL AS "archived" FROM "questionnaire_templates" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundError();
    if (row.archived) throw new ConflictError(ARCHIVED_TEMPLATE);
  }
}
