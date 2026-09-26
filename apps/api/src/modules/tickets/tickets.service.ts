import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TICKET_STATUSES,
  type AssignInput,
  type CreateTicketInput,
  type ListTicketsQuery,
  type ReplyTicketInput,
  type TicketStatus,
  type UpdateTicketStatusInput,
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
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from '../notifications/ports/notification-provider';
import { NotificationsService } from '../notifications/notifications.service';
import { hasPermission, type Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
import { ServiceRequestsService } from '../service-requests/service-requests.service';
import { staffRef, staffRefs, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import {
  canChangeStatus,
  canPostMessage,
  generateTicketCode,
  statusAfterMessage,
  type TicketActor,
} from './domain/ticket.policy';

const SUMMARY_SELECT = {
  id: true,
  code: true,
  subject: true,
  category: true,
  priority: true,
  status: true,
  serviceRequestId: true,
  lastMessageAt: true,
  createdAt: true,
} satisfies Prisma.TicketSelect;

export type TicketSummary = Prisma.TicketGetPayload<{ select: typeof SUMMARY_SELECT }>;

export interface TicketMessageView {
  id: string;
  fromStaff: boolean;
  internal: boolean;
  body: string;
  createdAt: Date;
  /** Staff see the author; owners only see «پشتیبانی» for staff messages. */
  authorName: string | null;
}

/** Staff list item: adds the assignee, which ticket owners never see. */
export interface StaffTicketSummary extends TicketSummary {
  assignee: StaffRef | null;
}

export interface TicketDetail extends TicketSummary {
  requester?: { id: string; fullName: string; email: string };
  /** Present for staff only. */
  assignee?: StaffRef | null;
  messages: TicketMessageView[];
  attachments: FileView[];
}

const MAX_CODE_ATTEMPTS = 5;

/** Permission an assignee must hold: they have to be able to answer the ticket. */
const ASSIGNEE_PERMISSION = 'tickets:reply';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly serviceRequests: ServiceRequestsService,
    private readonly users: UsersService,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
    private readonly inbox: NotificationsService,
    private readonly rbac: RbacService,
  ) {}

  /** Ticket count per status (every status present, zero when none). */
  async statusCounts(): Promise<Record<TicketStatus, number>> {
    const rows = await this.prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<
      TicketStatus,
      number
    >;
    for (const row of rows) counts[row.status] = row._count._all;
    return counts;
  }

  async create(
    input: CreateTicketInput,
    owner: Principal,
    meta: RequestMeta,
  ): Promise<TicketDetail> {
    if (
      input.serviceRequestId &&
      !(await this.serviceRequests.isOwnedBy(input.serviceRequestId, owner.userId))
    ) {
      throw new ValidationFailedError([
        { path: 'serviceRequestId', message: 'درخواست انتخاب‌شده معتبر نیست.' },
      ]);
    }
    const attachmentIds = input.attachmentIds ?? [];
    await this.files.assertAttachable(attachmentIds, owner.userId, 'TICKET_ATTACHMENT');

    const ticket = await this.insertWithUniqueCode({
      userId: owner.userId,
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      serviceRequestId: input.serviceRequestId,
      messages: { create: { authorId: owner.userId, body: input.message } },
    });
    await this.files.attach(attachmentIds, owner.userId, 'ticket', ticket.id);
    await this.audit.record({
      action: 'ticket.created',
      actorId: owner.userId,
      entityType: 'ticket',
      entityId: ticket.id,
      meta,
    });
    await this.inbox.notifyPermission(
      'tickets:read-all',
      {
        kind: 'ticket.created',
        title: `تیکت جدید: ${input.subject}`,
        link: `/dashboard/manage/tickets/${ticket.id}`,
      },
      { exclude: owner.userId },
    );
    return this.getVisible(ticket.id, owner);
  }

  listMine(userId: string, query: ListTicketsQuery) {
    return this.list({ userId, ...(query.status ? { status: query.status } : {}) }, query);
  }

  /** Staff list; `assignee=me|none` narrows it to the caller's queue or unassigned tickets. */
  async listAll(
    query: ListTicketsQuery,
    principal: Principal,
  ): Promise<PageResult<StaffTicketSummary>> {
    const where: Prisma.TicketWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignee === 'me' ? { assigneeId: principal.userId } : {}),
      ...(query.assignee === 'none' ? { assigneeId: null } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        select: { ...SUMMARY_SELECT, assigneeId: true },
        orderBy: { lastMessageAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    const names = await this.users.namesByIds(rows.flatMap((r) => r.assigneeId ?? []));
    const items = rows.map(({ assigneeId, ...item }) => ({
      ...item,
      assignee: staffRef(assigneeId, names),
    }));
    return new PageResult(items, query.page, query.pageSize, total);
  }

  /** Active support staff a ticket can be assigned to (sorted by name). */
  async assignees(): Promise<StaffRef[]> {
    const ids = await this.rbac.userIdsWithPermission(ASSIGNEE_PERMISSION);
    return staffRefs(await this.users.namesByIds(ids));
  }

  /**
   * Assigns (or, with `null`, unassigns) a support agent who can answer tickets. Audited; the
   * new assignee is notified and later owner replies go to them instead of the whole team.
   */
  async assign(id: string, input: AssignInput, actor: Principal, meta: RequestMeta) {
    const current = await this.prisma.ticket.findUnique({
      where: { id },
      select: { assigneeId: true, code: true, subject: true },
    });
    if (!current) throw new NotFoundError();
    if (current.assigneeId === input.assigneeId) return this.getVisible(id, actor);
    if (
      input.assigneeId &&
      !(await this.rbac.userHasPermission(input.assigneeId, ASSIGNEE_PERMISSION))
    ) {
      throw new ValidationFailedError([
        { path: 'assigneeId', message: 'این کاربر امکان پاسخ به تیکت‌ها را ندارد.' },
      ]);
    }

    const { count } = await this.prisma.ticket.updateMany({
      where: { id, assigneeId: current.assigneeId },
      data: { assigneeId: input.assigneeId },
    });
    if (count !== 1) {
      throw new ConflictError('کارشناس این تیکت هم‌زمان تغییر کرده است. دوباره تلاش کنید.');
    }

    await this.audit.record({
      action: 'ticket.assigned',
      actorId: actor.userId,
      entityType: 'ticket',
      entityId: id,
      metadata: { from: current.assigneeId, to: input.assigneeId },
      meta,
    });
    if (input.assigneeId && input.assigneeId !== actor.userId) {
      await this.inbox.notifyUsers([input.assigneeId], {
        kind: 'ticket.assigned',
        title: `تیکت ${current.code} به شما ارجاع شد`,
        body: current.subject,
        link: `/dashboard/manage/tickets/${id}`,
      });
    }
    return this.getVisible(id, actor);
  }

  /** Owner or `tickets:read-all`; owners never see internal notes or staff names. */
  async getVisible(id: string, principal: Principal): Promise<TicketDetail> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        ...SUMMARY_SELECT,
        userId: true,
        assigneeId: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStaff: true,
            internal: true,
            body: true,
            createdAt: true,
            authorId: true,
          },
        },
      },
    });
    const staff = hasPermission(principal, 'tickets:read-all');
    if (!ticket || (!staff && ticket.userId !== principal.userId)) throw new NotFoundError();

    const authorIds = [
      ...new Set([
        ...ticket.messages.map((m) => m.authorId).filter((a): a is string => !!a),
        ...(ticket.assigneeId ? [ticket.assigneeId] : []),
      ]),
    ];
    // User data comes through UsersService (module boundary), never via a direct join.
    const authors = staff ? await this.users.namesByIds(authorIds) : new Map<string, string>();
    const requester = staff ? await this.users.findById(ticket.userId) : undefined;

    const { userId: _userId, assigneeId, messages, ...summary } = ticket;
    return {
      ...summary,
      ...(staff ? { assignee: staffRef(assigneeId, authors) } : {}),
      ...(requester
        ? {
            requester: {
              id: requester.id,
              fullName: requester.fullName,
              email: requester.email,
            },
          }
        : {}),
      messages: messages
        .filter((m) => staff || !m.internal)
        .map((m) => ({
          id: m.id,
          fromStaff: m.fromStaff,
          internal: m.internal,
          body: m.body,
          createdAt: m.createdAt,
          authorName: staff ? (m.authorId ? (authors.get(m.authorId) ?? null) : null) : null,
        })),
      attachments: await this.files.listForEntity('ticket', id),
    };
  }

  async reply(id: string, input: ReplyTicketInput, principal: Principal, meta: RequestMeta) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { userId: true, status: true, code: true, assigneeId: true },
    });
    const isOwner = ticket?.userId === principal.userId;
    const isStaff = hasPermission(principal, 'tickets:reply');
    const canSee = isOwner || hasPermission(principal, 'tickets:read-all');
    if (!ticket || !canSee) throw new NotFoundError();
    if (!isOwner && !isStaff) throw new ForbiddenError();
    // An owner who is also staff writes as the owner on their own ticket.
    const actor: TicketActor = isOwner ? 'owner' : 'staff';
    if (input.internal && actor !== 'staff') throw new ForbiddenError();
    if (!canPostMessage(ticket.status)) {
      throw new ConflictError('این تیکت بسته شده است. لطفاً تیکت جدیدی ثبت کنید.');
    }

    const attachmentIds = input.attachmentIds ?? [];
    await this.files.assertAttachable(attachmentIds, principal.userId, 'TICKET_ATTACHMENT');
    const status = statusAfterMessage(ticket.status, actor, input.internal);
    await this.prisma.$transaction([
      this.prisma.ticketMessage.create({
        data: {
          ticketId: id,
          authorId: principal.userId,
          fromStaff: actor === 'staff',
          internal: input.internal,
          body: input.body,
        },
      }),
      this.prisma.ticket.update({
        where: { id },
        data: { status, lastMessageAt: new Date() },
      }),
    ]);
    await this.files.attach(attachmentIds, principal.userId, 'ticket', id);
    await this.audit.record({
      action: 'ticket.replied',
      actorId: principal.userId,
      entityType: 'ticket',
      entityId: id,
      metadata: { actor, internal: input.internal },
      meta,
    });
    if (actor === 'staff' && !input.internal) {
      await this.inbox.notifyUsers(
        [ticket.userId],
        {
          kind: 'ticket.answered',
          title: `پاسخ جدید به تیکت ${ticket.code}`,
          link: `/dashboard/tickets/${id}`,
        },
        { template: 'ticket.answered', data: { ticketCode: ticket.code } },
      );
    } else if (actor === 'owner') {
      const replied = {
        kind: 'ticket.replied',
        title: `پیام جدید کاربر در تیکت ${ticket.code}`,
        link: `/dashboard/manage/tickets/${id}`,
      };
      // An assigned ticket goes to its assignee only; otherwise the whole support queue hears.
      if (!ticket.assigneeId) {
        await this.inbox.notifyPermission('tickets:read-all', replied, {
          exclude: principal.userId,
        });
      } else if (ticket.assigneeId !== principal.userId) {
        await this.inbox.notifyUsers([ticket.assigneeId], replied);
      }
    }
    return this.getVisible(id, principal);
  }

  async changeStatus(
    id: string,
    input: UpdateTicketStatusInput,
    principal: Principal,
    meta: RequestMeta,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });
    const isOwner = ticket?.userId === principal.userId;
    const canSee = isOwner || hasPermission(principal, 'tickets:read-all');
    if (!ticket || !canSee) throw new NotFoundError();
    const actor: TicketActor = hasPermission(principal, 'tickets:reply') ? 'staff' : 'owner';
    if (!canChangeStatus(actor, input.status)) throw new ForbiddenError();
    if (ticket.status === input.status) return this.getVisible(id, principal);

    await this.prisma.ticket.update({ where: { id }, data: { status: input.status } });
    await this.audit.record({
      action: 'ticket.status_changed',
      actorId: principal.userId,
      entityType: 'ticket',
      entityId: id,
      metadata: { from: ticket.status, to: input.status },
      meta,
    });
    return this.getVisible(id, principal);
  }

  private async list(where: Prisma.TicketWhereInput, query: ListTicketsQuery) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: { lastMessageAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return new PageResult(items, query.page, query.pageSize, total);
  }

  private async insertWithUniqueCode(data: Omit<Prisma.TicketUncheckedCreateInput, 'code'>) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.ticket.create({
          data: { ...data, code: generateTicketCode() },
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
