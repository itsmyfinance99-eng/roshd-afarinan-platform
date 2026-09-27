import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { NOTIFICATION_PROVIDER } from '../src/modules/notifications/ports/notification-provider';
import { createTestApp, PASSWORD, registerUser, TOKEN_TRANSPORT, uniqueEmail } from './helpers';

/** ST-25.10: per-account lockout, common passwords and literal search input. */
describe('Security hardening (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const login = (email: string, password: string) =>
    http().post('/api/v1/auth/login').set(TOKEN_TRANSPORT).send({ email, password });
  const account = (id: string) =>
    app.get(PrismaService).user.findUniqueOrThrow({
      where: { id },
      select: { failedLoginCount: true, lockedUntil: true },
    });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('login lockout', () => {
    it('locks an account after five wrong passwords, even for the right one', async () => {
      const user = await registerUser(app);
      for (let i = 0; i < 5; i++) await login(user.email, 'wrong-password-1').expect(401);

      const locked = await login(user.email, PASSWORD).expect(429);
      expect(locked.body.error.code).toBe('RATE_LIMITED');
      expect(locked.body.error.message).toContain('دقیقه');
      expect((await account(user.id)).lockedUntil).not.toBeNull();

      const prisma = app.get(PrismaService);
      expect(
        await prisma.auditLog.findFirst({
          where: { action: 'auth.account_locked', entityId: user.id },
        }),
      ).not.toBeNull();
      expect(
        await prisma.auditLog.findFirst({
          where: {
            action: 'auth.login_failed',
            actorId: user.id,
            metadata: { equals: { reason: 'locked' } },
          },
        }),
      ).not.toBeNull();

      // When the lock ends, the right password works and the counters reset.
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      await login(user.email, PASSWORD).expect(200);
      expect(await account(user.id)).toEqual({ failedLoginCount: 0, lockedUntil: null });
    });

    it('cannot be bypassed with parallel guesses', async () => {
      const user = await registerUser(app);
      await Promise.all(Array.from({ length: 12 }, () => login(user.email, 'wrong-password-1')));
      expect((await account(user.id)).lockedUntil).not.toBeNull();
      await login(user.email, PASSWORD).expect(429);
    });

    it('resets the count after a successful sign-in', async () => {
      const user = await registerUser(app);
      for (let i = 0; i < 4; i++) await login(user.email, 'wrong-password-1').expect(401);
      await login(user.email, PASSWORD).expect(200);
      for (let i = 0; i < 4; i++) await login(user.email, 'wrong-password-1').expect(401);
      await login(user.email, PASSWORD).expect(200);
    });

    it('a password reset lifts the lock', async () => {
      const user = await registerUser(app);
      for (let i = 0; i < 5; i++) await login(user.email, 'wrong-password-1').expect(401);
      await login(user.email, PASSWORD).expect(429);

      await http().post('/api/v1/auth/password/forgot').send({ email: user.email }).expect(202);
      const sent = app.get(NOTIFICATION_PROVIDER).sent.at(-1);
      const token = new URL(String(sent?.data.resetUrl)).searchParams.get('token') ?? '';
      await http()
        .post('/api/v1/auth/password/reset')
        .send({ token, password: 'fresh-start-77' })
        .expect(200);
      await login(user.email, 'fresh-start-77').expect(200);
    });

    it('never reveals unknown emails through the lock', async () => {
      const email = uniqueEmail('nobody');
      for (let i = 0; i < 8; i++) await login(email, 'wrong-password-1').expect(401);
    });
  });

  // ST-26.02 (F-02): a form on another site must not be able to change state here.
  describe('cross-site requests', () => {
    const CROSS = { 'Sec-Fetch-Site': 'cross-site' } as const;

    it('refuses a cross-site login, register and request submission', async () => {
      const user = await registerUser(app);
      for (const [path, body] of [
        ['/api/v1/auth/login', { email: user.email, password: PASSWORD }],
        ['/api/v1/auth/register', { fullName: 'مهاجم', email: uniqueEmail(), password: PASSWORD }],
        [
          '/api/v1/service-requests',
          { type: 'CONTACT', fullName: 'فرم', mobile: '09120000055', message: 'پیام از سایت دیگر' },
        ],
      ] as const) {
        const res = await http().post(path).set(CROSS).send(body).expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect(res.headers['set-cookie']).toBeUndefined();
      }
    });

    it('allows the site itself, direct navigation and API clients', async () => {
      const user = await registerUser(app);
      for (const site of ['same-origin', 'none']) {
        await http()
          .post('/api/v1/auth/login')
          .set({ 'Sec-Fetch-Site': site, ...TOKEN_TRANSPORT })
          .send({ email: user.email, password: PASSWORD })
          .expect(200);
      }
      // No Sec-Fetch-Site at all: mobile and partner clients.
      await login(user.email, PASSWORD).expect(200);
      // Safe methods are never blocked (the payment gateway returns with a cross-site GET).
      await http().get('/api/v1/health/live').set(CROSS).expect(200);
    });

    it('does not parse form-encoded bodies at all', async () => {
      const user = await registerUser(app);
      const res = await http()
        .post('/api/v1/auth/login')
        .type('form')
        .send({ email: user.email, password: PASSWORD });
      expect(res.status).not.toBe(200);
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  it('rejects common passwords on registration', async () => {
    const res = await http()
      .post('/api/v1/auth/register')
      .set(TOKEN_TRANSPORT)
      .send({ fullName: 'کاربر آزمایشی', email: uniqueEmail(), password: 'Password123' })
      .expect(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'password' })]),
    );
  });

  it('treats % and _ in search input literally', async () => {
    const admin = await registerUser(app, ['admin']);
    const marker = crypto.randomUUID().slice(0, 8);
    await http()
      .post('/api/v1/auth/register')
      .set(TOKEN_TRANSPORT)
      .send({ fullName: `کاربر_${marker}`, email: uniqueEmail(), password: PASSWORD })
      .expect(201);
    const auth = { Authorization: `Bearer ${admin.token}` };

    const percent = await http().get('/api/v1/users?q=%25').set(auth).expect(200);
    expect(percent.body.meta.total).toBe(0);

    const underscore = await http().get('/api/v1/users?q=_&pageSize=100').set(auth).expect(200);
    const rows = underscore.body.data as {
      email: string;
      fullName: string;
      mobile: string | null;
    }[];
    expect(rows.some((u) => u.fullName === `کاربر_${marker}`)).toBe(true);
    expect(rows.every((u) => `${u.email}${u.fullName}${u.mobile ?? ''}`.includes('_'))).toBe(true);

    const courses = await http().get('/api/v1/courses?q=%25').expect(200);
    expect(courses.body.meta.total).toBe(0);
  });
});
