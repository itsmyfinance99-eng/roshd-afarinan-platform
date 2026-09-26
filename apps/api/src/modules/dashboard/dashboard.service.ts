import { Injectable } from '@nestjs/common';
import type { ServiceRequestStatus, TicketStatus } from '@roshd/validation';
import { hasPermission, type Principal } from '../rbac/principal';
import { ServiceRequestsService } from '../service-requests/service-requests.service';
import { TicketsService } from '../tickets/tickets.service';
import { UsersService } from '../users/users.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Only the sections the caller may see are present; every number is a live database count. */
export interface DashboardStats {
  requests?: {
    byStatus: Record<ServiceRequestStatus, number>;
    total: number;
    /** Open = not yet closed (NEW, IN_REVIEW, RESPONDED). */
    open: number;
    lastSevenDays: number;
  };
  tickets?: { byStatus: Record<TicketStatus, number>; open: number };
  users?: { active: number; suspended: number };
  generatedAt: Date;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly requests: ServiceRequestsService,
    private readonly tickets: TicketsService,
    private readonly users: UsersService,
  ) {}

  async stats(principal: Principal, now = new Date()): Promise<DashboardStats> {
    const [requests, tickets, users] = await Promise.all([
      hasPermission(principal, 'requests:read-all')
        ? this.requests.statusCounts(new Date(now.getTime() - WEEK_MS))
        : undefined,
      hasPermission(principal, 'tickets:read-all') ? this.tickets.statusCounts() : undefined,
      hasPermission(principal, 'users:read') ? this.users.statusCounts() : undefined,
    ]);
    return {
      ...(requests
        ? {
            requests: {
              byStatus: requests.byStatus,
              total: requests.total,
              open: requests.total - requests.byStatus.CLOSED,
              lastSevenDays: requests.since,
            },
          }
        : {}),
      ...(tickets
        ? {
            tickets: {
              byStatus: tickets,
              open: tickets.OPEN + tickets.PENDING,
            },
          }
        : {}),
      ...(users ? { users } : {}),
      generatedAt: now,
    };
  }
}
