import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import {
  cookiesOf,
  createTestApp,
  PASSWORD,
  registerUser,
  TOKEN_TRANSPORT,
  uniqueEmail,
  XHR,
} from './helpers';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('register', () => {
    it('creates a user with the default role, hashes the password and sets httpOnly cookies', async () => {
      const email = uniqueEmail();
      const res = await http()
        .post('/api/v1/auth/register')
        .set(XHR)
        .send({ fullName: 'مریم احمدی', email, password: PASSWORD, mobile: '۰۹۱۲۱۲۳۴۵۶۷' })
        .expect(201);

      expect(res.body.data.user).toMatchObject({ email, roles: ['user'], mobile: '09121234567' });
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.accessToken).toBeUndefined(); // browsers never see tokens

      const cookies = cookiesOf(res).join('\n');
      expect(cookies).toMatch(/ra_at=[^;]+;.*HttpOnly/i);
      expect(cookies).toMatch(/ra_rt=[^;]+;.*Path=\/api\/v1\/auth.*HttpOnly/i);
      expect(cookies).toMatch(/SameSite=Lax/i);

      const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(
        await prisma.auditLog.count({ where: { action: 'auth.register', actorId: stored.id } }),
      ).toBe(1);
    });

    it('rejects a duplicate email with 409', async () => {
      const { email } = await registerUser(app);
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ fullName: 'تکراری', email, password: PASSWORD })
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('rejects a weak password with field details', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ fullName: 'کاربر', email: uniqueEmail(), password: '12345678' })
        .expect(400);
      expect(res.body.error.details[0].path).toBe('password');
    });
  });

  describe('login', () => {
    it('returns the same generic 401 for a wrong password and an unknown email', async () => {
      const { email } = await registerUser(app);
      const wrong = await http()
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password-1' })
        .expect(401);
      const unknown = await http()
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail(), password: 'wrong-password-1' })
        .expect(401);
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
      expect(
        await prisma.auditLog.count({
          where: { action: 'auth.login_failed', actorId: { not: null } },
        }),
      ).toBeGreaterThan(0);
    });

    it('issues bearer tokens to token-transport clients', async () => {
      const { email } = await registerUser(app);
      const res = await http()
        .post('/api/v1/auth/login')
        .set(TOKEN_TRANSPORT)
        .send({ email, password: PASSWORD })
        .expect(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(cookiesOf(res)).toHaveLength(0);

      const me = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.data.accessToken}`)
        .expect(200);
      expect(me.body.data).toMatchObject({ email, roles: ['user'], permissions: [] });
    });

    it('refuses suspended accounts', async () => {
      const { id, email } = await registerUser(app);
      await prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
      await http().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(403);
    });
  });

  describe('default deny', () => {
    it('rejects private routes without a token', async () => {
      const res = await http().get('/api/v1/auth/me').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a tampered token', async () => {
      const { token } = await registerUser(app);
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token.slice(0, -2)}xx`)
        .expect(401);
    });

    it('revokes access immediately when an account is suspended', async () => {
      const { id, token } = await registerUser(app);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
      await prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    });
  });

  describe('cookie sessions', () => {
    it('authenticates with cookies and requires the CSRF header on mutations', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/auth/register')
        .set(XHR)
        .send({ fullName: 'کاربر کوکی', email: uniqueEmail(), password: PASSWORD })
        .expect(201);

      await agent.get('/api/v1/auth/me').expect(200);
      // cookie-authenticated mutation without X-Requested-With → blocked
      await agent.patch('/api/v1/users/me').send({ fullName: 'نام جدید' }).expect(403);
      const ok = await agent
        .patch('/api/v1/users/me')
        .set(XHR)
        .send({ fullName: 'نام جدید' })
        .expect(200);
      expect(ok.body.data.fullName).toBe('نام جدید');
    });

    it('rotates the refresh cookie and logs out', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/api/v1/auth/register')
        .set(XHR)
        .send({ fullName: 'کاربر', email: uniqueEmail(), password: PASSWORD })
        .expect(201);

      await agent.post('/api/v1/auth/refresh').send({}).expect(403); // missing CSRF header
      const refreshed = await agent.post('/api/v1/auth/refresh').set(XHR).send({}).expect(200);
      expect(cookiesOf(refreshed).join('\n')).toMatch(/ra_rt=/);

      await agent.post('/api/v1/auth/logout').set(XHR).send({}).expect(200);
      await agent.post('/api/v1/auth/refresh').set(XHR).send({}).expect(401);
    });
  });

  describe('refresh token rotation', () => {
    it('rotates tokens and revokes the whole family when a used token is replayed', async () => {
      const { id, refreshToken: first } = await registerUser(app);

      const rotated = await http()
        .post('/api/v1/auth/refresh')
        .set(TOKEN_TRANSPORT)
        .send({ refreshToken: first })
        .expect(200);
      const second = rotated.body.data.refreshToken as string;
      expect(second).not.toBe(first);

      // Replay of the first (already used) token → theft suspected
      await http()
        .post('/api/v1/auth/refresh')
        .set(TOKEN_TRANSPORT)
        .send({ refreshToken: first })
        .expect(401);
      // The legitimate successor is now revoked too
      await http()
        .post('/api/v1/auth/refresh')
        .set(TOKEN_TRANSPORT)
        .send({ refreshToken: second })
        .expect(401);

      expect(
        await prisma.auditLog.count({
          where: { action: 'auth.refresh_reuse_detected', actorId: id },
        }),
      ).toBe(2); // the replayed token, then the (now revoked) successor
    });

    it('rejects unknown refresh tokens', async () => {
      await http()
        .post('/api/v1/auth/refresh')
        .set(TOKEN_TRANSPORT)
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(401);
    });

    it('logout revokes the session family', async () => {
      const { refreshToken } = await registerUser(app);
      await http().post('/api/v1/auth/logout').send({ refreshToken }).expect(200);
      await http()
        .post('/api/v1/auth/refresh')
        .set(TOKEN_TRANSPORT)
        .send({ refreshToken })
        .expect(401);
    });
  });
});
