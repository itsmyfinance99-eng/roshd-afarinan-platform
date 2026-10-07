import { Injectable, Logger } from '@nestjs/common';
import {
  FEASIBILITY_REVIEW_SECTION_LABELS_FA,
  FEASIBILITY_WORK_STATUSES,
  MAX_PROJECT_REVIEW_THREADS,
  MAX_REVIEW_THREAD_COMMENTS,
  type CreateReviewReplyInput,
  type CreateReviewThreadInput,
  type FeasibilityReviewSection,
  type ListReviewThreadsQuery,
  type SetReviewThreadHandledInput,
} from '@roshd/validation';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
import { staffRef, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import {
  actorsOf,
  type FeasibilityActor,
  type FeasibilityStatus,
} from './domain/feasibility-status';
import { FeasibilityProjectsService } from './feasibility-projects.service';

const MANAGE_PERMISSION = 'feasibility:manage';
const EXPERT_PERMISSION = 'feasibility:work';

const isWorkedOn = (status: FeasibilityStatus): boolean =>
  (FEASIBILITY_WORK_STATUSES as readonly FeasibilityStatus[]).includes(status);

const sectionLabel = (section: string): string =>
  FEASIBILITY_REVIEW_SECTION_LABELS_FA[section as FeasibilityReviewSection] ?? section;

const CLOSED_REVIEW = 'نظر بازبینی فقط هنگام انجام و بازبینی مطالعه نوشته و رسیدگی می‌شود.';
const NO_THREAD = 'این نظر در پروژه نیست.';

const THREAD_SELECT = {
  id: true,
  section: true,
  shared: true,
  startedById: true,
  createdAt: true,
  handledAt: true,
  handledById: true,
  comments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, body: true, createdAt: true, authorId: true, authorAs: true },
  },
} satisfies Prisma.FeasibilityReviewThreadSelect;

type ThreadRow = Prisma.FeasibilityReviewThreadGetPayload<{ select: typeof THREAD_SELECT }>;

export interface ReviewCommentView {
  id: string;
  body: string;
  createdAt: Date;
  /** In which capacity it was written. */
  authorAs: FeasibilityActor;
  /** Written by the caller. */
  mine: boolean;
  /** Who wrote it; staff and experts see it, the applicant sees the capacity only. */
  by?: StaffRef | null;
}

export interface ReviewThreadView {
  id: string;
  /** One of `FEASIBILITY_REVIEW_SECTIONS`. */
  section: string;
  /** Whether the applicant reads the thread. */
  shared: boolean;
  createdAt: Date;
  /** Since when the thread counts as handled; `null` while it is open. */
  handledAt: Date | null;
  /** Who marked it handled; staff and experts see it. */
  handledBy?: StaffRef | null;
  /** Oldest first; the first one started the thread. */
  comments: ReviewCommentView[];
  /** What the caller may do with this thread now. */
  access: { reply: boolean; handle: boolean; reopen: boolean };
}

/** The caller on a project: its applicant, or one who works on it, with the capacity recorded. */
interface Viewer {
  userId: string;
  applicant: boolean;
  capacity: FeasibilityActor;
}

type ThreadNews = 'comment' | 'handled' | 'reopened';

/**
 * The comments of the review of a study (ST-35.11, ADR-0010): threads on the parts of the study,
 * each with a handled state.
 *
 * - A thread of the applicant is read by every party of the project. A thread of the staff or of
 *   an expert is between them unless it is shared with the applicant when it is started; for the
 *   applicant a thread that is not shared does not exist (404).
 * - The applicant starts a thread while the study is with them (`CLIENT_REVIEW`); everybody
 *   answers while the study is worked on. From the delivery on the threads are read only.
 * - The staff and the experts mark a thread handled and open it again; the applicant opens a
 *   thread of their own again, and nothing else.
 * - A comment is written once and is never changed. The parties are told that there is a
 *   comment, not what it says; the audit log keeps who wrote and when, without the text.
 */
