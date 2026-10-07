import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  FEASIBILITY_WORK_STATUSES,
  MAX_PROJECT_INTERNAL_NOTES,
  type CreateInternalNoteInput,
  type ListInternalNotesQuery,
} from '@roshd/validation';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { FinancialModelsService } from '../financial-model/financial-models.service';
import type { LinkedModelAccess, ModelLinkSource } from '../financial-model/ports/model-link';
import type { Principal } from '../rbac/principal';
import { staffRef, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import type { FeasibilityStatus } from './domain/feasibility-status';
import {
  FeasibilityProjectsService,
  type FeasibilityProjectDetail,
} from './feasibility-projects.service';

/** The longest title a financial model takes (`createFinancialModelSchema`). */
const MODEL_TITLE_MAX = 150;
const MODEL_TITLE_PREFIX = 'مدل مالی ';

/** The title of the model of a project: named after the project, cut between characters. */
const modelTitle = (projectTitle: string): string => {
  const characters = Array.from(`${MODEL_TITLE_PREFIX}${projectTitle}`);
  return characters.length > MODEL_TITLE_MAX
    ? `${characters.slice(0, MODEL_TITLE_MAX - 1).join('')}…`
    : characters.join('');
};

const isWorkedOn = (status: FeasibilityStatus): boolean =>
  (FEASIBILITY_WORK_STATUSES as readonly FeasibilityStatus[]).includes(status);

export interface InternalNoteView {
  id: string;
  body: string;
  createdAt: Date;
  /** Who wrote it; `null` when that user is gone. */
  author: StaffRef | null;
}

/**
 * What the staff and the assigned experts of a project work with beside the answers and the
 * documents of the applicant (ST-35.10, ADR-0010 §6).
 *
 * - The financial model of the study is made here, once per project, when the work has started.
 *   From then on the project decides who reaches it: this service is the `ModelLinkSource` of
 *   the financial-model module, so an expert works on the model while assigned and no longer.
 * - Internal notes are what the staff and the experts write for each other. The applicant never
 *   reads them: they are in no status event and in no notification.
 */
@Injectable()
export class ProjectWorkspaceService implements OnModuleInit, ModelLinkSource {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly models: FinancialModelsService,
    private readonly projects: FeasibilityProjectsService,
  ) {}

  onModuleInit(): void {
    this.models.useLinks(this);
  }

  /**
   * An expert or the staff make the financial model of the study; it starts empty and is filled
   * in the editor of the financial models.
   */
  async createModel(
    id: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<FeasibilityProjectDetail> {
    await this.workerOf(id, principal, 'مدل مالی مطالعه را کارشناسان و کارکنان می‌سازند.');
    const modelId = await this.prisma.$transaction(async (tx) => {
      // One model per project: the row is held until the link is written.
      const status = await this.projects.lock(tx, id);
      if (!isWorkedOn(status)) {
        throw new ConflictError(
          'مدل مالی مطالعه پس از شروع کار و پیش از تحویل گزارش ساخته می‌شود.',
        );
      }
      const project = await tx.feasibilityProject.findUniqueOrThrow({
        where: { id },
        select: { title: true, financialModelId: true },
      });
      if (project.financialModelId) throw new ConflictError('این پروژه مدل مالی دارد.');
      const created = await this.models.createLinked(
        { title: modelTitle(project.title), createdById: principal.userId },
        tx,
      );
      await tx.feasibilityProject.update({ where: { id }, data: { financialModelId: created } });
      return created;
    });
    await this.audit.record({
      action: 'feasibility_project.financial_model_created',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { modelId },
      meta,
    });
    return this.projects.get(id, principal);
  }

  /** The internal notes of a project, newest first, for its staff and its assigned experts. */
  async listNotes(
    id: string,
    principal: Principal,
    query: ListInternalNotesQuery,
  ): Promise<PageResult<InternalNoteView>> {
    await this.workerOf(id, principal);
    const where = { projectId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feasibilityInternalNote.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, body: true, createdAt: true, authorId: true },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.feasibilityInternalNote.count({ where }),
    ]);
    const names = await this.users.namesByIds(rows.flatMap((row) => row.authorId ?? []));
    return new PageResult(
      rows.map(({ authorId, ...note }) => ({ ...note, author: staffRef(authorId, names) })),
      query.page,
      query.pageSize,
      total,
    );
  }

  /** A note is written once: a correction is another note. Nobody is told about it. */
  async addNote(
    id: string,
    input: CreateInternalNoteInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<InternalNoteView> {
    await this.workerOf(id, principal);
    const note = await this.prisma.$transaction(async (tx) => {
      const status = await this.projects.lock(tx, id);
      if (status === 'ARCHIVED') throw new ConflictError('پروژه بایگانی‌شده تغییر نمی‌کند.');
      const count = await tx.feasibilityInternalNote.count({ where: { projectId: id } });
      if (count >= MAX_PROJECT_INTERNAL_NOTES) {
        throw new ConflictError('حداکثر تعداد یادداشت‌های داخلی این پروژه نوشته شده است.');
      }
      return tx.feasibilityInternalNote.create({
        data: { projectId: id, authorId: principal.userId, body: input.body },
        select: { id: true, body: true, createdAt: true },
      });
    });
    // Who wrote a note and when; what it says stays with the project.
    await this.audit.record({
      action: 'feasibility_project.internal_note_added',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { noteId: note.id },
      meta,
    });
    const names = await this.users.namesByIds([principal.userId]);
    return { ...note, author: staffRef(principal.userId, names) };
  }

  async accessOf(modelId: string, principal: Principal): Promise<LinkedModelAccess | null> {
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { financialModelId: modelId },
      select: { id: true, status: true },
    });
    if (!project) return null;
    const relation = await this.projects
      .relationOf(project.id, principal)
      .catch((error: unknown) => {
        if (error instanceof NotFoundError) return null;
        throw error;
      });
    // On a project of their own a user is the applicant, and the applicant is not given the model.
    const works = relation !== null && !relation.owner;
    return {
      projectId: project.id,
      expert: works && relation.expert,
      manager: works && relation.manager,
      frozen: project.status === 'ARCHIVED',
    };
  }

  async linkedAmong(modelIds: string[]): Promise<Set<string>> {
    if (modelIds.length === 0) return new Set();
    const rows = await this.prisma.feasibilityProject.findMany({
      where: { financialModelId: { in: modelIds } },
      select: { financialModelId: true },
    });
    return new Set(rows.flatMap((row) => row.financialModelId ?? []));
  }

  /**
   * The caller works on the project: staff or an assigned expert. A project the caller has no
   * relation to does not exist (404); its applicant sees the project but not this part (403).
   */
  private async workerOf(
    id: string,
    principal: Principal,
    refusal = 'یادداشت‌های داخلی پروژه را فقط کارشناسان و کارکنان می‌بینند.',
  ): Promise<void> {
    const relation = await this.projects.relationOf(id, principal);
    if (relation.owner || (!relation.expert && !relation.manager)) {
      throw new ForbiddenError(refusal);
    }
  }
}
