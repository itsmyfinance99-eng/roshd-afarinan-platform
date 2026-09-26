import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

describe('Dashboard stats (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports live database counts for admins', async () => {
    await http()
      .post('/api/v1/service-requests')
      .send({
        type: 'CONTACT',
        fullName: 'آمار',
        mobile: '09120000044',
        message: 'پیام برای شمارش آمار',
      })
      .expect(201);
    const admin = await registerUser(app, ['admin']);
    const res = await http().get('/api/v1/dashboard/stats').set(auth(admin.token)).expect(200);

    const prisma = app.get(PrismaService);
    const [requests, closedRequests, openTickets, active] = await Promise.all([
      prisma.serviceRequest.count(),
      prisma.serviceRequest.count({ where: { status: 'CLOSED' } }),
      prisma.ticket.count({ where: { status: { in: ['OPEN', 'PENDING'] } } }),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
    ]);
    expect(res.body.data.requests).toMatchObject({
      total: requests,
      open: requests - closedRequests,
    });
    expect(res.body.data.requests.lastSevenDays).toBeGreaterThanOrEqual(1);
    expect(res.body.data.tickets.open).toBe(openTickets);
    expect(res.body.data.users.active).toBe(active);
    expect(Object.keys(res.body.data.requests.byStatus).sort()).toEqual([
      'CLOSED',
      'IN_REVIEW',
      'NEW',
      'RESPONDED',
    ]);
  });

  it('exposes each section only with its permission', async () => {
    await http().get('/api/v1/dashboard/stats').expect(401);

    const user = await registerUser(app);
    const plain = await http().get('/api/v1/dashboard/stats').set(auth(user.token)).expect(200);
    expect(Object.keys(plain.body.data)).toEqual(['generatedAt']);

    const support = await registerUser(app, ['support']);
    const staff = await http().get('/api/v1/dashboard/stats').set(auth(support.token)).expect(200);
    expect(staff.body.data.requests).toBeDefined();
    expect(staff.body.data.tickets).toBeDefined();
    expect(staff.body.data.users).toBeUndefined();

    const editor = await registerUser(app, ['editor']);
    const content = await http().get('/api/v1/dashboard/stats').set(auth(editor.token)).expect(200);
    expect(content.body.data.requests).toBeUndefined();
    expect(content.body.data.tickets).toBeUndefined();

    const expert = await registerUser(app, ['expert']);
    const reviewer = await http()
      .get('/api/v1/dashboard/stats')
      .set(auth(expert.token))
      .expect(200);
    expect(reviewer.body.data.requests).toBeDefined();
    expect(reviewer.body.data.tickets).toBeUndefined();
  });
});
