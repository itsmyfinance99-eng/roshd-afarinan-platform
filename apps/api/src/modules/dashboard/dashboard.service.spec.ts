import type { Permission, Role } from '@roshd/types';
import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '../rbac/principal';
import type { ServiceRequestsService } from '../service-requests/service-requests.service';
import type { TicketsService } from '../tickets/tickets.service';
import type { UsersService } from '../users/users.service';
import { DashboardService } from './dashboard.service';

const principal = (permissions: Permission[], roles: Role[] = ['user']): Principal => ({
  userId: 'u1',
  sessionId: 's1',
  roles,
  permissions: new Set(permissions),
  via: 'bearer',
});

function setup() {
  const requests = {
    statusCounts: vi.fn().mockResolvedValue({
      byStatus: { NEW: 3, IN_REVIEW: 2, RESPONDED: 1, CLOSED: 4 },
      total: 10,
      since: 5,
    }),
  };
  const tickets = {
    statusCounts: vi.fn().mockResolvedValue({ OPEN: 2, PENDING: 1, ANSWERED: 3, CLOSED: 7 }),
  };
  const users = { statusCounts: vi.fn().mockResolvedValue({ active: 40, suspended: 1 }) };
  const service = new DashboardService(
    requests as unknown as ServiceRequestsService,
    tickets as unknown as TicketsService,
    users as unknown as UsersService,
  );
  return { service, requests, tickets, users };
}

describe('DashboardService', () => {
  it('returns only the sections allowed by the caller permissions and never queries others', async () => {
    const { service, requests, tickets, users } = setup();
    const stats = await service.stats(principal(['tickets:read-all']));
    expect(stats.tickets).toEqual({
      byStatus: { OPEN: 2, PENDING: 1, ANSWERED: 3, CLOSED: 7 },
      open: 3,
    });
    expect(stats.requests).toBeUndefined();
    expect(stats.users).toBeUndefined();
    expect(requests.statusCounts).not.toHaveBeenCalled();
    expect(users.statusCounts).not.toHaveBeenCalled();
    expect(tickets.statusCounts).toHaveBeenCalledOnce();
  });

  it('derives open requests and asks for the last seven days', async () => {
    const { service, requests } = setup();
    const now = new Date('2026-09-26T12:00:00Z');
    const stats = await service.stats(principal(['requests:read-all']), now);
    expect(stats.requests).toMatchObject({ total: 10, open: 6, lastSevenDays: 5 });
    expect(requests.statusCounts).toHaveBeenCalledWith(new Date('2026-09-19T12:00:00Z'));
  });

  it('returns no metrics at all for a regular user', async () => {
    const { service } = setup();
    const stats = await service.stats(principal([]));
    expect(Object.keys(stats)).toEqual(['generatedAt']);
  });
});