@Injectable()
export class ProjectReviewService {
  private readonly logger = new Logger(ProjectReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inbox: NotificationsService,
    private readonly rbac: RbacService,
    private readonly users: UsersService,
    private readonly projects: FeasibilityProjectsService,
  ) {}

  /** The threads the caller reads, newest first, each with its comments. */
  async list(
    id: string,
    principal: Principal,
    query: ListReviewThreadsQuery,
  ): Promise<PageResult<ReviewThreadView>> {
    const viewer = await this.viewerOf(id, principal);
    const where: Prisma.FeasibilityReviewThreadWhereInput = {
      projectId: id,
      ...(viewer.applicant ? { shared: true } : {}),
      ...(query.section ? { section: query.section } : {}),
      ...(query.state === 'open'
        ? { handledAt: null }
        : query.state === 'handled'
          ? { handledAt: { not: null } }
          : {}),
    };
    const [project, rows, total] = await this.prisma.$transaction([
      this.prisma.feasibilityProject.findUnique({ where: { id }, select: { status: true } }),
      this.prisma.feasibilityReviewThread.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: THREAD_SELECT,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.feasibilityReviewThread.count({ where }),
    ]);
    if (!project) throw new NotFoundError();
    const names = await this.namesFor(rows, viewer);
    return new PageResult(
      rows.map((row) => this.view(row, viewer, project.status, names)),
      query.page,
      query.pageSize,
      total,
    );
  }

