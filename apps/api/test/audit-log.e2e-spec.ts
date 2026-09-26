import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, PASSWORD, registerUser, TOKEN_TRANSPORT } from './helpers';

describe('Audit log viewer (e2e)', () => {
  let app: INestApplication;
  let admin: { id: string; email: string; token: string };
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    admin = await registerUser(app, ['admin']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists events newest first with actor details and filters by prefix, actor and entity', async () => {
    const target = await registerUser(app, ['support']);
    await http()
      .put(`/api/v1/users/${target.id}/roles`)
      .set(auth(admin.token))
      .send({ roles: ['user', 'expert'] })
      .expect(200);

    const byActor = await http()
      .get(`/api/v1/audit-logs?actor=${encodeURIComponent(admin.email)}&action=users.`)
      .set(auth(admin.token))
      .expect(200);
    expect(byActor.body.data[0]).toMatchObject({
      action: 'users.roles_changed',
      actor: { id: admin.id, email: admin.email },
      entityType: 'user',
      entityId: target.id,
      metadata: { after: ['expert', 'user'] },
    });
    expect(byActor.body.data[0].userAgent).toBeUndefined();

    const byEntity = await http()
      .get(`/api/v1/audit-logs?entityType=user&entityId=${target.id}`)
      .set(auth(admin.token))
      .expect(200);
    expect(byEntity.body.data.map((e: { action: string }) => e.action)).toContain(
      'users.roles_changed',
    );

    // A failed login for an existing account is attributed to it (reason, never the password)
    await http()
      .post('/api/v1/auth/login')
      .set(TOKEN_TRANSPORT)
      .send({ email: target.email, password: `${PASSWORD}-wrong` })
      .expect(401);
    const failed = await http()
      .get('/api/v1/audit-logs?action=auth.login_failed&pageSize=1')
      .set(auth(admin.token))
      .expect(200);
    expect(failed.body.data[0]).toMatchObject({
      action: 'auth.login_failed',
      actor: { email: target.email },
      metadata: { reason: 'bad_password' },
    });

    const unknownActor = await http()
      .get('/api/v1/audit-logs?actor=nobody%40example.com')
      .set(auth(admin.token))
      .expect(200);
    expect(unknownActor.body.data).toHaveLength(0);
  });

  it('redacts secret-like metadata and applies the Iran-time day range', async () => {
    const prisma = app.get(PrismaService);
    await prisma.auditLog.create({
      data: {
        action: 'test.secret_event',
        entityType: 'test',
        entityId: 'redaction',
        metadata: { token: 'should-not-leak', nested: { passwordHash: 'x' }, slug: 'kept' },
        createdAt: new Date('2020-03-01T21:00:00Z'), // 2020-03-02 00:30 in Tehran
      },
    });
    const res = await http()
      .get('/api/v1/audit-logs?entityType=test&entityId=redaction&from=2020-03-02&to=2020-03-02')
      .set(auth(admin.token))
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].metadata).toEqual({
      token: '[redacted]',
      nested: { passwordHash: '[redacted]' },
      slug: 'kept',
    });
    expect(JSON.stringify(res.body)).not.toContain('should-not-leak');

    const dayBefore = await http()
      .get('/api/v1/audit-logs?entityType=test&entityId=redaction&to=2020-03-01')
      .set(auth(admin.token))
      .expect(200);
    expect(dayBefore.body.data).toHaveLength(0);

    await http()
      .get('/api/v1/audit-logs?from=2020-03-05&to=2020-03-01')
      .set(auth(admin.token))
      .expect(400);
    await http().get('/api/v1/audit-logs?action=DROP%20TABLE').set(auth(admin.token)).expect(400);
  });

  it('is only readable with audit:read (admins)', async () => {
    await http().get('/api/v1/audit-logs').expect(401);
    for (const roles of [[], ['support'], ['editor'], ['finance'], ['expert']] as const) {
      const who = await registerUser(app, [...roles]);
      await http().get('/api/v1/audit-logs').set(auth(who.token)).expect(403);
    }
    const superAdmin = await registerUser(app, ['super_admin']);
    await http().get('/api/v1/audit-logs').set(auth(superAdmin.token)).expect(200);
  });
});
