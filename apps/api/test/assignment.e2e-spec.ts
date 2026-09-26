import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

interface Notice {
  kind: string;
  link: string | null;
}

describe('Assignment of requests and tickets (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const inbox = async (token: string): Promise<Notice[]> =>
    (await http().get('/api/v1/notifications/mine?pageSize=100').set(auth(token)).expect(200)).body
      .data as Notice[];
  const lastAudit = (entityId: string, action: string) =>
    app.get(PrismaService).auditLog.findFirst({
      where: { entityId, action },
      orderBy: { createdAt: 'desc' },
    });

  const createRequest = async (token: string, mobile: string) =>
    (
      await http()
        .post('/api/v1/service-requests')
        .set(auth(token))
        .send({ type: 'CONTACT', fullName: 'متقاضی', mobile, message: 'درخواست برای ارجاع' })
        .expect(201)
    ).body.data.id as string;

  const createTicket = async (token: string) =>
    (
      await http()
        .post('/api/v1/tickets')
        .set(auth(token))
        .send({ subject: 'تیکت ارجاعی', message: 'لطفاً بررسی کنید.' })
        .expect(201)
    ).body.data.id as string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('service requests', () => {
    it('assigns a request to an expert, notifies them and audits the change', async () => {
      const support = await registerUser(app, ['support']);
      const expert = await registerUser(app, ['expert']);
      const owner = await registerUser(app);
      const id = await createRequest(owner.token, '09120000041');

      const candidates = await http()
        .get('/api/v1/service-requests/assignees')
        .set(auth(support.token))
        .expect(200);
      const ids = (candidates.body.data as { id: string }[]).map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining([support.id, expert.id]));
      expect(ids).not.toContain(owner.id);

      const assigned = await http()
        .patch(`/api/v1/service-requests/${id}/assignee`)
        .set(auth(support.token))
        .send({ assigneeId: expert.id })
        .expect(200);
      expect(assigned.body.data.assignee).toEqual({ id: expert.id, fullName: 'کاربر آزمایشی' });

      expect((await inbox(expert.token)).find((n) => n.link?.endsWith(id))).toMatchObject({
        kind: 'service_request.assigned',
        link: `/dashboard/manage/requests/${id}`,
      });
      expect(await lastAudit(id, 'service_request.assigned')).toMatchObject({
        actorId: support.id,
        metadata: { from: null, to: expert.id },
      });

      // "Assigned to me" and "unassigned" filters
      const mine = await http()
        .get('/api/v1/service-requests?assignee=me&status=NEW&pageSize=100')
        .set(auth(expert.token))
        .expect(200);
      expect(mine.body.data.map((r: { id: string }) => r.id)).toContain(id);
      expect(
        mine.body.data.every((r: { assignee: { id: string } }) => r.assignee.id === expert.id),
      ).toBe(true);
      const unassigned = await http()
        .get('/api/v1/service-requests?assignee=none&pageSize=100')
        .set(auth(support.token))
        .expect(200);
      expect(unassigned.body.data.map((r: { id: string }) => r.id)).not.toContain(id);

      // The requester never sees who handles the request
      const ownerView = await http()
        .get(`/api/v1/service-requests/${id}`)
        .set(auth(owner.token))
        .expect(200);
      expect(ownerView.body.data).not.toHaveProperty('assignee');
      const ownerList = await http()
        .get('/api/v1/service-requests/mine')
        .set(auth(owner.token))
        .expect(200);
      expect(ownerList.body.data[0]).not.toHaveProperty('assignee');

      // Unassign
      const cleared = await http()
        .patch(`/api/v1/service-requests/${id}/assignee`)
        .set(auth(support.token))
        .send({ assigneeId: null })
        .expect(200);
      expect(cleared.body.data.assignee).toBeNull();
      expect(await lastAudit(id, 'service_request.assigned')).toMatchObject({
        metadata: { from: expert.id, to: null },
      });
    });

    it('does not notify staff who assign a request to themselves', async () => {
      const support = await registerUser(app, ['support']);
      const owner = await registerUser(app);
      const id = await createRequest(owner.token, '09120000042');
      await http()
        .patch(`/api/v1/service-requests/${id}/assignee`)
        .set(auth(support.token))
        .send({ assigneeId: support.id })
        .expect(200);
      expect((await inbox(support.token)).some((n) => n.kind === 'service_request.assigned')).toBe(
        false,
      );
    });

    it('rejects assignees without the permission, suspended staff and unauthorized callers', async () => {
      const support = await registerUser(app, ['support']);
      const expert = await registerUser(app, ['expert']);
      const plain = await registerUser(app);
      const suspended = await registerUser(app, ['support']);
      await app
        .get(PrismaService)
        .user.update({ where: { id: suspended.id }, data: { status: 'SUSPENDED' } });
      const id = await createRequest(plain.token, '09120000043');
      const assign = (token: string, assigneeId: unknown) =>
        http()
          .patch(`/api/v1/service-requests/${id}/assignee`)
          .set(auth(token))
          .send({ assigneeId });

      const noPermission = await assign(support.token, plain.id).expect(400);
      expect(noPermission.body.error.details[0].path).toBe('assigneeId');
      await assign(support.token, suspended.id).expect(400);
      await assign(support.token, '0199aaaa-0000-7000-8000-000000000000').expect(400);
      await assign(support.token, 'not-a-uuid').expect(400);
      // Reading requests is not enough to assign them
      await assign(expert.token, expert.id).expect(403);
      await assign(plain.token, support.id).expect(403);
      await http()
        .patch(`/api/v1/service-requests/${id}/assignee`)
        .send({ assigneeId: support.id })
        .expect(401);
      await http()
        .patch('/api/v1/service-requests/0199aaaa-0000-7000-8000-000000000000/assignee')
        .set(auth(support.token))
        .send({ assigneeId: support.id })
        .expect(404);
      await http().get('/api/v1/service-requests/assignees').set(auth(expert.token)).expect(403);
      await http().get('/api/v1/service-requests?assignee=me').set(auth(plain.token)).expect(403);

      const detail = await http()
        .get(`/api/v1/service-requests/${id}`)
        .set(auth(support.token))
        .expect(200);
      expect(detail.body.data.assignee).toBeNull();
    });
  });

  describe('tickets', () => {
    it('assigns a ticket and routes later owner replies to the assignee only', async () => {
      const lead = await registerUser(app, ['support']);
      const agent = await registerUser(app, ['support']);
      const owner = await registerUser(app);
      const id = await createTicket(owner.token);

      const assigned = await http()
        .patch(`/api/v1/tickets/${id}/assignee`)
        .set(auth(lead.token))
        .send({ assigneeId: agent.id })
        .expect(200);
      expect(assigned.body.data.assignee).toEqual({ id: agent.id, fullName: 'کاربر آزمایشی' });
      expect((await inbox(agent.token)).find((n) => n.kind === 'ticket.assigned')).toMatchObject({
        link: `/dashboard/manage/tickets/${id}`,
      });
      expect(await lastAudit(id, 'ticket.assigned')).toMatchObject({
        actorId: lead.id,
        metadata: { from: null, to: agent.id },
      });

      await http()
        .post(`/api/v1/tickets/${id}/messages`)
        .set(auth(owner.token))
        .send({ body: 'اطلاعات تکمیلی را فرستادم.' })
        .expect(201);
      const replied = (n: Notice) => n.kind === 'ticket.replied' && n.link?.endsWith(id);
      expect((await inbox(agent.token)).some(replied)).toBe(true);
      expect((await inbox(lead.token)).some(replied)).toBe(false);

      const mine = await http()
        .get('/api/v1/tickets?assignee=me&pageSize=100')
        .set(auth(agent.token))
        .expect(200);
      expect(mine.body.data.map((t: { id: string }) => t.id)).toContain(id);
      const leadQueue = await http()
        .get('/api/v1/tickets?assignee=me&pageSize=100')
        .set(auth(lead.token))
        .expect(200);
      expect(leadQueue.body.data.map((t: { id: string }) => t.id)).not.toContain(id);

      const ownerView = await http()
        .get(`/api/v1/tickets/${id}`)
        .set(auth(owner.token))
        .expect(200);
      expect(ownerView.body.data).not.toHaveProperty('assignee');
      const ownerList = await http().get('/api/v1/tickets/mine').set(auth(owner.token)).expect(200);
      expect(ownerList.body.data[0]).not.toHaveProperty('assignee');
    });

    it('rejects non-support assignees and callers who cannot answer tickets', async () => {
      const support = await registerUser(app, ['support']);
      const expert = await registerUser(app, ['expert']);
      const owner = await registerUser(app);
      const id = await createTicket(owner.token);
      const assign = (token: string, assigneeId: string | null) =>
        http().patch(`/api/v1/tickets/${id}/assignee`).set(auth(token)).send({ assigneeId });

      // Experts can read requests but cannot answer tickets
      await assign(support.token, expert.id).expect(400);
      await assign(support.token, owner.id).expect(400);
      await assign(owner.token, support.id).expect(403);
      await assign(expert.token, support.id).expect(403);
      await http().get('/api/v1/tickets/assignees').set(auth(owner.token)).expect(403);
      const candidates = await http()
        .get('/api/v1/tickets/assignees')
        .set(auth(support.token))
        .expect(200);
      const ids = (candidates.body.data as { id: string }[]).map((c) => c.id);
      expect(ids).toContain(support.id);
      expect(ids).not.toContain(expert.id);
    });
  });
});
