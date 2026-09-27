import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CreateOrderInput, ListOrdersQuery } from '@roshd/validation';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import {
  AppException,
  ConflictError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import { withTimeout } from '../../common/time/with-timeout';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { LearningService } from '../learning/learning.service';
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from '../notifications/ports/notification-provider';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PAYMENT_GATEWAY,
  PAYMENT_GATEWAY_TIMEOUT_MS,
  type PaymentGateway,
} from '../payments/ports/payment-gateway';
import { hasPermission, type Principal } from '../rbac/principal';
import { UsersService } from '../users/users.service';
import { canCancel, canStartPayment, generateOrderCode, orderTotal } from './domain/order.policy';

const ORDER_SELECT = {
  id: true,
  code: true,
  userId: true,
  status: true,
  totalRials: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      kind: true,
      referenceId: true,
      referenceSlug: true,
      title: true,
      unitPriceRials: true,
      quantity: true,
    },
  },
  attempts: {
    select: {
      id: true,
      provider: true,
      status: true,
      amountRials: true,
      trackingCode: true,
      cardMask: true,
      failureReason: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.OrderSelect;

/** The finance list also answers "whose order is this?" (ST-27.01). */
const STAFF_ORDER_SELECT = {
  ...ORDER_SELECT,
  user: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;
type StaffOrderRow = Prisma.OrderGetPayload<{ select: typeof STAFF_ORDER_SELECT }>;

const toRials = (d: Prisma.Decimal) => BigInt(d.toFixed(0));

/** Money leaves the API as digit strings. */
function toView(row: OrderRow) {
  const { userId: _userId, ...rest } = row;
  return {
    ...rest,
    totalRials: row.totalRials.toFixed(0),
    items: row.items.map((i) => ({ ...i, unitPriceRials: i.unitPriceRials.toFixed(0) })),
    attempts: row.attempts.map((a) => ({ ...a, amountRials: a.amountRials.toFixed(0) })),
  };
}

export type OrderView = ReturnType<typeof toView>;

/** Same view plus the customer, for staff holding `orders:read-all`. */
function toStaffView(row: StaffOrderRow) {
  const { user, ...rest } = row;
  return { ...toView(rest), customer: user };
}

export type StaffOrderView = ReturnType<typeof toStaffView>;

export type PaymentOutcome = 'paid' | 'failed' | 'unknown';

const NOT_PURCHASABLE = 'این دوره قابل خرید آنلاین نیست؛ برای ثبت‌نام درخواست ثبت کنید.';
const MAX_CODE_ATTEMPTS = 5;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly learning: LearningService,
    private readonly users: UsersService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifications: NotificationProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly inbox: NotificationsService,
  ) {}

  paymentStatus() {
    return {
      enabled: this.gateway.provider !== 'disabled',
      testMode: this.gateway.isTestProvider,
    };
  }

  // ─────────────────────────────── orders ───────────────────────────────

  /** Prices are always read on the server from published, priced courses (never from the client). */
  async create(input: CreateOrderInput, actor: Principal, meta: RequestMeta): Promise<OrderView> {
    const items = await Promise.all(
      input.items.map(async (item, index) => {
        const course = await this.learning.getPublished(item.slug).catch((error: unknown) => {
          if (error instanceof NotFoundError) {
            throw new ValidationFailedError([
              { path: `items.${index}.slug`, message: 'دوره یافت نشد.' },
            ]);
          }
          throw error;
        });
        if (course.isFree || !course.priceRials || course.priceRials === '0') {
          throw new ValidationFailedError([
            { path: `items.${index}.slug`, message: NOT_PURCHASABLE },
          ]);
        }
        return {
          kind: 'COURSE' as const,
          referenceId: course.id,
          referenceSlug: course.slug,
          title: course.title,
          unitPriceRials: BigInt(course.priceRials),
          quantity: 1,
        };
      }),
    );

    // Re-opening the same purchase returns the existing pending order instead of a duplicate.
    const pending = await this.prisma.order.findFirst({
      where: {
        userId: actor.userId,
        status: 'PENDING_PAYMENT',
        items: { some: { referenceId: { in: items.map((i) => i.referenceId) } } },
      },
      select: ORDER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    if (
      pending &&
      pending.items.length === items.length &&
      items.every((i) =>
        pending.items.some(
          (p) => p.referenceId === i.referenceId && toRials(p.unitPriceRials) === i.unitPriceRials,
        ),
      )
    ) {
      return toView(pending);
    }

    const total = orderTotal(items);
    for (let attempt = 1; ; attempt++) {
      try {
        const row = await this.prisma.order.create({
          data: {
            code: generateOrderCode(),
            userId: actor.userId,
            totalRials: total.toString(),
            items: {
              create: items.map((i) => ({ ...i, unitPriceRials: i.unitPriceRials.toString() })),
            },
          },
          select: ORDER_SELECT,
        });
        await this.audit.record({
          action: 'order.created',
          actorId: actor.userId,
          entityType: 'order',
          entityId: row.id,
          metadata: { code: row.code, totalRials: row.totalRials.toFixed(0) },
          meta,
        });
        return toView(row);
      } catch (error) {
        if (isUniqueViolation(error) && attempt < MAX_CODE_ATTEMPTS) continue;
        throw error;
      }
    }
  }

  async listMine(userId: string, query: ListOrdersQuery) {
    return this.list({ userId, ...(query.status ? { status: query.status } : {}) }, query);
  }

  async listAll(query: ListOrdersQuery) {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      // A partial code is enough: staff read it off an invoice or a support message.
      ...(query.q ? { code: { contains: query.q } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: STAFF_ORDER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return new PageResult(rows.map(toStaffView), query.page, query.pageSize, total);
  }

  /**
   * Owners and `orders:read-all` staff may read; everyone else gets 404 (no existence leak).
   * Staff also see who the customer is; an owner reading their own order does not need it
   * and never receives the field (ST-27.01).
   */
  async getVisible(id: string, principal: Principal): Promise<OrderView | StaffOrderView> {
    const row = await this.prisma.order.findUnique({ where: { id }, select: STAFF_ORDER_SELECT });
    const staff = hasPermission(principal, 'orders:read-all');
    if (!row || (row.userId !== principal.userId && !staff)) throw new NotFoundError();
    const { user: _user, ...rest } = row;
    return staff ? toStaffView(row) : toView(rest);
  }

  async cancel(id: string, principal: Principal, meta: RequestMeta): Promise<OrderView> {
    const order = await this.findOwned(id, principal);
    const decision = canCancel(order.status);
    if (!decision.ok) throw new ConflictError(conflictMessage(decision.reason));
    const updated = await this.prisma.order.updateMany({
      where: { id, status: 'PENDING_PAYMENT' },
      data: { status: 'CANCELLED' },
    });
    if (updated.count === 0) throw new ConflictError('وضعیت سفارش تغییر کرده است.');
    await this.audit.record({
      action: 'order.cancelled',
      actorId: principal.userId,
      entityType: 'order',
      entityId: id,
      meta,
    });
    return this.getVisible(id, principal);
  }

  // ─────────────────────────────── payments ───────────────────────────────

  /** Starts a new payment attempt; the gateway redirect never marks the order paid by itself. */
  async startPayment(id: string, principal: Principal, meta: RequestMeta) {
    const order = await this.findOwned(id, principal);
    const decision = canStartPayment(order.status);
    if (!decision.ok) throw new ConflictError(conflictMessage(decision.reason));

    const idempotencyKey = randomUUID();
    const attempt = await this.prisma.paymentAttempt.create({
      data: {
        orderId: id,
        provider: this.gateway.provider,
        amountRials: order.totalRials,
        idempotencyKey,
      },
      select: { id: true },
    });
    try {
      const user = await this.users.findById(principal.userId);
      const result = await withTimeout(
        this.gateway.initiate({
          attemptId: attempt.id,
          amountRials: toRials(order.totalRials),
          callbackUrl: `${this.config.WEB_BASE_URL}/api/v1/payments/callback/${attempt.id}`,
          description: `سفارش ${order.code}`,
          idempotencyKey,
          payer: { email: user.email, ...(user.mobile ? { mobile: user.mobile } : {}) },
        }),
        PAYMENT_GATEWAY_TIMEOUT_MS,
        'payment initiate',
      );
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { providerReference: result.providerReference },
      });
      await this.audit.record({
        action: 'payment.initiated',
        actorId: principal.userId,
        entityType: 'order',
        entityId: id,
        metadata: { attemptId: attempt.id, provider: this.gateway.provider },
        meta,
      });
      return { attemptId: attempt.id, redirectUrl: result.redirectUrl };
    } catch (error) {
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', failureReason: 'initiate_failed', completedAt: new Date() },
      });
      if (error instanceof AppException) throw error;
      this.logger.error({ err: error, requestId: meta.requestId }, 'payment initiation failed');
      throw new AppException('SERVICE_UNAVAILABLE', 'اتصال به درگاه پرداخت ممکن نشد.');
    }
  }

  /**
   * Gateway callback. Idempotent: an attempt that already completed is a no-op. Success only
   * comes from the server-to-server verify, using the reference we stored (never the query).
   */
  async handleCallback(
    attemptId: string,
    params: Record<string, string>,
    meta: RequestMeta,
  ): Promise<{ orderId: string | null; outcome: PaymentOutcome }> {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        orderId: true,
        status: true,
        amountRials: true,
        providerReference: true,
        order: { select: { status: true, userId: true, code: true } },
      },
    });
    if (!attempt) return { orderId: null, outcome: 'unknown' };
    if (attempt.status !== 'INITIATED') {
      return {
        orderId: attempt.orderId,
        outcome: attempt.status === 'VERIFIED' ? 'paid' : 'failed',
      };
    }
    if (!attempt.providerReference) {
      await this.failAttempt(attempt.id, attempt.orderId, 'not_initiated', meta);
      return { orderId: attempt.orderId, outcome: 'failed' };
    }

    // A timeout here throws and leaves the attempt INITIATED on purpose: the payer may well have
    // paid, so only a real provider answer decides the outcome (ST-26.10, finding I-08).
    const result = await withTimeout(
      this.gateway.verify({
        attemptId: attempt.id,
        providerReference: attempt.providerReference,
        amountRials: toRials(attempt.amountRials),
        callbackParams: params,
      }),
      PAYMENT_GATEWAY_TIMEOUT_MS,
      'payment verify',
    );
    if (result.status === 'FAILED') {
      await this.failAttempt(attempt.id, attempt.orderId, result.reason, meta);
      return { orderId: attempt.orderId, outcome: 'failed' };
    }

    const now = new Date();
    const [verified, paid] = await this.prisma.$transaction([
      this.prisma.paymentAttempt.updateMany({
        where: { id: attempt.id, status: 'INITIATED' },
        data: {
          status: 'VERIFIED',
          trackingCode: result.trackingCode,
          cardMask: result.cardMask ?? null,
          completedAt: now,
        },
      }),
      // Money was taken: a verified payment settles a pending (or meanwhile cancelled) order.
      this.prisma.order.updateMany({
        where: { id: attempt.orderId, status: { in: ['PENDING_PAYMENT', 'CANCELLED'] } },
        data: { status: 'PAID', paidAt: now },
      }),
    ]);
    if (verified.count === 0) {
      // A concurrent callback completed this attempt first: nothing more to do.
      return { orderId: attempt.orderId, outcome: 'paid' };
    }
    await this.audit.record({
      action: 'payment.verified',
      actorId: attempt.order.userId,
      entityType: 'order',
      entityId: attempt.orderId,
      metadata: { attemptId: attempt.id, trackingCode: result.trackingCode },
      meta,
    });
    if (paid.count === 0) {
      // The order was already paid by another attempt: flag for a manual refund.
      await this.audit.record({
        action: 'payment.duplicate',
        actorId: attempt.order.userId,
        entityType: 'order',
        entityId: attempt.orderId,
        metadata: { attemptId: attempt.id },
        meta,
      });
    } else {
      await this.audit.record({
        action: 'order.paid',
        actorId: attempt.order.userId,
        entityType: 'order',
        entityId: attempt.orderId,
        metadata: { code: attempt.order.code },
        meta,
      });
      await this.inbox.notifyUsers(
        [attempt.order.userId],
        {
          kind: 'order.paid',
          title: `پرداخت سفارش ${attempt.order.code} تأیید شد`,
          link: `/dashboard/orders/${attempt.orderId}`,
        },
        { template: 'order.paid', data: { orderCode: attempt.order.code } },
      );
    }
    return { orderId: attempt.orderId, outcome: 'paid' };
  }

  // ─────────────────────────────── helpers ───────────────────────────────

  private async list(where: Prisma.OrderWhereInput, query: ListOrdersQuery) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select: ORDER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return new PageResult(rows.map(toView), query.page, query.pageSize, total);
  }

  /** Only the owner acts on an order; others get 404. */
  private async findOwned(id: string, principal: Principal) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, code: true, status: true, totalRials: true, userId: true },
    });
    if (!order || order.userId !== principal.userId) throw new NotFoundError();
    return order;
  }

  private async failAttempt(id: string, orderId: string, reason: string, meta: RequestMeta) {
    const updated = await this.prisma.paymentAttempt.updateMany({
      where: { id, status: 'INITIATED' },
      data: { status: 'FAILED', failureReason: reason, completedAt: new Date() },
    });
    if (updated.count > 0) {
      await this.audit.record({
        action: 'payment.failed',
        entityType: 'order',
        entityId: orderId,
        metadata: { attemptId: id, reason },
        meta,
      });
    }
  }
}

function conflictMessage(reason: 'paid' | 'cancelled'): string {
  return reason === 'paid' ? 'این سفارش قبلاً پرداخت شده است.' : 'این سفارش لغو شده است.';
}
