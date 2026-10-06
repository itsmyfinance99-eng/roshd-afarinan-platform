import { Injectable, Logger } from '@nestjs/common';
import {
  FEASIBILITY_STATUS_LABELS_FA,
  MAX_FEASIBILITY_DRAFTS,
  MAX_PROJECT_EXPERTS,
  type AssignExpertInput,
  type CreateFeasibilityProjectInput,
  type FeasibilityTransitionInput,
  type ListFeasibilityProjectsQuery,
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
import { NotificationsService } from '../notifications/notifications.service';
import { hasPermission, type Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
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

const MANAGE_PERMISSION = 'feasibility:manage';
/** Permission an assigned expert must hold. */
const EXPERT_PERMISSION = 'feasibility:work';
const MAX_CODE_ATTEMPTS = 5;
const ARCHIVED_PROJECT = 'پروژه بایگانی‌شده تغییر نمی‌کند.';

/** Where staff and experts open a project in the dashboard. */
const staffLink = (id: string): string => `/dashboard/manage/feasibility/${id}`;

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

export interface ProjectExpertView {
  expert: StaffRef;
  since: Date;
}

export interface FeasibilityProjectDetail extends FeasibilityProjectSummary {
  summary: string | null;
  events: FeasibilityStatusEventView[];
  /** What the caller may do with this project now. */
  access: { transitions: FeasibilityStatus[]; assignExperts: boolean; releaseExperts: boolean };
  /** The experts working on the project; staff and experts see them, the applicant does not. */
  experts?: ProjectExpertView[];
}

/** The caller's relations to a project; at least one holds for a visible project. */
interface Relation {
  owner: boolean;
  manager: boolean;
  expert: boolean;
}

/**
 * Feasibility projects (ST-35.01, ADR-0010).
 *
 * - A project is visible to its applicant, to staff holding `feasibility:manage` and to the
 *   experts assigned to it; for anyone else it does not exist (404, so ids cannot be probed).
 * - The status changes only in `transition()`: the state machine decides, the change and its
 *   status event are written together, and it is audited and announced to the other parties.
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
    const where = { ...scope, ...(query.status ? { status: query.status } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feasibilityProject.findMany({
        where,
        select: { ...SUMMARY_SELECT, ownerId: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
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

  async get(id: string, principal: Principal): Promise<FeasibilityProjectDetail> {
    const relation = await this.visible(id, principal);
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: {
        ...SUMMARY_SELECT,
        summary: true,
        ownerId: true,
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
    const { ownerId, events, experts, ...view } = project;
    const actors = actorsOf(relation);
    const access = {
      transitions: [...new Set(actors.flatMap((actor) => allowedTransitions(view.status, actor)))],
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

  /**
   * The only way the status of a project changes. The caller acts in the capacities they have on
   * this project; the first one the state machine accepts is recorded with the event.
   */
  async transition(
    id: string,
    input: FeasibilityTransitionInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<FeasibilityProjectDetail> {
    const relation = await this.visible(id, principal);
    const current = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: { status: true, ownerId: true, code: true, title: true },
    });
    if (!current) throw new NotFoundError();
    const decision = transitionAs(current.status, input.to, actorsOf(relation));
    if (!decision.ok) {
      if (decision.reason === 'actor_not_allowed') {
        throw new ForbiddenError('شما اجازه این تغییر وضعیت را ندارید.');
      }
      throw new ConflictError('تغییر وضعیت پروژه به این مرحله مجاز نیست.');
    }

    // Conditional update: a concurrent change makes this a no-op and is reported as a conflict.
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.feasibilityProject.updateMany({
        where: { id, status: decision.from },
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
      metadata: { from: decision.from, to: decision.to, actor: decision.actor },
      meta,
    });
    // Best effort: the status has changed, so a failed announcement must not fail the request.
    await this.announce(id, current, decision.to, decision.actor, principal.userId).catch(
      (error: unknown) => {
        this.logger.warn({ err: error, projectId: id }, 'status announcement failed');
      },
    );
    return this.get(id, principal);
  }

  /** Active users who may be assigned to a project (sorted by name, for the staff picker). */
  async assignableExperts(): Promise<StaffRef[]> {
    const ids = await this.rbac.userIdsWithPermission(EXPERT_PERMISSION);
    return staffRefs(await this.users.namesByIds(ids));
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
  ): Promise<void> {
    const label = FEASIBILITY_STATUS_LABELS_FA[status];
    const notification = {
      kind: 'feasibility_project.status_changed',
      title: `وضعیت پروژه ${project.code}: ${label}`,
      body: project.title,
    };
    if (project.ownerId !== actorId) {
      await this.inbox.notifyUsers(
        [project.ownerId],
        { ...notification, link: `/dashboard/feasibility/${id}` },
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

  /** The project for a staff action on it; staff do not manage a project of their own. */
  private async manageable(
    id: string,
    actor: Principal,
  ): Promise<{ ownerId: string; code: string; title: string; status: FeasibilityStatus }> {
    const relation = await this.visible(id, actor);
    if (relation.owner || !relation.manager) throw new ForbiddenError();
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: { ownerId: true, code: true, title: true, status: true },
    });
    if (!project) throw new NotFoundError();
    return project;
  }

  /** Locks the project row until the transaction ends and returns its status; 404 when gone. */
  private async lock(tx: Prisma.TransactionClient, id: string): Promise<FeasibilityStatus> {
    const rows = await tx.$queryRaw<
      { status: FeasibilityStatus }[]
    >`SELECT "status"::text AS "status" FROM "feasibility_projects" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundError();
    return row.status;
  }

  /** The caller's relations to a project; 404 when there is none (the project may not exist). */
  private async visible(id: string, principal: Principal): Promise<Relation> {
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
    const relation: Relation = {
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
