import { Injectable, Logger } from '@nestjs/common';
import {
  FEASIBILITY_EDITABLE_STATUSES,
  MAX_PROJECT_QUESTIONNAIRE_ITEMS,
  PROJECT_ITEM_KIND_LABELS_FA,
  validateAnswers,
  type AddProjectQuestionnaireItemInput,
  type AnswerValue,
  type ProjectItemOrigin,
  type QuestionnaireDefinition,
  type SaveQuestionnaireAnswersInput,
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
import { NotificationsService } from '../notifications/notifications.service';
import type { Principal } from '../rbac/principal';
import { staffRef, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import type { FeasibilityStatus } from './domain/feasibility-status';
import { FeasibilityProjectsService, type ProjectRelation } from './feasibility-projects.service';
import { ProjectDocumentsService } from './project-documents.service';
import {
  answerIssues,
  generateItemKey,
  QuestionnaireReader,
  questionsOfProject,
  type ProjectItemContent,
} from './questionnaire-reader';

/** While the applicant fills in the questionnaire and adds to it. */
const APPLICANT_STATUSES: readonly FeasibilityStatus[] = FEASIBILITY_EDITABLE_STATUSES;
/** While staff add to the questionnaire of a project: until the intake review is over. */
const STAFF_ITEM_STATUSES: readonly FeasibilityStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'INITIAL_REVIEW',
  'NEEDS_MORE_INFO',
];
const MAX_KEY_ATTEMPTS = 5;
/** A whole questionnaire saved at once is hundreds of rows; the default of 5 s is for a few. */
const SAVE_TIMEOUT = { timeout: 20_000 };
const LOCKED_ANSWERS =
  'پاسخ‌ها پس از ارسال پروژه قفل می‌شوند و فقط با درخواست اطلاعات تکمیلی باز می‌شوند.';

export type ProjectItemView = ProjectItemContent & {
  id: string;
  key: string;
  origin: ProjectItemOrigin;
  createdAt: Date;
  /** Whether the caller may take this item out now. */
  removable: boolean;
  /** Who added it; staff and experts see the name, the applicant sees the origin only. */
  addedBy?: StaffRef | null;
};

export interface ProjectQuestionnaireView {
  /** The version the project was pinned to when its questionnaire was started. */
  template: { id: string; title: string; version: number; isDemo: boolean } | null;
  definition: QuestionnaireDefinition | null;
  /** Questions, documents and notes that belong to this project only (OQ-36). */
  items: ProjectItemView[];
  answers: Record<string, AnswerValue>;
  /** When an answer was last saved. */
  answeredAt: Date | null;
  access: {
    /** Start the questionnaire: a published version exists and none is pinned yet. */
    start: boolean;
    answer: boolean;
    addItems: boolean;
  };
}

/** In which capacity the caller adds to a questionnaire or takes from it, if in any. */
function capacityOf(relation: ProjectRelation): ProjectItemOrigin | null {
  // As everywhere on a project: its applicant is the applicant and nothing else.
  if (relation.owner) return 'applicant';
  return relation.manager ? 'staff' : null;
}

const mayChangeItems = (capacity: ProjectItemOrigin | null, status: FeasibilityStatus): boolean =>
  capacity !== null &&
  (capacity === 'applicant' ? APPLICANT_STATUSES : STAFF_ITEM_STATUSES).includes(status);

/**
 * The questionnaire of one project (ST-35.03, ADR-0010 §4).
 *
 * - Whoever sees the project reads its questionnaire; only the applicant answers it.
 * - Starting it pins the project to the latest published version for its sector. A version
 *   published later does not reach a project that has started.
 * - Answers are saved a few at a time and may have gaps; they are complete only when the project
 *   is submitted (`FeasibilityProjectsService.transition`). From then on they are locked, until
 *   the staff ask for more information.
 * - Beside the template a project has its own questions, documents and notes, added by the
 *   applicant or by staff; each keeps its origin.
 */
@Injectable()
export class ProjectQuestionnaireService {
  private readonly logger = new Logger(ProjectQuestionnaireService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inbox: NotificationsService,
    private readonly users: UsersService,
    private readonly projects: FeasibilityProjectsService,
    private readonly reader: QuestionnaireReader,
    private readonly documents: ProjectDocumentsService,
  ) {}

  async get(id: string, principal: Principal): Promise<ProjectQuestionnaireView> {
    const relation = await this.projects.relationOf(id, principal);
    const questionnaire = await this.reader.load(this.prisma, id);
    if (!questionnaire) throw new NotFoundError();
    const { pinned, items, answers, status } = questionnaire;
    const capacity = capacityOf(relation);
    const answering = relation.owner && APPLICANT_STATUSES.includes(status);
    const changing = mayChangeItems(capacity, status);
    const names = relation.owner
      ? undefined
      : await this.users.namesByIds(items.flatMap((item) => item.addedById ?? []));
    return {
      template: pinned
        ? {
            id: pinned.template.id,
            title: pinned.template.title,
            version: pinned.version,
            isDemo: pinned.template.isDemo,
          }
        : null,
      definition: pinned?.definition ?? null,
      items: items.map(({ addedById, kind: _kind, content, ...item }) => ({
        ...item,
        ...content,
        removable: changing && item.origin === capacity,
        ...(names ? { addedBy: staffRef(addedById, names) } : {}),
      })),
      answers: Object.fromEntries(answers.map((answer) => [answer.key, answer.value])),
      answeredAt: answers.reduce<Date | null>(
        (latest, answer) => (latest && latest > answer.updatedAt ? latest : answer.updatedAt),
        null,
      ),
      access: {
        start:
          answering &&
          !pinned &&
          (await this.reader.versionFor(this.prisma, questionnaire.sector)) !== null,
        answer: answering,
        addItems: changing,
      },
    };
  }

  /** The applicant starts the questionnaire; the project keeps the version it starts with. */
  async start(
    id: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ProjectQuestionnaireView> {
    const relation = await this.projects.relationOf(id, principal);
    if (!relation.owner) throw new ForbiddenError('فقط متقاضی پرسشنامه پروژه را شروع می‌کند.');
    const versionId = await this.prisma.$transaction(async (tx) => {
      const status = await this.projects.lock(tx, id);
      if (!APPLICANT_STATUSES.includes(status)) throw new ConflictError(LOCKED_ANSWERS);
      const project = await tx.feasibilityProject.findUniqueOrThrow({
        where: { id },
        select: { sector: true, templateVersionId: true },
      });
      if (project.templateVersionId) {
        throw new ConflictError('پرسشنامه این پروژه پیش‌تر شروع شده است.');
      }
      const version = await this.reader.versionFor(tx, project.sector);
      if (!version) throw new ConflictError('هنوز پرسشنامه‌ای برای این پروژه منتشر نشده است.');
      await tx.feasibilityProject.update({
        where: { id },
        data: { templateVersionId: version.id },
      });
      return version.id;
    });
    await this.audit.record({
      action: 'feasibility_project.questionnaire_started',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { templateVersionId: versionId },
      meta,
    });
    return this.get(id, principal);
  }

  /**
   * Saves the answers that are sent and leaves the others as they are; an empty value takes an
   * answer back. Gaps are fine here: completeness is asked for when the project is submitted.
   */
  async saveAnswers(
    id: string,
    input: SaveQuestionnaireAnswersInput,
    principal: Principal,
  ): Promise<ProjectQuestionnaireView> {
    const relation = await this.projects.relationOf(id, principal);
    if (!relation.owner) throw new ForbiddenError('فقط متقاضی به پرسشنامه پروژه پاسخ می‌دهد.');
    await this.prisma.$transaction(async (tx) => {
      // The same lock as a submission, so answers do not change under a check for completeness.
      const status = await this.projects.lock(tx, id);
      if (!APPLICANT_STATUSES.includes(status)) throw new ConflictError(LOCKED_ANSWERS);
      const questionnaire = await this.reader.load(tx, id);
      if (!questionnaire) throw new NotFoundError();
      const questions = questionsOfProject(questionnaire);
      // The answer of a file question is the list of the files handed in for it, and only the
      // documents of the project write it: an id sent here would not have been checked.
      const files = questions.filter(
        (question) => question.type === 'file' && question.key in input.answers,
      );
      if (files.length > 0) {
        throw new ValidationFailedError(
          files.map((question) => ({
            path: `answers.${question.key}`,
            message: 'فایل این سؤال از بخش مدارک پروژه بارگذاری می‌شود.',
          })),
        );
      }
      const checked = validateAnswers(questions, input.answers);
      if (!checked.ok) throw new ValidationFailedError(answerIssues(checked.issues));
      for (const [questionKey, value] of Object.entries(checked.answers)) {
        if (value === null) {
          await tx.questionnaireAnswer.deleteMany({ where: { projectId: id, questionKey } });
          continue;
        }
        const stored = value as unknown as Prisma.InputJsonValue;
        await tx.questionnaireAnswer.upsert({
          where: { projectId_questionKey: { projectId: id, questionKey } },
          create: { projectId: id, questionKey, value: stored, updatedById: principal.userId },
          update: { value: stored, updatedById: principal.userId },
        });
      }
    }, SAVE_TIMEOUT);
    return this.get(id, principal);
  }

  /** Adds a question, a document or a note to one project, in the caller's capacity. */
  async addItem(
    id: string,
    input: AddProjectQuestionnaireItemInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ProjectQuestionnaireView> {
    const relation = await this.projects.relationOf(id, principal);
    const capacity = capacityOf(relation);
    if (!capacity) throw new ForbiddenError();

    let created: { id: string; ownerId: string; code: string; title: string } | undefined;
    for (let attempt = 1; !created; attempt++) {
      const key = generateItemKey();
      const content: ProjectItemContent =
        input.kind === 'QUESTION'
          ? { kind: 'QUESTION', question: { ...input.question, key } }
          : input.kind === 'DOCUMENT'
            ? { kind: 'DOCUMENT', document: { ...input.document, key } }
            : { kind: 'NOTE', text: input.text };
      try {
        created = await this.prisma.$transaction(async (tx) => {
          const status = await this.projects.lock(tx, id);
          this.assertItemsOpen(capacity, status);
          // Each side has its own share, so neither can use up the other's.
          const count = await tx.projectQuestionnaireItem.count({
            where: { projectId: id, origin: capacity },
          });
          if (count >= MAX_PROJECT_QUESTIONNAIRE_ITEMS) {
            throw new ConflictError('حداکثر تعداد موارد اختصاصی این پروژه پر شده است.');
          }
          const item = await tx.projectQuestionnaireItem.create({
            data: {
              projectId: id,
              kind: input.kind,
              key,
              definition: content,
              origin: capacity,
              addedById: principal.userId,
            },
            select: { id: true, project: { select: { ownerId: true, code: true, title: true } } },
          });
          return { id: item.id, ...item.project };
        });
      } catch (error) {
        const collision =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!collision || attempt >= MAX_KEY_ATTEMPTS) throw error;
      }
    }

    await this.audit.record({
      action: 'feasibility_project.questionnaire_item_added',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { itemId: created.id, kind: input.kind, origin: capacity },
      meta,
    });
    if (capacity === 'staff') {
      // Best effort: the item is there, so a failed notice must not fail the request.
      await this.inbox
        .notifyUsers([created.ownerId], {
          kind: 'feasibility_project.questionnaire_item_added',
          title: `${PROJECT_ITEM_KIND_LABELS_FA[input.kind]} تازه‌ای به پرسشنامه پروژه ${created.code} افزوده شد`,
          body: created.title,
          link: `/dashboard/feasibility/${id}`,
        })
        .catch((error: unknown) => {
          this.logger.warn({ err: error, projectId: id }, 'questionnaire notice failed');
        });
    }
    return this.get(id, principal);
  }

  /** Takes an item out again, with its answer; each side removes what it added itself. */
  async removeItem(
    id: string,
    itemId: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ProjectQuestionnaireView> {
    const relation = await this.projects.relationOf(id, principal);
    const capacity = capacityOf(relation);
    if (!capacity) throw new ForbiddenError();
    const removed = await this.prisma.$transaction(async (tx) => {
      const status = await this.projects.lock(tx, id);
      const item = await tx.projectQuestionnaireItem.findFirst({
        where: { id: itemId, projectId: id },
        select: { key: true, kind: true, origin: true, definition: true },
      });
      if (!item) throw new NotFoundError();
      if (item.origin !== capacity) {
        throw new ForbiddenError(
          capacity === 'applicant'
            ? 'موردی را که کارشناسان افزوده‌اند فقط خودشان برمی‌دارند.'
            : 'موردی را که متقاضی افزوده است فقط خودش برمی‌دارد.',
        );
      }
      this.assertItemsOpen(capacity, status);
      await tx.projectQuestionnaireItem.delete({ where: { id: itemId } });
      const answers = await tx.questionnaireAnswer.findMany({
        where: { projectId: id, questionKey: item.key },
        select: { id: true },
      });
      await tx.questionnaireAnswer.deleteMany({ where: { projectId: id, questionKey: item.key } });
      // The files handed in for a document or a file question go with it.
      const fileIds = await this.documents.detach(tx, id, item.key);
      return { ...item, answered: answers.length > 0, fileIds };
    });
    await this.documents.discard(id, principal, meta, removed.fileIds);
    await this.audit.record({
      action: 'feasibility_project.questionnaire_item_removed',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      // What was removed stays readable here. Of an answer only that there was one: what the
      // applicant wrote is not for the readers of the audit log.
      metadata: {
        itemId,
        kind: removed.kind,
        origin: removed.origin,
        definition: removed.definition,
        answered: removed.answered,
        files: removed.fileIds.length,
      },
      meta,
    });
    return this.get(id, principal);
  }

  private assertItemsOpen(capacity: ProjectItemOrigin, status: FeasibilityStatus): void {
    if (mayChangeItems(capacity, status)) return;
    throw new ConflictError(
      capacity === 'applicant'
        ? LOCKED_ANSWERS
        : 'پس از پایان بررسی اولیه، موردی به پرسشنامه پروژه افزوده یا از آن برداشته نمی‌شود.',
    );
  }
}
