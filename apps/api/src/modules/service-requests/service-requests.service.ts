import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SERVICE_REQUEST_EXPORT_MAX_ROWS,
  SERVICE_REQUEST_STATUS_LABELS_FA,
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_TYPE_LABELS_FA,
  type AssignInput,
  type CreateServiceRequestInput,
  type ExportServiceRequestsQuery,
  type ListServiceRequestsQuery,
  type ServiceRequestStatus,
  type ServiceRequestType,
  type TrackServiceRequestInput,
  type UpdateServiceRequestStatusInput,
} from '@roshd/validation';
import { toCsv } from '../../common/csv/csv';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { FilesService, type FileView } from '../files/files.service';
import { PrismaService } from '../database/prisma.service';
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from '../notifications/ports/notification-provider';
import { NotificationsService } from '../notifications/notifications.service';
import { hasPermission, type Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
import { staffRef, staffRefs, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import { EXPORT_HEADER, exportFileName, exportRow, tehranDayRange } from './domain/request-export';
import { canTransition, generateTrackingCode } from './domain/service-request.policy';

export interface ServiceRequestReceipt {
  id: string;
  trackingCode: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  createdAt: Date;
}

export interface ServiceRequestView extends ServiceRequestReceipt {
  fullName: string;
  mobile: string;
  email: string | null;
  subject: string | null;
  message: string;
  details: Prisma.JsonValue;
  updatedAt: Date;
}

/** Staff list item: adds the assignee, which requesters never see. */
export interface StaffServiceRequestView extends ServiceRequestView {
  assignee: StaffRef | null;
}

export interface ServiceRequestDetailView extends ServiceRequestView {
  /** Present for staff only. */
  assignee?: StaffRef | null;
  attachments: FileView[];
  events: {
    fromStatus: ServiceRequestStatus | null;
    toStatus: ServiceRequestStatus;
    note: string | null;
    createdAt: Date;
  }[];
}

const VIEW_SELECT = {
  id: true,
  trackingCode: true,
  type: true,
  status: true,
  fullName: true,
  mobile: true,
  email: true,
  subject: true,
  message: true,
  details: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ServiceRequestSelect;

const MAX_CODE_ATTEMPTS = 5;

/** Permission an assignee must hold: they need to see the request to work on it. */
const ASSIGNEE_PERMISSION = 'requests:read-all';

/** Splits validated input into common columns and type-specific `details`. */
function toRecord(input: CreateServiceRequestInput) {
  const {
    type,
    fullName,
    mobile,
    email,
    message,
    website: _honeypot,
    attachmentIds: _attachments,
    ...rest
  } = input;
  const subject = 'subject' in rest ? rest.subject : 'topic' in rest ? rest.topic : undefined;
  const details = Object.fromEntries(
    Object.entries(rest).filter(([key, value]) => key !== 'subject' && value !== undefined),
  );
  return { type, fullName, mobile, email, message, subject, details };
}

@Injectable()
export class ServiceRequestsService {
  private readonly logger = new Logger(ServiceRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
    private readonly inbox: NotificationsService,
    private readonly files: FilesService,
    private readonly rbac: RbacService,
    private readonly users: UsersService,
  ) {}

  async create(
    input: CreateServiceRequestInput,
    submitter: Principal | undefined,
    meta: RequestMeta,
  ): Promise<ServiceRequestReceipt> {
    const attachmentIds = input.attachmentIds ?? [];
    if (attachmentIds.length > 0) {
      // Only signed-in submitters can attach their own, not-yet-attached uploads.
      if (!submitter) {
        throw new ValidationFailedError([
          { path: 'attachmentIds', message: 'برای پیوست فایل باید وارد حساب کاربری شوید.' },
        ]);
      }
      await this.files.assertAttachable(
        attachmentIds,
        submitter.userId,
        'SERVICE_REQUEST_ATTACHMENT',
      );
    }

    const record = toRecord(input);
    const created = await this.insertWithUniqueCode(record, submitter?.userId);
    if (submitter && attachmentIds.length > 0) {
      await this.files.attach(attachmentIds, submitter.userId, 'service_request', created.id);
    }

    await this.audit.record({
      action: 'service_request.created',
      actorId: submitter?.userId ?? null,
      entityType: 'service_request',
      entityId: created.id,
      metadata: { type: created.type },
      meta,
    });

    // Confirmation is best-effort: the request is already stored, so a provider outage must not fail it.
    try {
      await this.notifications.send({
        channel: 'sms',
        to: created.mobile,
        template: 'service-request.received',
        data: { trackingCode: created.trackingCode },
      });
    } catch (error) {
      this.logger.warn(
        { err: error, requestId: meta.requestId },
        'confirmation notification failed',
      );
    }

    await this.inbox.notifyPermission('requests:read-all', {
      kind: 'service_request.created',
      title: `درخواست جدید: ${SERVICE_REQUEST_TYPE_LABELS_FA[created.type]}`,
      body: `کد پیگیری ${created.trackingCode} · ${record.fullName}`,
      link: `/dashboard/manage/requests/${created.id}`,
    });

    return {
      id: created.id,
      trackingCode: created.trackingCode,
      type: created.type,
      status: created.status,
      createdAt: created.createdAt,
    };
  }

  /** Guest tracking: the code alone is not enough, the submitter's mobile must match too. */
  async track(input: TrackServiceRequestInput) {
    const found = await this.prisma.serviceRequest.findUnique({
      where: { trackingCode: input.code },
      select: {
        trackingCode: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        mobile: true,
      },
    });
    if (!found || found.mobile !== input.mobile)
      throw new NotFoundError('درخواستی با این مشخصات یافت نشد.');
    const { mobile: _mobile, ...status } = found;
    return status;
  }

  /** For other modules (e.g. tickets): does this request belong to the user? */
  async isOwnedBy(id: string, userId: string): Promise<boolean> {
    const count = await this.prisma.serviceRequest.count({ where: { id, userId } });
    return count === 1;
  }

  async listMine(
    userId: string,
    query: ListServiceRequestsQuery,
  ): Promise<PageResult<ServiceRequestView>> {
    return this.list({ ...this.filters(query), userId }, query);
  }

  /** Request count per status (every status present) and the number received since `since`. */
  async statusCounts(since: Date): Promise<{
    byStatus: Record<ServiceRequestStatus, number>;
    total: number;
    since: number;
  }> {
    const [rows, recent] = await Promise.all([
      this.prisma.serviceRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.serviceRequest.count({ where: { createdAt: { gte: since } } }),
    ]);
    const byStatus = Object.fromEntries(SERVICE_REQUEST_STATUSES.map((s) => [s, 0])) as Record<
      ServiceRequestStatus,
      number
    >;
    for (const row of rows) byStatus[row.status] = row._count._all;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { byStatus, total, since: recent };
  }

  /** Staff list; `assignee=me|none` narrows it to the caller's queue or unassigned requests. */
  async listAll(
    query: ListServiceRequestsQuery,
    principal: Principal,
  ): Promise<PageResult<StaffServiceRequestView>> {
    const where: Prisma.ServiceRequestWhereInput = {
      ...this.filters(query),
      ...(query.assignee === 'me' ? { assigneeId: principal.userId } : {}),
      ...(query.assignee === 'none' ? { assigneeId: null } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.serviceRequest.findMany({
        where,
        select: { ...VIEW_SELECT, assigneeId: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    const names = await this.users.namesByIds(rows.flatMap((r) => r.assigneeId ?? []));
    const items = rows.map(({ assigneeId, ...item }) => ({
      ...item,
      assignee: staffRef(assigneeId, names),
    }));
    return new PageResult(items, query.page, query.pageSize, total);
  }

  /** Active staff who may be assigned a request (sorted by name, for the staff picker). */
  async assignees(): Promise<StaffRef[]> {
    const ids = await this.rbac.userIdsWithPermission(ASSIGNEE_PERMISSION);
    return staffRefs(await this.users.namesByIds(ids));
  }

  /**
   * Assigns (or, with `null`, unassigns) a staff member. The assignee must be active and able to
   * read requests; the change is audited and the new assignee is notified.
   */
  async assign(
    id: string,
    input: AssignInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<ServiceRequestDetailView> {
    const current = await this.prisma.serviceRequest.findUnique({
      where: { id },
      select: { assigneeId: true, trackingCode: true, type: true },
    });
    if (!current) throw new NotFoundError();
    if (current.assigneeId === input.assigneeId) return this.getVisible(id, actor);
    if (
      input.assigneeId &&
      !(await this.rbac.userHasPermission(input.assigneeId, ASSIGNEE_PERMISSION))
    ) {
      throw new ValidationFailedError([
        { path: 'assigneeId', message: 'این کاربر امکان رسیدگی به درخواست‌ها را ندارد.' },
      ]);
    }

    // Conditional update: a concurrent reassignment makes this a no-op and is reported.
    const { count } = await this.prisma.serviceRequest.updateMany({
      where: { id, assigneeId: current.assigneeId },
      data: { assigneeId: input.assigneeId },
    });
    if (count !== 1) {
      throw new ConflictError('کارشناس این درخواست هم‌زمان تغییر کرده است. دوباره تلاش کنید.');
    }

    await this.audit.record({
      action: 'service_request.assigned',
      actorId: actor.userId,
      entityType: 'service_request',
      entityId: id,
      metadata: { from: current.assigneeId, to: input.assigneeId },
      meta,
    });
    if (input.assigneeId && input.assigneeId !== actor.userId) {
      await this.inbox.notifyUsers([input.assigneeId], {
        kind: 'service_request.assigned',
        title: `درخواست ${current.trackingCode} به شما ارجاع شد`,
        body: SERVICE_REQUEST_TYPE_LABELS_FA[current.type],
        link: `/dashboard/manage/requests/${id}`,
      });
    }
    return this.getVisible(id, actor);
  }

  /**
   * CSV export for staff (UTF-8 BOM, formula-safe). Every export is audited with its filters and
   * row count because the file contains personal data.
   */
  async exportCsv(
    query: ExportServiceRequestsQuery,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<{ fileName: string; csv: string; rows: number }> {
    const where = this.filters(query);
    const total = await this.prisma.serviceRequest.count({ where });
    if (total > SERVICE_REQUEST_EXPORT_MAX_ROWS) {
      throw new BadRequestError(
        `تعداد درخواست‌ها بیش از ${SERVICE_REQUEST_EXPORT_MAX_ROWS.toLocaleString('fa-IR')} است؛ بازه تاریخ یا فیلترها را محدودتر کنید.`,
      );
    }
    const rows = await this.prisma.serviceRequest.findMany({
      where,
      select: VIEW_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    await this.audit.record({
      action: 'service_requests.exported',
      actorId: actor.userId,
      entityType: 'service_request',
      metadata: {
        filters: {
          type: query.type ?? null,
          status: query.status ?? null,
          from: query.from ?? null,
          to: query.to ?? null,
        },
        rows: rows.length,
      },
      meta,
    });
    return {
      fileName: exportFileName(new Date()),
      csv: toCsv(EXPORT_HEADER, rows.map(exportRow)),
      rows: rows.length,
    };
  }

  /** Owners and staff with `requests:read-all` may read; everyone else gets 404 (no existence leak). */
  async getVisible(id: string, principal: Principal): Promise<ServiceRequestDetailView> {
    const row = await this.prisma.serviceRequest.findUnique({
      where: { id },
      select: {
        ...VIEW_SELECT,
        userId: true,
        assigneeId: true,
        events: {
          orderBy: { createdAt: 'asc' },
          select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
        },
      },
    });
    const staff = hasPermission(principal, 'requests:read-all');
    if (!row || (!staff && row.userId !== principal.userId)) throw new NotFoundError();
    const { userId: _userId, assigneeId, events, ...view } = row;
    // Staff notes and the assignee are internal; owners only see the status timeline.
    const assignee = staff
      ? staffRef(assigneeId, await this.users.namesByIds(assigneeId ? [assigneeId] : []))
      : undefined;
    return {
      ...view,
      ...(staff ? { assignee } : {}),
      attachments: await this.files.listForEntity('service_request', id),
      events: staff ? events : events.map((e) => ({ ...e, note: null })),
    };
  }

  async changeStatus(
    id: string,
    input: UpdateServiceRequestStatusInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<ServiceRequestDetailView> {
    const current = await this.prisma.serviceRequest.findUnique({
      where: { id },
      select: { status: true, userId: true, email: true, trackingCode: true },
    });
    if (!current) throw new NotFoundError();
    if (!canTransition(current.status, input.status)) {
      throw new ConflictError('تغییر وضعیت درخواست به این مرحله مجاز نیست.');
    }

    // Conditional update: a concurrent change makes this a no-op and is reported as a conflict.
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.serviceRequest.updateMany({
        where: { id, status: current.status },
        data: { status: input.status },
      });
      if (count !== 1) return false;
      await tx.serviceRequestStatusEvent.create({
        data: {
          requestId: id,
          fromStatus: current.status,
          toStatus: input.status,
          actorId: actor.userId,
          note: input.note,
        },
      });
      return true;
    });
    if (!updated)
      throw new ConflictError('وضعیت درخواست هم‌زمان تغییر کرده است. دوباره تلاش کنید.');

    await this.audit.record({
      action: 'service_request.status_changed',
      actorId: actor.userId,
      entityType: 'service_request',
      entityId: id,
      metadata: { from: current.status, to: input.status },
      meta,
    });
    await this.notifyRequester(id, current, input.status);
    return this.getVisible(id, actor);
  }

  /** The requester learns about every status change (in-app; email for accounts and guests). */
  private async notifyRequester(
    id: string,
    request: { userId: string | null; email: string | null; trackingCode: string },
    status: ServiceRequestStatus,
  ) {
    const email = {
      template: 'service-request.status-changed',
      data: {
        trackingCode: request.trackingCode,
        status: SERVICE_REQUEST_STATUS_LABELS_FA[status],
      },
    };
    if (request.userId) {
      await this.inbox.notifyUsers(
        [request.userId],
        {
          kind: 'service_request.status_changed',
          title: `وضعیت درخواست ${request.trackingCode}: ${SERVICE_REQUEST_STATUS_LABELS_FA[status]}`,
          link: `/dashboard/requests/${id}`,
        },
        email,
      );
    } else if (request.email) {
      await this.inbox.sendEmail(request.email, email);
    }
  }

  private filters(query: ExportServiceRequestsQuery): Prisma.ServiceRequestWhereInput {
    const createdAt = tehranDayRange(query.from, query.to);
    return {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
    };
  }

  private async list(
    where: Prisma.ServiceRequestWhereInput,
    query: ListServiceRequestsQuery,
  ): Promise<PageResult<ServiceRequestView>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.serviceRequest.findMany({
        where,
        select: VIEW_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    return new PageResult(items, query.page, query.pageSize, total);
  }

  private async insertWithUniqueCode(
    record: ReturnType<typeof toRecord>,
    userId: string | undefined,
  ) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.serviceRequest.create({
          data: {
            ...record,
            details: record.details,
            trackingCode: generateTrackingCode(),
            userId,
            events: { create: { toStatus: 'NEW', actorId: userId } },
          },
          select: {
            id: true,
            trackingCode: true,
            type: true,
            status: true,
            createdAt: true,
            mobile: true,
          },
        });
      } catch (error) {
        const collision =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!collision || attempt >= MAX_CODE_ATTEMPTS) throw error;
      }
    }
  }
}
