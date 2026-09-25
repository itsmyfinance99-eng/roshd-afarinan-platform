import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

describe('RBAC (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('forbids a regular user from listing users or changing roles (403)', async () => {
    const user = await registerUser(app);
    const target = await registerUser(app);

    await http().get('/api/v1/users').set(auth(user.token)).expect(403);
    const res = await http()
      .put(`/api/v1/users/${target.id}/roles`)
      .set(auth(user.token))
      .send({ roles: ['admin'] })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('forbids a user from escalating their own roles', async () => {
    const user = await registerUser(app);
    await http()
      .put(`/api/v1/users/${user.id}/roles`)
      .set(auth(user.token))
      .send({ roles: ['super_admin'] })
      .expect(403);
  });

  it('lets an admin grant non-privileged roles, and audits the change', async () => {
    const admin = await registerUser(app, ['admin']);
    const target = await registerUser(app);

    const res = await http()
      .put(`/api/v1/users/${target.id}/roles`)
      .set(auth(admin.token))
      .send({ roles: ['editor', 'applicant'] })
      .expect(200);
    expect(res.body.data.roles).toEqual(['applicant', 'editor', 'user']);

    const log = await app.get(PrismaService).auditLog.findFirst({
      where: { action: 'users.roles_changed', entityId: target.id },
    });
    expect(log).toMatchObject({ actorId: admin.id });
    expect(log?.metadata).toEqual({ before: ['user'], after: ['applicant', 'editor', 'user'] });

    // New permissions apply immediately (roles are re-read per request)
    const me = await http().get('/api/v1/auth/me').set(auth(target.token)).expect(200);
    expect(me.body.data.permissions).toEqual(expect.arrayContaining(['cms:write', 'cms:publish']));
  });

  it('only a super_admin may grant admin', async () => {
    const admin = await registerUser(app, ['admin']);
    const superAdmin = await registerUser(app, ['super_admin']);
    const target = await registerUser(app);

    await http()
      .put(`/api/v1/users/${target.id}/roles`)
      .set(auth(admin.token))
      .send({ roles: ['admin'] })
      .expect(403);
    await http()
      .put(`/api/v1/users/${target.id}/roles`)
      .set(auth(superAdmin.token))
      .send({ roles: ['admin'] })
      .expect(200);
  });

  it('returns 404 for an unknown user and 400 for unknown roles', async () => {
    const admin = await registerUser(app, ['admin']);
    await http()
      .put('/api/v1/users/00000000-0000-7000-8000-000000000000/roles')
      .set(auth(admin.token))
      .send({ roles: ['editor'] })
      .expect(404);
    await http()
      .put(`/api/v1/users/${admin.id}/roles`)
      .set(auth(admin.token))
      .send({ roles: ['emperor'] })
      .expect(400);
  });

  it('paginates the user list for admins', async () => {
    const admin = await registerUser(app, ['admin']);
    const res = await http()
      .get('/api/v1/users?page=1&pageSize=2')
      .set(auth(admin.token))
      .expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2 });
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0].passwordHash).toBeUndefined();
  });
});
