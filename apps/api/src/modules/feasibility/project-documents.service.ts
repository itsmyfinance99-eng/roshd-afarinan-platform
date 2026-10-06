import { Injectable } from '@nestjs/common';
import {
  FEASIBILITY_EDITABLE_STATUSES,
  MAX_DOCUMENT_VERSIONS,
  MAX_PROJECT_DOCUMENT_FILES,
  QUESTIONNAIRE_LIMITS,
  type ProjectDocumentSlotInput,
} from '@roshd/validation';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { FilesService, type UploadedFile } from '../files/files.service';
import type { Principal } from '../rbac/principal';
import { staffRef, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import type { FeasibilityStatus } from './domain/feasibility-status';
import { FeasibilityProjectsService } from './feasibility-projects.service';
import {
  documentSlotsOf,
  QuestionnaireReader,
  type DocumentSlot,
  type ProjectQuestionnaire,
} from './questionnaire-reader';

/** Under which name the files of a project are attached to it. */
const FILE_ENTITY = 'feasibility_project';
const LOCKED = 'مدارک پس از ارسال پروژه قفل می‌شوند و فقط با درخواست اطلاعات تکمیلی باز می‌شوند.';

const isOpen = (status: FeasibilityStatus): boolean =>
  (FEASIBILITY_EDITABLE_STATUSES as readonly FeasibilityStatus[]).includes(status);

export interface ProjectDocumentVersion {
  id: string;
  version: number;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  /** Whether the caller may take this file back now. */
  removable: boolean;
  /** Who handed it in; staff and experts see the name. */
  uploadedBy?: StaffRef | null;
}

export interface ProjectDocumentSlotView extends DocumentSlot {
  /** Newest first. For a document the first one is the current version. */
  files: ProjectDocumentVersion[];
}

export interface ProjectDocumentsView {
  slots: ProjectDocumentSlotView[];
  access: { upload: boolean };
}

/**
 * The documents of a feasibility project (ST-35.06, ADR-0010 §5).
 *
 * - What can be handed in is what the questionnaire of the project asks for: the documents of
 *   the pinned template, the documents the project has of its own, and the file questions.
 * - A document is never overwritten. Handing it in again is its next version; a file question
 *   takes several files, and its answer is the list of them.
 * - Files are private. Whoever sees the project (applicant, staff, assigned expert) reads them,
 *   only through this service and only by a signed, expiring URL; only the applicant hands in.
 */
@Injectable()
export class ProjectDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly users: UsersService,
    private readonly projects: FeasibilityProjectsService,
    private readonly reader: QuestionnaireReader,
  ) {}

  async list(id: string, principal: Principal): Promise<ProjectDocumentsView> {
    const relation = await this.projects.relationOf(id, principal);
    const questionnaire = await this.reader.load(this.prisma, id);
    if (!questionnaire) throw new NotFoundError();
    const rows = await this.prisma.projectDocument.findMany({
      where: { projectId: id },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        kind: true,
        slotKey: true,
        version: true,
        uploadedById: true,
        createdAt: true,
        file: { select: { originalName: true, mimeType: true, size: true } },
      },
    });
    const open = relation.owner && isOpen(questionnaire.status);
    const since = open ? await this.lastSubmission(this.prisma, id) : null;
    const names = relation.owner
      ? undefined
      : await this.users.namesByIds(rows.flatMap((row) => row.uploadedById ?? []));
    return {
      slots: documentSlotsOf(questionnaire).map((slot) => ({
        ...slot,
        files: rows
          .filter((row) => row.kind === slot.kind && row.slotKey === slot.key)
          .map((row) => ({
            id: row.id,
            version: row.version,
            ...row.file,
            uploadedAt: row.createdAt,
            removable: open && (since === null || row.createdAt > since),
            ...(names ? { uploadedBy: staffRef(row.uploadedById, names) } : {}),
          })),
      })),
      access: { upload: open },
    };
  }

  /** The applicant hands in a file for a document or a file question of their project. */
  async upload(
    id: string,
    input: ProjectDocumentSlotInput,
    file: UploadedFile | undefined,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ProjectDocumentsView> {
    const relation = await this.projects.relationOf(id, principal);
    if (!relation.owner) throw new ForbiddenError('فقط متقاضی مدارک پروژه را بارگذاری می‌کند.');
    // Checked before the bytes are stored, and again under the lock when the row is written.
    const before = await this.reader.load(this.prisma, id);
    if (!before) throw new NotFoundError();
    await this.assertRoom(this.prisma, id, before, input);

    const stored = await this.files.uploadForEntity(
      principal,
      file,
      'FEASIBILITY_DOCUMENT',
      { entityType: FILE_ENTITY, entityId: id },
      meta,
    );
    let version: number;
    try {
      version = await this.prisma.$transaction(async (tx) => {
        await this.projects.lock(tx, id);
        const now = await this.reader.load(tx, id);
        if (!now) throw new NotFoundError();
        const count = await this.assertRoom(tx, id, now, input);
        const next = count.highest + 1;
        await tx.projectDocument.create({
          data: {
            projectId: id,
            kind: input.kind,
            slotKey: input.key,
            version: next,
            fileId: stored.id,
            uploadedById: principal.userId,
          },
        });
        if (input.kind === 'ANSWER') await this.syncAnswer(tx, id, input.key, principal.userId);
        return next;
      });
    } catch (error) {
      // The file was stored for a row that did not come to be.
      await this.files.removeOfEntity({ entityType: FILE_ENTITY, entityId: id }, principal, meta, [
        stored.id,
      ]);
      throw error;
    }
    await this.audit.record({
      action: 'feasibility_project.document_uploaded',
      actorId: principal.userId,
      entityType: FILE_ENTITY,
      entityId: id,
      metadata: { kind: input.kind, key: input.key, version, fileId: stored.id },
      meta,
    });
    return this.list(id, principal);
  }

  /**
   * The applicant takes back a file handed in by mistake. What the reviewers have already been
   * sent stays: only a file added since the last submission can go.
   */
  async remove(
    id: string,
    documentId: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ProjectDocumentsView> {
    const relation = await this.projects.relationOf(id, principal);
    if (!relation.owner) throw new ForbiddenError('فقط متقاضی مدرک خودش را برمی‌دارد.');
    const removed = await this.prisma.$transaction(async (tx) => {
      const status = await this.projects.lock(tx, id);
      const row = await tx.projectDocument.findFirst({
        where: { id: documentId, projectId: id },
        select: { kind: true, slotKey: true, version: true, fileId: true, createdAt: true },
      });
      if (!row) throw new NotFoundError();
      if (!isOpen(status)) throw new ConflictError(LOCKED);
      const since = await this.lastSubmission(tx, id);
      if (since !== null && row.createdAt <= since) {
        throw new ConflictError(
          'مدرکی که پیش‌تر برای بررسی ارسال شده برداشته نمی‌شود؛ نسخه تازه آن را بارگذاری کنید.',
        );
      }
      await tx.projectDocument.delete({ where: { id: documentId } });
      if (row.kind === 'ANSWER') await this.syncAnswer(tx, id, row.slotKey, principal.userId);
      return row;
    });
    await this.files.removeOfEntity({ entityType: FILE_ENTITY, entityId: id }, principal, meta, [
      removed.fileId,
    ]);
    await this.audit.record({
      action: 'feasibility_project.document_removed',
      actorId: principal.userId,
      entityType: FILE_ENTITY,
      entityId: id,
      metadata: {
        kind: removed.kind,
        key: removed.slotKey,
        version: removed.version,
        fileId: removed.fileId,
      },
      meta,
    });
    return this.list(id, principal);
  }

  /** A signed, expiring URL for one file of a project, for whoever sees the project. */
  async downloadUrl(
    id: string,
    documentId: string,
    principal: Principal,
  ): Promise<{ url: string; expiresAt: Date }> {
    await this.projects.relationOf(id, principal);
    const row = await this.prisma.projectDocument.findFirst({
      where: { id: documentId, projectId: id, file: { status: 'ACTIVE' } },
      select: { fileId: true },
    });
    if (!row) throw new NotFoundError();
    return this.files.signedUrlOf(row.fileId);
  }

  /**
   * The files of a document or file question that left the questionnaire of a project (its item
   * was removed) go with it. Called inside the caller's transaction; returns the file ids for
   * `discard`, which runs after the commit.
   */
  async detach(
    tx: Prisma.TransactionClient,
    projectId: string,
    slotKey: string,
  ): Promise<string[]> {
    const rows = await tx.projectDocument.findMany({
      where: { projectId, slotKey },
      select: { fileId: true },
    });
    await tx.projectDocument.deleteMany({ where: { projectId, slotKey } });
    return rows.map((row) => row.fileId);
  }

  /** Removes files whose rows are gone (see `detach`); with no ids, every file of the project. */
  discard(
    projectId: string,
    actor: Principal,
    meta: RequestMeta,
    fileIds?: readonly string[],
  ): Promise<number> {
    if (fileIds && fileIds.length === 0) return Promise.resolve(0);
    return this.files.removeOfEntity(
      { entityType: FILE_ENTITY, entityId: projectId },
      actor,
      meta,
      fileIds,
    );
  }

  /**
   * That the project is open, the slot exists and there is room for one more file in it and in
   * the project. Returns the highest version the slot has.
   */
  private async assertRoom(
    db: PrismaService | Prisma.TransactionClient,
    projectId: string,
    questionnaire: ProjectQuestionnaire,
    input: ProjectDocumentSlotInput,
  ): Promise<{ highest: number }> {
    if (!isOpen(questionnaire.status)) throw new ConflictError(LOCKED);
    const slot = documentSlotsOf(questionnaire).find(
      (candidate) => candidate.kind === input.kind && candidate.key === input.key,
    );
    if (!slot) {
      throw new ValidationFailedError([
        { path: 'key', message: 'این مدرک در پرسشنامه پروژه نیست.' },
      ]);
    }
    const [inSlot, inProject] = await Promise.all([
      db.projectDocument.aggregate({
        where: { projectId, kind: input.kind, slotKey: input.key },
        _count: { _all: true },
        _max: { version: true },
      }),
      db.projectDocument.count({ where: { projectId } }),
    ]);
    if (inProject >= MAX_PROJECT_DOCUMENT_FILES) {
      throw new ConflictError('حداکثر تعداد فایل‌های این پروژه پر شده است.');
    }
    const room =
      slot.kind === 'ANSWER'
        ? (slot.maxFiles ?? QUESTIONNAIRE_LIMITS.files)
        : MAX_DOCUMENT_VERSIONS;
    if (inSlot._count._all >= room) {
      throw new ConflictError(
        slot.kind === 'ANSWER'
          ? 'حداکثر تعداد فایل‌های این سؤال بارگذاری شده است.'
          : 'حداکثر تعداد نسخه‌های این مدرک بارگذاری شده است.',
      );
    }
    return { highest: inSlot._max.version ?? 0 };
  }

  /** The answer of a file question is the list of its files, in the order they were handed in. */
  private async syncAnswer(
    tx: Prisma.TransactionClient,
    projectId: string,
    questionKey: string,
    userId: string,
  ): Promise<void> {
    const rows = await tx.projectDocument.findMany({
      where: { projectId, kind: 'ANSWER', slotKey: questionKey },
      orderBy: { version: 'asc' },
      select: { fileId: true },
    });
    if (rows.length === 0) {
      await tx.questionnaireAnswer.deleteMany({ where: { projectId, questionKey } });
      return;
    }
    const value = rows.map((row) => row.fileId);
    await tx.questionnaireAnswer.upsert({
      where: { projectId_questionKey: { projectId, questionKey } },
      create: { projectId, questionKey, value, updatedById: userId },
      update: { value, updatedById: userId },
    });
  }

  /** When the project was last sent to the reviewers; `null` while it never was. */
  private async lastSubmission(
    db: PrismaService | Prisma.TransactionClient,
    projectId: string,
  ): Promise<Date | null> {
    const event = await db.feasibilityStatusEvent.findFirst({
      where: { projectId, toStatus: 'SUBMITTED' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true },
    });
    return event?.createdAt ?? null;
  }
}
