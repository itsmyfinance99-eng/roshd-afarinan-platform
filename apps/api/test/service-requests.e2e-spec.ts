import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from '../src/modules/notifications/ports/notification-provider';
import type { LogNotificationProvider } from '../src/modules/notifications/adapters/log-notification-provider';
import { createTestApp, registerUser } from './helpers';

const feasibility = {
  type: 'FEASIBILITY',
  fullName: 'علی رضایی',
  mobile: '09121234567',
  sector: 'معدنی',
  stage: 'ایده اولیه',
  location: 'یزد',
  message: 'طرح فرآوری سنگ آهن با ظرفیت اولیه کوچک در استان یزد',
};

describe('Service requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('submission', () => {
    it('accepts a guest request, returns a tracking code, audits and notifies', async () => {
      const res = await http().post('/api/v1/service-requests').send(feasibility).expect(201);
      expect(res.body.data).toMatchObject({ type: 'FEASIBILITY', status: 'NEW' });
      expect(res.body.data.trackingCode).toMatch(/^RA-[0-9A-Z]{8}$/);

      const stored = await prisma.serviceRequest.findUniqueOrThrow({
        where: { trackingCode: res.body.data.trackingCode },
        include: { events: true },
      });
      expect(stored.userId).toBeNull();
      expect(stored.details).toEqual({ sector: 'معدنی', stage: 'ایده اولیه', location: 'یزد' });
      expect(stored.events).toHaveLength(1);
      expect(
        await prisma.auditLog.count({
          where: { action: 'service_request.created', entityId: stored.id },
        }),
      ).toBe(1);

      const notifications = app.get<NotificationProvider>(
        NOTIFICATION_PROVIDER,
      ) as LogNotificationProvider;
      expect(notifications.sent.at(-1)).toMatchObject({
        to: '09121234567',
        template: 'service-request.received',
        data: { trackingCode: res.body.data.trackingCode },
      });
    });

    it('links the request to the signed-in user', async () => {
      const user = await registerUser(app);
      const res = await http()
        .post('/api/v1/service-requests')
        .set(auth(user.token))
        .send({
          type: 'CONTACT',
          fullName: 'کاربر',
          mobile: '09120000000',
          message: 'لطفاً با من تماس بگیرید.',
        })
        .expect(201);
      const stored = await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: res.body.data.id },
      });
      expect(stored.userId).toBe(user.id);
    });

    it('validates type-specific fields with Persian messages', async () => {
      const res = await http()
        .post('/api/v1/service-requests')
        .send({ ...feasibility, sector: undefined, message: 'کوتاه' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      const paths = res.body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['sector', 'message']));
    });

    it('rejects bots that fill the honeypot', async () => {
      await http()
        .post('/api/v1/service-requests')
        .send({ ...feasibility, website: 'https://spam.example' })
        .expect(400);
    });
  });

  describe('tracking', () => {
    it('reveals status only when code and mobile match', async () => {
      const created = await http().post('/api/v1/service-requests').send(feasibility).expect(201);
      const code = created.body.data.trackingCode as string;

      const ok = await http()
        .get(
          `/api/v1/service-requests/track?code=${code.toLowerCase()}&mobile=${feasibility.mobile}`,
        )
        .expect(200);
      expect(ok.body.data).toEqual(
        expect.objectContaining({ trackingCode: code, status: 'NEW', type: 'FEASIBILITY' }),
      );
      expect(ok.body.data.mobile).toBeUndefined();
      expect(ok.body.data.message).toBeUndefined();

      await http()
        .get(`/api/v1/service-requests/track?code=${code}&mobile=09129999999`)
        .expect(404);
      await http()
        .get(`/api/v1/service-requests/track?code=RA-00000000&mobile=09121234567`)
        .expect(404);
    });
  });

  describe('ownership and staff access', () => {
    it("lists only the user's own requests and hides others' (404)", async () => {
      const owner = await registerUser(app);
      const stranger = await registerUser(app);
      const created = await http()
        .post('/api/v1/service-requests')
        .set(auth(owner.token))
        .send(feasibility)
        .expect(201);
      const id = created.body.data.id as string;

      const mine = await http()
        .get('/api/v1/service-requests/mine')
        .set(auth(owner.token))
        .expect(200);
      expect(mine.body.data.map((r: { id: string }) => r.id)).toEqual([id]);
      const theirs = await http()
        .get('/api/v1/service-requests/mine')
        .set(auth(stranger.token))
        .expect(200);
      expect(theirs.body.data).toHaveLength(0);

      await http().get(`/api/v1/service-requests/${id}`).set(auth(owner.token)).expect(200);
      await http().get(`/api/v1/service-requests/${id}`).set(auth(stranger.token)).expect(404);
      await http().get(`/api/v1/service-requests/${id}`).expect(401);
    });

    it('forbids regular users from listing all or changing status', async () => {
      const user = await registerUser(app);
      await http().get('/api/v1/service-requests').set(auth(user.token)).expect(403);
      const created = await http().post('/api/v1/service-requests').send(feasibility).expect(201);
      await http()
        .patch(`/api/v1/service-requests/${created.body.data.id}/status`)
        .set(auth(user.token))
        .send({ status: 'IN_REVIEW' })
        .expect(403);
    });

    it('lets support move a request through valid statuses only, with history and audit', async () => {
      const support = await registerUser(app, ['support']);
      const owner = await registerUser(app);
      const created = await http()
        .post('/api/v1/service-requests')
        .set(auth(owner.token))
        .send(feasibility)
        .expect(201);
      const id = created.body.data.id as string;
      const patch = (status: string, note?: string) =>
        http()
          .patch(`/api/v1/service-requests/${id}/status`)
          .set(auth(support.token))
          .send({ status, note });

      const conflict = await patch('RESPONDED').expect(409);
      expect(conflict.body.error.code).toBe('CONFLICT');

      await patch('IN_REVIEW', 'یادداشت داخلی').expect(200);
      const responded = await patch('RESPONDED').expect(200);
      expect(responded.body.data.status).toBe('RESPONDED');
      expect(responded.body.data.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
        'NEW',
        'IN_REVIEW',
        'RESPONDED',
      ]);

      // The owner sees the timeline but not internal staff notes
      const ownerView = await http()
        .get(`/api/v1/service-requests/${id}`)
        .set(auth(owner.token))
        .expect(200);
      expect(
        ownerView.body.data.events.every((e: { note: string | null }) => e.note === null),
      ).toBe(true);

      const staffList = await http()
        .get('/api/v1/service-requests?status=RESPONDED&type=FEASIBILITY')
        .set(auth(support.token))
        .expect(200);
      expect(staffList.body.data.map((r: { id: string }) => r.id)).toContain(id);
      expect(
        await prisma.auditLog.count({
          where: { action: 'service_request.status_changed', entityId: id },
        }),
      ).toBe(2);
    });
  });
});