  /** Starts a thread on a part of the study with its first comment. */
  async start(
    id: string,
    input: CreateReviewThreadInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ReviewThreadView> {
    const viewer = await this.viewerOf(id, principal);
    // What the applicant writes is read by everybody; the others choose.
    const shared = viewer.applicant || input.shared === true;
    const { row, status } = await this.prisma.$transaction(async (tx) => {
      // The status is read under the lock a step of the project is taken with.
      const status = await this.projects.lock(tx, id);
      if (!isWorkedOn(status)) throw new ConflictError(CLOSED_REVIEW);
      if (viewer.applicant && status !== 'CLIENT_REVIEW') {
        throw new ConflictError(
          'نظر تازه را هنگامی می‌نویسید که مطالعه برای بازبینی نزد شما است. تا آن زمان می‌توانید به نظرهای موجود پاسخ دهید.',
        );
      }
      const count = await tx.feasibilityReviewThread.count({ where: { projectId: id } });
      if (count >= MAX_PROJECT_REVIEW_THREADS) {
        throw new ConflictError(
          'حداکثر تعداد نظرهای بازبینی این پروژه نوشته شده است. به نظرهای موجود پاسخ دهید.',
        );
      }
      const row = await tx.feasibilityReviewThread.create({
        data: {
          projectId: id,
          section: input.section,
          shared,
          startedById: viewer.userId,
          comments: {
            create: { authorId: viewer.userId, authorAs: viewer.capacity, body: input.body },
          },
        },
        select: THREAD_SELECT,
      });
      return { row, status };
    });
    await this.audit.record({
      action: 'feasibility_project.review_thread_started',
      actorId: viewer.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { threadId: row.id, section: row.section, shared },
      meta,
    });
    await this.tell(id, row, viewer, 'comment');
    return this.view(row, viewer, status, await this.namesFor([row], viewer));
  }

  /** Answers in a thread the caller reads. */
  async reply(
    id: string,
    threadId: string,
    input: CreateReviewReplyInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ReviewThreadView> {
    const viewer = await this.viewerOf(id, principal);
    const { row, status, commentId } = await this.prisma.$transaction(async (tx) => {
      const status = await this.projects.lock(tx, id);
      const thread = await tx.feasibilityReviewThread.findFirst({
        where: this.readable(id, threadId, viewer),
        select: { _count: { select: { comments: true } } },
      });
      if (!thread) throw new NotFoundError(NO_THREAD);
      if (!isWorkedOn(status)) throw new ConflictError(CLOSED_REVIEW);
      if (thread._count.comments >= MAX_REVIEW_THREAD_COMMENTS) {
        throw new ConflictError(
          'این رشته به حداکثر تعداد پاسخ رسیده است. ادامه گفت‌وگو را در نظر تازه‌ای بنویسید.',
        );
      }
      const comment = await tx.feasibilityReviewComment.create({
        data: {
          threadId,
          authorId: viewer.userId,
          authorAs: viewer.capacity,
          body: input.body,
        },
        select: { id: true },
      });
      const row = await tx.feasibilityReviewThread.findUniqueOrThrow({
        where: { id: threadId },
        select: THREAD_SELECT,
      });
      return { row, status, commentId: comment.id };
    });
    await this.audit.record({
      action: 'feasibility_project.review_comment_added',
      actorId: viewer.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { threadId, commentId },
      meta,
    });
    await this.tell(id, row, viewer, 'comment');
    return this.view(row, viewer, status, await this.namesFor([row], viewer));
  }

  /**
   * Marks a thread handled or opens it again. Asking for the state it has already changes
   * nothing and tells nobody.
   */
  async setHandled(
    id: string,
    threadId: string,
    input: SetReviewThreadHandledInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ReviewThreadView> {
    const viewer = await this.viewerOf(id, principal);
    const { row, status, changed } = await this.prisma.$transaction(async (tx) => {
      const status = await this.projects.lock(tx, id);
      const thread = await tx.feasibilityReviewThread.findFirst({
        where: this.readable(id, threadId, viewer),
        select: { startedById: true, handledAt: true },
      });
      if (!thread) throw new NotFoundError(NO_THREAD);
      if (viewer.applicant && (input.handled || thread.startedById !== viewer.userId)) {
        // Whether a comment was dealt with is said by those who deal with it.
        throw new ForbiddenError(
          'رسیدگی به نظرها را کارشناسان و کارکنان پروژه ثبت می‌کنند؛ شما نظر خودتان را دوباره باز می‌کنید.',
        );
      }
      if (!isWorkedOn(status)) throw new ConflictError(CLOSED_REVIEW);
      const changed = (thread.handledAt !== null) !== input.handled;
      const row = changed
        ? await tx.feasibilityReviewThread.update({
            where: { id: threadId },
            data: input.handled
              ? { handledAt: new Date(), handledById: viewer.userId }
              : { handledAt: null, handledById: null },
            select: THREAD_SELECT,
          })
        : await tx.feasibilityReviewThread.findUniqueOrThrow({
            where: { id: threadId },
            select: THREAD_SELECT,
          });
      return { row, status, changed };
    });
    if (changed) {
      await this.audit.record({
        action: input.handled
          ? 'feasibility_project.review_thread_handled'
          : 'feasibility_project.review_thread_reopened',
        actorId: viewer.userId,
        entityType: 'feasibility_project',
        entityId: id,
        metadata: { threadId },
        meta,
      });
      await this.tell(id, row, viewer, input.handled ? 'handled' : 'reopened');
    }
    return this.view(row, viewer, status, await this.namesFor([row], viewer));
  }

  /** A thread of the project the caller reads: the applicant reads the shared ones only. */
  private readable(
    projectId: string,
    threadId: string,
    viewer: Viewer,
  ): Prisma.FeasibilityReviewThreadWhereInput {
    return { id: threadId, projectId, ...(viewer.applicant ? { shared: true } : {}) };
  }

  /** 404 for a project the caller has no relation to. */
  private async viewerOf(id: string, principal: Principal): Promise<Viewer> {
    const relation = await this.projects.relationOf(id, principal);
    // A visible project gives its caller at least one capacity; the first one is recorded.
    const capacity = actorsOf(relation)[0] ?? 'staff';
    return { userId: principal.userId, applicant: relation.owner, capacity };
  }

  /** The names the staff and the experts read with the threads; the applicant reads none. */
  private async namesFor(rows: ThreadRow[], viewer: Viewer): Promise<Map<string, string> | null> {
    if (viewer.applicant) return null;
    return this.users.namesByIds(
      rows.flatMap((row) => [
        ...(row.handledById ? [row.handledById] : []),
        ...row.comments.flatMap((comment) => comment.authorId ?? []),
      ]),
    );
  }

  private view(
    row: ThreadRow,
    viewer: Viewer,
    status: FeasibilityStatus,
    names: Map<string, string> | null,
  ): ReviewThreadView {
    const open = isWorkedOn(status);
    const handled = row.handledAt !== null;
    return {
      id: row.id,
      section: row.section,
      shared: row.shared,
      createdAt: row.createdAt,
      handledAt: row.handledAt,
      ...(names ? { handledBy: staffRef(row.handledById, names) } : {}),
      comments: row.comments.map(({ authorId, ...comment }) => ({
        ...comment,
        mine: authorId === viewer.userId,
        ...(names ? { by: staffRef(authorId, names) } : {}),
      })),
      access: {
        reply: open,
        handle: open && !handled && !viewer.applicant,
        reopen: open && handled && (!viewer.applicant || row.startedById === viewer.userId),
      },
    };
  }

  /**
   * Tells the other parties that a thread has news (best effort): the assigned experts, the
   * staff who took part in it (every one of them when the applicant wrote), and the applicant
   * when the thread is shared. A change of the handled state is told to whoever started the
   * thread; a thread the applicant opens again is news for those who work on the study.
   */
  private async tell(
    projectId: string,
    thread: ThreadRow,
    actor: Viewer,
    news: ThreadNews,
  ): Promise<void> {
    try {
      const project = await this.prisma.feasibilityProject.findUnique({
        where: { id: projectId },
        select: { ownerId: true, code: true },
      });
      if (!project) return;
      const assignments = await this.prisma.expertAssignment.findMany({
        where: { projectId, endedAt: null },
        select: { expertId: true },
      });
      // Only those who can still open the project.
      const able = new Set(await this.rbac.userIdsWithPermission(EXPERT_PERMISSION));
      const experts = assignments.map((a) => a.expertId).filter((userId) => able.has(userId));
      const managers = await this.rbac.userIdsWithPermission(MANAGE_PERMISSION);
      const others = (userIds: string[]): string[] =>
        userIds.filter((userId) => userId !== actor.userId && userId !== project.ownerId);

      const title =
        news === 'comment'
          ? `نظر تازه در بازبینی پروژه ${project.code}`
          : news === 'handled'
            ? `به نظر شما در بازبینی پروژه ${project.code} رسیدگی شد`
            : `نظری در بازبینی پروژه ${project.code} دوباره باز شد`;
      const notification = {
        kind: `feasibility_project.review_${news}`,
        title,
        body: `بخش «${sectionLabel(thread.section)}»`,
      };
      const staffSide = { ...notification, link: `/dashboard/manage/feasibility/${projectId}` };
      const applicantSide = { ...notification, link: `/dashboard/feasibility/${projectId}` };

      if (news === 'handled' || (news === 'reopened' && !actor.applicant)) {
        const starter = thread.startedById;
        if (!starter || starter === actor.userId) return;
        if (starter === project.ownerId) {
          if (thread.shared) await this.inbox.notifyUsers([starter], applicantSide);
          return;
        }
        if (experts.includes(starter) || managers.includes(starter)) {
          await this.inbox.notifyUsers([starter], staffSide);
        }
        return;
      }

      const took = new Set(thread.comments.flatMap((comment) => comment.authorId ?? []));
      const staff = actor.applicant ? managers : managers.filter((userId) => took.has(userId));
      await this.inbox.notifyUsers(others([...experts, ...staff]), staffSide);
      if (thread.shared && !actor.applicant) {
        await this.inbox.notifyUsers([project.ownerId], applicantSide);
      }
    } catch (error) {
      this.logger.warn({ err: error, projectId }, 'review announcement failed');
    }
  }
}
