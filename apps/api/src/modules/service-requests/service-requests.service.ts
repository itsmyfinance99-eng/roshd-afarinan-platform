import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CreateServiceRequestInput,
  ListServiceRequestsQuery,
  ServiceRequestStatus,
  ServiceRequestType,
  TrackServiceRequestInput,
  UpdateServiceRequestStatusInput,
} from '@roshd/validation';
import { ConflictError, NotFoundError } from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from '../notifications/ports/notification-provider';
import { hasPermission, type Principal } from '../rbac/principal';
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

export interface ServiceRequestDetailView extends ServiceRequestView {
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

/** Splits validated input into common columns and type-specific `details`. */
function toRecord(input: CreateServiceRequestInput) {
  const { type, fullName, mobile, email, message, website: _honeypot, ...rest } = input;
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
  ) {}

  async create(
    input: CreateServiceRequestInput,
    submitter: Principal | undefined,
    meta: RequestMeta,
  ): Promise<ServiceRequestReceipt> {
    const record = toRecord(input);
    const created = await this.insertWithUniqueCode(record, submitter?.userId);

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

  async listMine(
    userId: string,
    query: ListServiceRequestsQuery,
  ): Promise<PageResult<ServiceRequestView>> {
    return this.list({ ...this.filters(query), userId }, query);
  }

  async listAll(query: ListServiceRequestsQuery): Promise<PageResult<ServiceRequestView>> {
    return this.list(this.filters(query), query);
  }

  /** Owners and staff with `requests:read-all` may read; everyone else gets 404 (no existence leak). */
  async getVisible(id: string, principal: Principal): Promise<ServiceRequestDetailView> {
    const row = await this.prisma.serviceRequest.findUnique({
      where: { id },
      select: {
        ...VIEW_SELECT,
        userId: true,
        events: {
          orderBy: { createdAt: 'asc' },
          select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
        },
      },
    });
    const staff = hasPermission(principal, 'requests:read-all');
    if (!row || (!staff && row.userId !== principal.userId)) throw new NotFoundError();
    const { userId: _userId, events, ...view } = row;
    // Staff notes are internal; owners only see the status timeline.
    return { ...view, events: staff ? events : events.map((e) => ({ ...e, note: null })) };
  }

  async changeStatus(
    id: string,
    input: UpdateServiceRequestStatusInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<ServiceRequestDetailView> {
    const current = await this.prisma.serviceRequest.findUnique({
      where: { id },
      select: { status: true },
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
    return this.getVisible(id, actor);
  }

  private filters(query: ListServiceRequestsQuery): Prisma.ServiceRequestWhereInput {
    return {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
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
