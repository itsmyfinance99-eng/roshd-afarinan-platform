import { Injectable, Logger } from '@nestjs/common';
import {
  FEASIBILITY_EDITABLE_STATUSES,
  FEASIBILITY_REVIEW_QUEUE_STATUSES,
  FEASIBILITY_SECTORS,
  FEASIBILITY_STAFF_NOTE_REQUIRED,
  FEASIBILITY_STATUS_LABELS_FA,
  MAX_FEASIBILITY_DRAFTS,
  MAX_PROJECT_EXPERTS,
  type AssignExpertInput,
  type ConvertRequestToProjectInput,
  type CreateFeasibilityProjectInput,
  type FeasibilityCostEstimateInput,
  type FeasibilityTransitionInput,
  type ListFeasibilityProjectsQuery,
  type UpdateFeasibilityProjectInput,
} from '@roshd/validation';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { FilesService, type FileView } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hasPermission, type Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
import { ServiceRequestsService } from '../service-requests/service-requests.service';
import { staffRef, staffRefs, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import {
  actorsOf,
  allowedTransitions,
  generateProjectCode,
  transitionAs,
  type FeasibilityActor,
  type FeasibilityStatus,
} from './domain/feasibility-status';
import { QuestionnaireReader } from './questionnaire-reader';

const MANAGE_PERMISSION = 'feasibility:manage';
/** Permission an assigned expert must hold. */
const EXPERT_PERMISSION = 'feasibility:work';
const MAX_CODE_ATTEMPTS = 5;
/** How much of the note of a step a notification carries; the whole note is on the project. */
const NOTICE_NOTE_MAX = 300;
/** The part of a note a notification carries: cut between characters, and marked as cut. */
const noticeNote = (note: string): string => {
  const characters = Array.from(note);
  return characters.length > NOTICE_NOTE_MAX
    ? `${characters.slice(0, NOTICE_NOTE_MAX - 1).join('')}…`
    : note;
};
const ARCHIVED_PROJECT = 'پروژه بایگانی‌شده تغییر نمی‌کند.';

/** Under which name the files of a project are attached to it. */
const FILE_ENTITY = 'feasibility_project';

/** Where staff and experts open a project in the dashboard. */
const staffLink = (id: string): string => `/dashboard/manage/feasibility/${id}`;
/** Where the applicant opens their project. */
const applicantLink = (id: string): string => `/dashboard/feasibility/${id}`;

const isSector = (value: unknown): value is (typeof FEASIBILITY_SECTORS)[number] =>
  (FEASIBILITY_SECTORS as readonly unknown[]).includes(value);

const SUMMARY_SELECT = {
  id: true,
  code: true,
  title: true,
  sector: true,
  location: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FeasibilityProjectSelect;

export type FeasibilityProjectSummary = Prisma.FeasibilityProjectGetPayload<{
  select: typeof SUMMARY_SELECT;
}> & {
  /** Present in the staff and expert lists only. */
  applicant?: StaffRef | null;
};

export interface FeasibilityStatusEventView {
  fromStatus: FeasibilityStatus | null;
  toStatus: FeasibilityStatus;
  actor: FeasibilityActor;
  note: string | null;
  createdAt: Date;
  /** Who it was; staff and experts see it, the applicant sees the capacity only. */
  by?: StaffRef | null;
}

/** The cost estimate of a study as the applicant and the staff read it. */
export interface CostEstimateView {
  /** Whole rials as digits; money never travels as a number. */
  amountRials: string;
  scope: string;
  durationDays: number;
  createdAt: Date;
}

export interface ProjectExpertView {
  expert: StaffRef;
  since: Date;
}

export interface FeasibilityProjectDetail extends FeasibilityProjectSummary {
  summary: string | null;
  events: FeasibilityStatusEventView[];
  /** The Phase 1 request the project was made from, if any. */
  sourceRequest: { id: string; trackingCode: string } | null;
  /** Files that came with the request; empty for an expert, who cannot open them yet. */
  attachments: FileView[];
  /**
   * The cost estimate of the study, once the staff entered it. The applicant and the staff read
   * it; for an expert it is always null.
   */
  costEstimate: CostEstimateView | null;
  /** What the caller may do with this project now. */
  access: {
    /**
     * The steps open to the caller. `COST_ESTIMATED` among them is taken by entering the
     * estimate (`POST …/cost-estimate`), not as a plain transition.
     */
    transitions: FeasibilityStatus[];
    /** Change the details (the applicant, before the review and when more is asked for). */
    edit: boolean;
    /** Delete the project (the applicant, a draft of their own making). */
    remove: boolean;
    assignExperts: boolean;
    releaseExperts: boolean;
  };
  /** The experts working on the project; staff and experts see them, the applicant does not. */
  experts?: ProjectExpertView[];
}

const isEditable = (status: FeasibilityStatus): boolean =>
  (FEASIBILITY_EDITABLE_STATUSES as readonly FeasibilityStatus[]).includes(status);

/** The caller's relations to a project; at least one holds for a visible project. */
export interface ProjectRelation {
  owner: boolean;
  manager: boolean;
  expert: boolean;
}

/**
 * Feasibility projects (ST-35.01, ADR-0010).
 *
 * - A project is visible to its applicant, to staff holding `feasibility:manage` and to the
 *   experts assigned to it; for anyone else it does not exist (404, so ids cannot be probed).
 * - The status changes only in `move()`, behind `transition()` and `estimate()`: the state
 *   machine decides, the change and its status event are written together, and it is audited
 *   and announced to the other parties.
 * - The step to the cost estimate is taken only with an estimate (ST-35.08): the staff enter
 *   the amount, nothing computes it, and the applicant accepts or declines it.
 * - On their own project a user is the applicant and nothing else: staff rights and an
 *   assignment do not count there.
 */
@Injectable()
export class FeasibilityProjectsService {
  private readonly logger = new Logger(FeasibilityProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inbox: NotificationsService,
    private readonly rbac: RbacService,
    private readonly users: UsersService,
    private readonly files: FilesService,
    private readonly requests: ServiceRequestsService,
    private readonly questionnaire: QuestionnaireReader,
  ) {}

  async list(
    principal: Principal,
    query: ListFeasibilityProjectsQuery,
  ): Promise<PageResult<FeasibilityProjectSummary>> {
    let scope: Prisma.FeasibilityProjectWhereInput;
    if (query.scope === 'all') {
      if (!hasPermission(principal, MANAGE_PERMISSION)) throw new ForbiddenError();
      scope = {};
    } else if (query.scope === 'assigned') {
      if (!hasPermission(principal, EXPERT_PERMISSION)) throw new ForbiddenError();
      scope = {
        ownerId: { not: principal.userId },
        experts: { some: { expertId: principal.userId, endedAt: null } },
      };
    } else {
      scope = { ownerId: principal.userId };
    }
    // The review queue is the staff's: what waits for the intake, the longest waiting first.
    const queue = query.queue === 'review';
    if (queue && query.scope !== 'all') {
      throw new ValidationFailedError([
        { path: 'queue', message: 'صف بررسی فقط برای همه پروژه‌ها (scope=all) است.' },
      ]);
    }
    // A status narrows the queue and never widens it: one outside the queue matches nothing.
    const queued = FEASIBILITY_REVIEW_QUEUE_STATUSES.filter(
      (status) => !query.status || status === query.status,
    );
    const where: Prisma.FeasibilityProjectWhereInput = {
      ...scope,
      ...(queue ? { status: { in: queued } } : query.status ? { status: query.status } : {}),
      ...(query.sourceRequestId ? { sourceRequestId: query.sourceRequestId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feasibilityProject.findMany({
        where,
        select: { ...SUMMARY_SELECT, ownerId: true },
        orderBy: queue
          ? [{ updatedAt: 'asc' }, { id: 'asc' }]
          : [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.feasibilityProject.count({ where }),
    ]);
    const names =
      query.scope === 'mine'
        ? undefined
        : await this.users.namesByIds(rows.map((row) => row.ownerId));
    const items = rows.map(({ ownerId, ...item }) => ({
      ...item,
      ...(names ? { applicant: staffRef(ownerId, names) } : {}),
    }));
    return new PageResult(items, query.page, query.pageSize, total);
  }

  /** A new project is the applicant's draft; nobody is told about it until it is submitted. */
  async create(
    input: CreateFeasibilityProjectInput,
    owner: Principal,
    meta: RequestMeta,
  ): Promise<FeasibilityProjectDetail> {
    // A soft cap against runaway use, as for financial models.
    const drafts = await this.prisma.feasibilityProject.count({
      where: { ownerId: owner.userId, status: 'DRAFT' },
    });
    if (drafts >= MAX_FEASIBILITY_DRAFTS) {
      throw new ConflictError(
        'حداکثر تعداد پروژه‌های پیش‌نویس پر شده است. پیش از ساخت پروژه تازه، پیش‌نویس‌های قبلی را کامل و ارسال کنید.',
      );
    }
    const project = await this.insertWithUniqueCode(input, owner.userId);
    await this.audit.record({
      action: 'feasibility_project.created',
      actorId: owner.userId,
      entityType: 'feasibility_project',
      entityId: project.id,
      meta,
    });
    return this.get(project.id, owner);
  }

  /**
   * The applicant changes the details of their project, while it is a draft or after the staff
   * asked for more information; from the review on the details stand as they were submitted.
   */
  async update(
    id: string,
    input: UpdateFeasibilityProjectInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<FeasibilityProjectDetail> {
    const relation = await this.relationOf(id, principal);
    if (!relation.owner) {
      throw new ForbiddenError('فقط متقاضی مشخصات پروژه را تغییر می‌دهد.');
    }
    const data: Prisma.FeasibilityProjectUpdateManyMutationInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.sector !== undefined ? { sector: input.sector } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.summary !== undefined ? { summary: input.summary || null } : {}),
    };
    // Conditional on the status: a project that went to review meanwhile is not changed.
    const { count } = await this.prisma.feasibilityProject.updateMany({
      where: { id, status: { in: [...FEASIBILITY_EDITABLE_STATUSES] } },
      data,
    });
    if (count !== 1) {
      throw new ConflictError(
        'مشخصات پروژه فقط در پیش‌نویس یا هنگام درخواست اطلاعات تکمیلی تغییر می‌کند.',
      );
    }
    await this.audit.record({
      action: 'feasibility_project.updated',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { fields: Object.keys(data) },
      meta,
    });
    return this.get(id, principal);
  }

  /**
   * The applicant deletes a draft they started themselves. A project that was submitted once is
   * kept with its history, and one made from a request belongs to that request.
   */
  async remove(id: string, principal: Principal, meta: RequestMeta): Promise<void> {
    const relation = await this.relationOf(id, principal);
    if (!relation.owner) throw new ForbiddenError('فقط متقاضی پیش‌نویس خودش را حذف می‌کند.');
    const { count } = await this.prisma.feasibilityProject.deleteMany({
      where: { id, status: 'DRAFT', sourceRequestId: null },
    });
    if (count !== 1) {
      throw new ConflictError('فقط پیش‌نویسی که خودتان ساخته‌اید و هنوز ارسال نشده حذف می‌شود.');
    }
    // The documents handed in for the draft have nothing left to belong to. The draft is gone
    // either way; files that could not be removed now are collected by the sweep of the files.
    await this.files
      .removeOfEntity({ entityType: FILE_ENTITY, entityId: id }, principal, meta)
      .catch((error: unknown) => {
        this.logger.warn({ err: error, projectId: id }, 'files of a deleted draft not removed');
      });
    await this.audit.record({
      action: 'feasibility_project.deleted',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      meta,
    });
  }

  /**
   * Staff turn a Phase 1 feasibility request into a project of the requester (ADR-0010 §9). The
   * project starts as a draft the applicant completes and submits; the attachments of the request
   * move to it, and a request becomes a project only once.
   */
  async createFromRequest(
    input: ConvertRequestToProjectInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<FeasibilityProjectDetail> {
    const source = await this.requests.sourceFor(input.requestId, actor);
    if (source.type !== 'FEASIBILITY') {
      throw new ConflictError('فقط درخواست امکان‌سنجی به پروژه تبدیل می‌شود.');
    }
    if (!source.userId) {
      throw new ConflictError(
        'این درخواست بدون حساب کاربری ثبت شده است و متقاضی‌ای ندارد که پروژه به نام او ساخته شود.',
      );
    }
    if (source.userId === actor.userId) {
      // On a project of their own a user is the applicant only, so a colleague converts it.
      throw new ForbiddenError('درخواست خودتان را همکار دیگری به پروژه تبدیل می‌کند.');
    }
    const ownerId = source.userId;
    const details =
      source.details && typeof source.details === 'object' && !Array.isArray(source.details)
        ? source.details
        : {};
    const location = typeof details.location === 'string' ? details.location : null;

    let created: { id: string; code: string; moved: number } | undefined;
    for (let attempt = 1; !created; attempt++) {
      try {
        created = await this.prisma.$transaction(async (tx) => {
          const project = await tx.feasibilityProject.create({
            data: {
              code: generateProjectCode(),
              ownerId,
              title: input.title,
              sector: isSector(details.sector) ? details.sector : null,
              location,
              summary: source.message,
              sourceRequestId: source.id,
              events: {
                create: {
                  toStatus: 'DRAFT',
                  actor: 'staff',
                  actorId: actor.userId,
                  note: `از درخواست ${source.trackingCode} ساخته شد.`,
                },
              },
            },
            select: { id: true, code: true },
          });
          const moved = await this.files.moveAttachments(
            { entityType: 'service_request', entityId: source.id },
            { entityType: FILE_ENTITY, entityId: project.id },
            tx,
          );
          return { ...project, moved };
        });
      } catch (error) {
        const collision =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!collision) throw error;
        // Either the request has its project already, or the random code was taken.
        const existing = await this.prisma.feasibilityProject.findUnique({
          where: { sourceRequestId: source.id },
          select: { code: true },
        });
        if (existing) {
          throw new ConflictError(`این درخواست پیش‌تر به پروژه ${existing.code} تبدیل شده است.`);
        }
        if (attempt >= MAX_CODE_ATTEMPTS) throw error;
      }
    }

    await this.audit.record({
      action: 'feasibility_project.created_from_request',
      actorId: actor.userId,
      entityType: 'feasibility_project',
      entityId: created.id,
      metadata: { requestId: source.id, attachments: created.moved },
      meta,
    });
    await this.inbox.notifyUsers(
      [ownerId],
      {
        kind: 'feasibility_project.created_from_request',
        title: `درخواست ${source.trackingCode} به پروژه ${created.code} تبدیل شد`,
        body: 'مشخصات پروژه را کامل و برای بررسی ارسال کنید.',
        link: applicantLink(created.id),
      },
      {
        template: 'feasibility-project.created-from-request',
        data: { code: created.code, title: input.title, trackingCode: source.trackingCode },
      },
    );
    return this.get(created.id, actor);
  }

  async get(id: string, principal: Principal): Promise<FeasibilityProjectDetail> {
    const relation = await this.relationOf(id, principal);
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: {
        ...SUMMARY_SELECT,
        summary: true,
        ownerId: true,
        sourceRequestId: true,
        events: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            fromStatus: true,
            toStatus: true,
            actor: true,
            actorId: true,
            note: true,
            createdAt: true,
          },
        },
        experts: {
          where: { endedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { expertId: true, createdAt: true },
        },
      },
    });
    if (!project) throw new NotFoundError();
    const { ownerId, sourceRequestId, events, experts, ...rest } = project;
    const trackingCode = sourceRequestId
      ? await this.requests.trackingCodeOf(sourceRequestId)
      : null;
    const view = {
      ...rest,
      sourceRequest: sourceRequestId && trackingCode ? { id: sourceRequestId, trackingCode } : null,
      // Listed for those who can open them; an expert gets the documents in ST-35.06.
      attachments:
        relation.owner || relation.manager
          ? await this.files.listForEntity(FILE_ENTITY, id, ['FEASIBILITY_DOCUMENT'])
          : [],
      // The price is between the applicant and the staff; an expert works without it.
      costEstimate: relation.owner || relation.manager ? await this.estimateOf(id) : null,
    };
    const actors = actorsOf(relation);
    const access = {
      transitions: [...new Set(actors.flatMap((actor) => allowedTransitions(view.status, actor)))],
      edit: relation.owner && isEditable(view.status),
      remove: relation.owner && view.status === 'DRAFT' && sourceRequestId === null,
      assignExperts: relation.manager && !relation.owner && view.status !== 'ARCHIVED',
      releaseExperts: relation.manager && !relation.owner,
    };
    if (relation.owner) {
      return {
        ...view,
        events: events.map(({ actorId: _actorId, ...event }) => event),
        access,
      };
    }
    const names = await this.users.namesByIds([
      ownerId,
      ...events.flatMap((event) => event.actorId ?? []),
      ...experts.map((assignment) => assignment.expertId),
    ]);
    return {
      ...view,
      applicant: staffRef(ownerId, names),
      events: events.map(({ actorId, ...event }) => ({ ...event, by: staffRef(actorId, names) })),
      experts: experts.map((assignment) => ({
        expert: staffRef(assignment.expertId, names)!,
        since: assignment.createdAt,
      })),
      access,
    };
  }

  /** A step of the project that needs nothing but the step itself (and its note). */
  async transition(
    id: string,
    input: FeasibilityTransitionInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<FeasibilityProjectDetail> {
    return this.move(id, input, principal, meta);
  }

  /**
   * The staff enter what the study costs, what it covers and how long it takes, and the project
   * goes to the applicant to accept or decline (ST-35.08). The estimate and the step are
   * written together; the amount is what the staff typed, nothing computes it.
   */
  async estimate(
    id: string,
    input: FeasibilityCostEstimateInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<FeasibilityProjectDetail> {
    const { note, ...estimate } = input;
    return this.move(id, { to: 'COST_ESTIMATED', note }, principal, meta, estimate);
  }

  /**
   * The only way the status of a project changes. The caller acts in the capacities they have on
   * this project; the first one the state machine accepts is recorded with the event.
   */
  private async move(
    id: string,
    input: FeasibilityTransitionInput,
    principal: Principal,
    meta: RequestMeta,
    estimate?: Omit<FeasibilityCostEstimateInput, 'note'>,
  ): Promise<FeasibilityProjectDetail> {
    const relation = await this.relationOf(id, principal);
    const current = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: {
        status: true,
        ownerId: true,
        code: true,
        title: true,
        sector: true,
        summary: true,
      },
    });
    if (!current) throw new NotFoundError();
    const decision = transitionAs(current.status, input.to, actorsOf(relation));
    if (!decision.ok) {
      if (decision.reason === 'actor_not_allowed') {
        throw new ForbiddenError('شما اجازه این تغییر وضعیت را ندارید.');
      }
      throw new ConflictError('تغییر وضعیت پروژه به این مرحله مجاز نیست.');
    }
    if (
      decision.actor === 'staff' &&
      (FEASIBILITY_STAFF_NOTE_REQUIRED as readonly FeasibilityStatus[]).includes(decision.to) &&
      // Filing a delivered study away is the ordinary end and needs no explanation.
      decision.from !== 'DELIVERED' &&
      !input.note
    ) {
      // The applicant reads this note: what is missing, or why the project was closed.
      throw new ValidationFailedError([
        {
          path: 'note',
          message:
            decision.to === 'NEEDS_MORE_INFO'
              ? 'بنویسید چه اطلاعات یا مدرکی لازم است تا متقاضی بداند چه چیزی را کامل کند.'
              : 'دلیل بایگانی پروژه را برای متقاضی بنویسید.',
        },
      ]);
    }
    if (decision.to === 'COST_ESTIMATED' && !estimate) {
      // The applicant decides on an estimate, so the step is not taken without one.
      throw new ValidationFailedError([
        { path: 'to', message: 'برای این مرحله، برآورد هزینه و مدت مطالعه را ثبت کنید.' },
      ]);
    }
    if (
      decision.from === 'COST_ESTIMATED' &&
      decision.to === 'CONTRACT_PENDING' &&
      !(await this.estimateOf(id))
    ) {
      // A project that reached this status before estimates were recorded has nothing to accept.
      throw new ConflictError(
        'برای این پروژه برآوردی ثبت نشده است که پذیرفته شود. با کارشناسان هماهنگ کنید.',
      );
    }
    if (decision.to === 'SUBMITTED') {
      // The reviewers need to know at least what the project is about and in which field.
      const missing = [
        ...(current.sector ? [] : [{ path: 'sector', message: 'حوزه طرح را انتخاب کنید.' }]),
        ...(current.summary
          ? []
          : [{ path: 'summary', message: 'پیش از ارسال، شرح طرح را بنویسید.' }]),
      ];
      if (missing.length > 0) throw new ValidationFailedError(missing);
    }

    // Conditional update: a concurrent change makes this a no-op and is reported as a conflict.
    const updated = await this.prisma.$transaction(async (tx) => {
      if (decision.to === 'SUBMITTED') {
        // Under the lock the answers are saved with, so what is checked is what is submitted.
        await this.lock(tx, id);
        const open = await this.questionnaire.incomplete(tx, id);
        if (open.length > 0) {
          throw new ValidationFailedError(open, 'پرسشنامه پروژه کامل نیست.');
        }
      }
      const { count } = await tx.feasibilityProject.updateMany({
        where: {
          id,
          status: decision.from,
          // The details that were checked above are still there.
          ...(decision.to === 'SUBMITTED' ? { sector: { not: null }, summary: { not: null } } : {}),
        },
        data: { status: decision.to },
      });
      if (count !== 1) return false;
      await tx.feasibilityStatusEvent.create({
        data: {
          projectId: id,
          fromStatus: decision.from,
          toStatus: decision.to,
          actor: decision.actor,
          actorId: principal.userId,
          note: input.note || null,
        },
      });
      if (estimate) {
        await tx.feasibilityCostEstimate.create({
          data: {
            projectId: id,
            amountRials: estimate.amountRials,
            scope: estimate.scope,
            durationDays: estimate.durationDays,
            createdById: principal.userId,
          },
        });
      }
      return true;
    });
    if (!updated) {
      throw new ConflictError('وضعیت پروژه هم‌زمان تغییر کرده است. دوباره تلاش کنید.');
    }

    await this.audit.record({
      action: 'feasibility_project.status_changed',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: {
        from: decision.from,
        to: decision.to,
        actor: decision.actor,
        // What was estimated is part of the record of who estimated it.
        ...(estimate
          ? { amountRials: estimate.amountRials, durationDays: estimate.durationDays }
          : {}),
      },
      meta,
    });
    // Best effort: the status has changed, so a failed announcement must not fail the request.
    await this.announce(
      id,
      current,
      decision.to,
      decision.actor,
      principal.userId,
      input.note || null,
    ).catch((error: unknown) => {
      this.logger.warn({ err: error, projectId: id }, 'status announcement failed');
    });
    return this.get(id, principal);
  }

  /**
   * Active users the caller may assign to a project (sorted by name, for the staff picker). The
   * caller is left out: nobody assigns themselves.
   */
  async assignableExperts(actor: Principal): Promise<StaffRef[]> {
    const ids = await this.rbac.userIdsWithPermission(EXPERT_PERMISSION);
    return staffRefs(await this.users.namesByIds(ids.filter((id) => id !== actor.userId)));
  }

  /** Assigns an expert to a project (`feasibility:manage`); audited, and the expert is told. */
  async assignExpert(
    id: string,
    input: AssignExpertInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<FeasibilityProjectDetail> {
    const project = await this.manageable(id, actor);
    if (project.status === 'ARCHIVED') throw new ConflictError(ARCHIVED_PROJECT);
    if (input.expertId === actor.userId) {
      // Staff who are experts too get their expert's part from a colleague, not from themselves.
      throw new ValidationFailedError([
        { path: 'expertId', message: 'نمی‌توانید خودتان را کارشناس پروژه کنید.' },
      ]);
    }
    if (input.expertId === project.ownerId) {
      throw new ValidationFailedError([
        { path: 'expertId', message: 'متقاضی نمی‌تواند کارشناس پروژه خودش باشد.' },
      ]);
    }
    if (!(await this.rbac.userHasPermission(input.expertId, EXPERT_PERMISSION))) {
      throw new ValidationFailedError([
        { path: 'expertId', message: 'این کاربر مجوز کار روی پروژه‌های امکان‌سنجی را ندارد.' },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      // One change of the experts of a project at a time.
      const status = await this.lock(tx, id);
      if (status === 'ARCHIVED') throw new ConflictError(ARCHIVED_PROJECT);
      const active = await tx.expertAssignment.findMany({
        where: { projectId: id, endedAt: null },
        select: { expertId: true },
      });
      if (active.some((assignment) => assignment.expertId === input.expertId)) {
        throw new ConflictError('این کارشناس هم‌اکنون به پروژه منتسب است.');
      }
      if (active.length >= MAX_PROJECT_EXPERTS) {
        throw new ConflictError('حداکثر تعداد کارشناسان این پروژه پر شده است.');
      }
      await tx.expertAssignment.create({
        data: { projectId: id, expertId: input.expertId, assignedById: actor.userId },
      });
    });
    await this.audit.record({
      action: 'feasibility_project.expert_assigned',
      actorId: actor.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { expertId: input.expertId },
      meta,
    });
    await this.inbox.notifyUsers([input.expertId], {
      kind: 'feasibility_project.expert_assigned',
      title: `پروژه ${project.code} به شما سپرده شد`,
      body: project.title,
      link: staffLink(id),
    });
    return this.get(id, actor);
  }

  /**
   * Ends an expert's assignment (`feasibility:manage`); the row stays as history. Allowed on an
   * archived project too, so that access to a finished study can be taken back.
   */
  async unassignExpert(
    id: string,
    expertId: string,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<FeasibilityProjectDetail> {
    await this.manageable(id, actor);
    const { count } = await this.prisma.expertAssignment.updateMany({
      where: { projectId: id, expertId, endedAt: null },
      data: { endedAt: new Date(), endedById: actor.userId },
    });
    if (count === 0) throw new NotFoundError('این کارشناس به پروژه منتسب نیست.');
    await this.audit.record({
      action: 'feasibility_project.expert_unassigned',
      actorId: actor.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { expertId },
      meta,
    });
    return this.get(id, actor);
  }

  /**
   * Tells the other parties about a new status: the applicant (in-app and by email), the assigned
   * experts, and the staff when it was not one of them who acted.
   */
  private async announce(
    id: string,
    project: { ownerId: string; code: string; title: string },
    status: FeasibilityStatus,
    actor: FeasibilityActor,
    actorId: string,
    note: string | null,
  ): Promise<void> {
    const label = FEASIBILITY_STATUS_LABELS_FA[status];
    const notification = {
      kind: 'feasibility_project.status_changed',
      title: `وضعیت پروژه ${project.code}: ${label}`,
      // The note of the step is written for the other parties; without one, the project is named.
      body: note ? noticeNote(note) : project.title,
    };
    if (project.ownerId !== actorId) {
      await this.inbox.notifyUsers(
        [project.ownerId],
        { ...notification, link: applicantLink(id) },
        {
          template: 'feasibility-project.status-changed',
          data: { code: project.code, title: project.title, status: label },
        },
      );
    }
    const experts = await this.prisma.expertAssignment.findMany({
      where: { projectId: id, endedAt: null },
      select: { expertId: true },
    });
    // Only experts who can still open the project: an assignment without the permission gives nothing.
    const able = new Set(await this.rbac.userIdsWithPermission(EXPERT_PERMISSION));
    const told = new Set([actorId, project.ownerId]);
    const expertIds = experts
      .map((e) => e.expertId)
      .filter((expertId) => able.has(expertId) && !told.has(expertId));
    await this.inbox.notifyUsers(expertIds, { ...notification, link: staffLink(id) });
    if (actor !== 'staff') {
      for (const expertId of expertIds) told.add(expertId);
      const staff = await this.rbac.userIdsWithPermission(MANAGE_PERMISSION);
      await this.inbox.notifyUsers(
        staff.filter((userId) => !told.has(userId)),
        { ...notification, link: staffLink(id) },
      );
    }
  }

  /** The estimate of a project: the newest one entered for it. */
  private async estimateOf(id: string): Promise<CostEstimateView | null> {
    const row = await this.prisma.feasibilityCostEstimate.findFirst({
      where: { projectId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { amountRials: true, scope: true, durationDays: true, createdAt: true },
    });
    return row ? { ...row, amountRials: row.amountRials.toFixed(0) } : null;
  }

  /** The project for a staff action on it; staff do not manage a project of their own. */
  private async manageable(
    id: string,
    actor: Principal,
  ): Promise<{ ownerId: string; code: string; title: string; status: FeasibilityStatus }> {
    const relation = await this.relationOf(id, actor);
    if (relation.owner || !relation.manager) throw new ForbiddenError();
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: { ownerId: true, code: true, title: true, status: true },
    });
    if (!project) throw new NotFoundError();
    return project;
  }

  /** Locks the project row until the transaction ends and returns its status; 404 when gone. */
  async lock(tx: Prisma.TransactionClient, id: string): Promise<FeasibilityStatus> {
    const rows = await tx.$queryRaw<
      { status: FeasibilityStatus }[]
    >`SELECT "status"::text AS "status" FROM "feasibility_projects" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundError();
    return row.status;
  }

  /** The caller's relations to a project; 404 when there is none (the project may not exist). */
  async relationOf(id: string, principal: Principal): Promise<ProjectRelation> {
    const expert = hasPermission(principal, EXPERT_PERMISSION);
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: {
        ownerId: true,
        experts: {
          // Without the permission the assignment gives nothing, so it is not even read.
          where: { expertId: principal.userId, endedAt: null },
          select: { id: true },
          take: expert ? 1 : 0,
        },
      },
    });
    const relation: ProjectRelation = {
      owner: project?.ownerId === principal.userId,
      manager: project !== null && hasPermission(principal, MANAGE_PERMISSION),
      expert: expert && (project?.experts.length ?? 0) > 0,
    };
    if (!relation.owner && !relation.manager && !relation.expert) throw new NotFoundError();
    return relation;
  }

  private async insertWithUniqueCode(
    input: CreateFeasibilityProjectInput,
    ownerId: string,
  ): Promise<{ id: string }> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.feasibilityProject.create({
          data: {
            code: generateProjectCode(),
            ownerId,
            title: input.title,
            sector: input.sector,
            location: input.location,
            summary: input.summary || null,
            events: { create: { toStatus: 'DRAFT', actor: 'applicant', actorId: ownerId } },
          },
          select: { id: true },
        });
      } catch (error) {
        const collision =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!collision || attempt >= MAX_CODE_ATTEMPTS) throw error;
      }
    }
  }
}
