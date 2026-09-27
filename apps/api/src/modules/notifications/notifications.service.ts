import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Permission } from '@roshd/types';
import type { ListNotificationsQuery } from '@roshd/validation';
import { NotFoundError } from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { UsersService } from '../users/users.service';
import { withTimeout } from '../../common/time/with-timeout';
import {
  NOTIFICATION_PROVIDER,
  NOTIFICATION_SEND_TIMEOUT_MS,
  type NotificationProvider,
} from './ports/notification-provider';

export interface InAppNotification {
  /** Event key, e.g. `service_request.status_changed`. */
  kind: string;
  title: string;
  body?: string;
  /** Site-relative dashboard path. */
  link?: string;
}

export interface EmailNotification {
  template: string;
  data: Record<string, string | number>;
}

const VIEW_SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} as const;

/**
 * Notification fan-out: in-app records for the dashboard notification center plus optional
 * emails through the NotificationProvider port. Delivery is best-effort: the business action
 * has already happened, so failures are logged and never thrown.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly users: UsersService,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  /** Notifies specific users in-app and, optionally, by email. */
  async notifyUsers(
    userIds: readonly string[],
    notification: InAppNotification,
    email?: EmailNotification,
  ): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: ids.map((userId) => ({ userId, ...notification })),
      });
    } catch (error) {
      this.logger.warn({ err: error, kind: notification.kind }, 'in-app notification failed');
    }
    if (!email) return;
    const contacts = await this.users
      .contactsByIds(ids)
      .catch(() => new Map<string, { fullName: string; email: string }>());
    for (const contact of contacts.values()) {
      await this.sendEmail(contact.email, email);
    }
  }

  /** Notifies every active user holding a permission (staff queues), except `exclude`. */
  async notifyPermission(
    permission: Permission,
    notification: InAppNotification,
    options: { exclude?: string } = {},
  ): Promise<void> {
    const ids = await this.rbac.userIdsWithPermission(permission).catch((error: unknown) => {
      this.logger.warn({ err: error, permission }, 'staff lookup for notification failed');
      return [] as string[];
    });
    await this.notifyUsers(
      ids.filter((id) => id !== options.exclude),
      notification,
    );
  }

  /** Email to an address without an account (e.g. a guest request). */
  async sendEmail(to: string, email: EmailNotification): Promise<void> {
    try {
      await withTimeout(
        this.provider.send({
          channel: 'email',
          to,
          template: email.template,
          data: email.data,
        }),
        NOTIFICATION_SEND_TIMEOUT_MS,
        'notification send',
      );
    } catch (error) {
      this.logger.warn({ err: error, template: email.template }, 'email notification failed');
    }
  }

  // ─────────────────────────────── notification center ───────────────────────────────

  async listMine(userId: string, query: ListNotificationsQuery) {
    const where = { userId, ...(query.unread === 'true' ? { readAt: null } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        select: VIEW_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return new PageResult(items, query.page, query.pageSize, total);
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    return { unread: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  /** Only the owner can mark a notification; others get 404. */
  async markRead(id: string, userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (count === 0) throw new NotFoundError();
    return this.unreadCount(userId);
  }

  /**
   * Drops notifications the user has already read and that are older than the retention window
   * (ST-27.03). Unread ones stay however old they are: nobody has seen them yet.
   */
  async purgeOldRead(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { readAt: { not: null, lt: cutoff } },
    });
    return count;
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return this.unreadCount(userId);
  }
}
