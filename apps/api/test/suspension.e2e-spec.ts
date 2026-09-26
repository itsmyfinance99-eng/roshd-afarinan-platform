import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, PASSWORD, registerUser, TOKEN_TRANSPORT } from './helpers';

describe('Account suspension (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const setStatus = (token: string, id: string, body: Record<string, unknown>) =>
    http().patch(`/api/v1/users/${id}/status`).set(auth(token)).send(body);
  const login = (email: string) =>
    http().post('/api/v1/auth/login').set(TOKEN_TRANSPORT).send({ email, password: PASSWORD });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('suspends immediately and keeps old sessions dead after reactivation', async () => {
    const admin = await registerUser(app, ['admin']);
    const target = await registerUser(app);

    const suspended = await setStatus(admin.token, target.id, {
      status: 'SUSPENDED',
      reason: 'ارسال پیام‌های نامرتبط',
    }).expect(200);
    expect(suspended.body.data.status).toBe('SUSPENDED');

    // Current access token, refresh token and new logins all stop working
    await http().get('/api/v1/auth/me').set(auth(target.token)).expect(401);
    const blocked = await login(target.email).expect(403);
    expect(blocked.body.error.message).toMatch(/غیرفعال/);

    await setStatus(admin.token, target.id, { status: 'ACTIVE' }).expect(200);
    // The old session never comes back; a fresh login works
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: target.refreshToken })
      .expect(401);
    await http().get('/api/v1/auth/me').set(auth(target.token)).expect(401);
    const fresh = await login(target.email).expect(200);
    await http().get('/api/v1/auth/me').set(auth(fresh.body.data.accessToken)).expect(200);

    const events = await app.get(PrismaService).auditLog.findMany({
      where: { action: 'users.status_changed', entityId: target.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.metadata)).toEqual([
      { from: 'ACTIVE', to: 'SUSPENDED', reason: 'ارسال پیام‌های نامرتبط' },
      { from: 'SUSPENDED', to: 'ACTIVE', reason: null },
    ]);
  });

  it('applies the policy: no self-suspension, admin accounts need super_admin', async () => {
    const admin = await registerUser(app, ['admin']);
    const otherAdmin = await registerUser(app, ['admin']);
    const superAdmin = await registerUser(app, ['super_admin']);

    const self = await setStatus(admin.token, admin.id, { status: 'SUSPENDED' }).expect(403);
    expect(self.body.error.message).toMatch(/خودتان/);
    await setStatus(admin.token, otherAdmin.id, { status: 'SUSPENDED' }).expect(403);
    await setStatus(superAdmin.token, otherAdmin.id, { status: 'SUSPENDED' }).expect(200);
  });

  it('is closed to users without users:manage-roles', async () => {
    const target = await registerUser(app);
    await http()
      .patch(`/api/v1/users/${target.id}/status`)
      .send({ status: 'SUSPENDED' })
      .expect(401);
    for (const roles of [[], ['support'], ['editor'], ['finance']] as const) {
      const who = await registerUser(app, [...roles]);
      await setStatus(who.token, target.id, { status: 'SUSPENDED' }).expect(403);
    }
    const admin = await registerUser(app, ['admin']);
    await setStatus(admin.token, target.id, { status: 'BANNED' }).expect(400);
    await setStatus(admin.token, '00000000-0000-7000-8000-000000000000', {
      status: 'SUSPENDED',
    }).expect(404);
  });
});
