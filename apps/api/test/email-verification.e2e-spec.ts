import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import type { LogNotificationProvider } from '../src/modules/notifications/adapters/log-notification-provider';
import { NOTIFICATION_PROVIDER } from '../src/modules/notifications/ports/notification-provider';
import { createTestApp, registerUser } from './helpers';

describe('Email verification (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const me = async (token: string) =>
    (await http().get('/api/v1/auth/me').set(auth(token)).expect(200)).body.data as {
      emailVerifiedAt: string | null;
    };
  /** Token of the newest verification email sent to `email`. */
  const lastLink = (email: string): string => {
    const sent = app
      .get<LogNotificationProvider>(NOTIFICATION_PROVIDER)
      .sent.filter((m) => m.to === email && m.template === 'auth.verify-email')
      .at(-1);
    const url = new URL(String(sent?.data.verifyUrl));
    expect(url.pathname).toBe('/verify-email');
    return url.searchParams.get('token') ?? '';
  };
  /** Moves the newest link into the past so the resend cooldown has passed. */
  const ageLinks = (userId: string) =>
    app.get(PrismaService).emailVerificationToken.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 5 * 60_000) },
    });
  const verify = (token: string) => http().post('/api/v1/auth/email/verify').send({ token });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends a link on registration that verifies the address once', async () => {
    const user = await registerUser(app);
    expect((await me(user.token)).emailVerifiedAt).toBeNull();
    const token = lastLink(user.email);

    await verify(token).expect(200);
    expect((await me(user.token)).emailVerifiedAt).not.toBeNull();
    await verify(token).expect(400);

    const stored = await app
      .get(PrismaService)
      .emailVerificationToken.findFirst({ where: { userId: user.id } });
    expect(stored?.tokenHash).not.toBe(token);
    const audit = await app
      .get(PrismaService)
      .auditLog.findFirst({ where: { action: 'auth.email_verified', entityId: user.id } });
    expect(audit).not.toBeNull();
  });

  it('resends a fresh link at most once a minute and retires the old one', async () => {
    const user = await registerUser(app);
    const first = lastLink(user.email);

    const tooSoon = await http()
      .post('/api/v1/auth/email/resend')
      .set(auth(user.token))
      .expect(429);
    expect(tooSoon.body.error.code).toBe('RATE_LIMITED');

    await ageLinks(user.id);
    await http().post('/api/v1/auth/email/resend').set(auth(user.token)).expect(202);
    const second = lastLink(user.email);
    expect(second).not.toBe(first);

    await verify(first).expect(400);
    await verify(second).expect(200);
    await ageLinks(user.id);
    const again = await http().post('/api/v1/auth/email/resend').set(auth(user.token)).expect(409);
    expect(again.body.error.code).toBe('CONFLICT');
  });

  it('rejects expired, unknown and malformed links and anonymous resends', async () => {
    const user = await registerUser(app);
    const token = lastLink(user.email);
    await app.get(PrismaService).emailVerificationToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await verify(token).expect(400);
    await verify('A'.repeat(43)).expect(400);
    const malformed = await verify('bad token!').expect(400);
    expect(malformed.body.error.code).toBe('VALIDATION_FAILED');
    await http().post('/api/v1/auth/email/resend').expect(401);
    expect((await me(user.token)).emailVerifiedAt).toBeNull();
  });

  it('a completed password reset also verifies the address', async () => {
    const user = await registerUser(app);
    await http().post('/api/v1/auth/password/forgot').send({ email: user.email }).expect(202);
    const sent = app
      .get<LogNotificationProvider>(NOTIFICATION_PROVIDER)
      .sent.filter((m) => m.template === 'auth.password-reset')
      .at(-1);
    const resetToken = new URL(String(sent?.data.resetUrl)).searchParams.get('token');
    await http()
      .post('/api/v1/auth/password/reset')
      .send({ token: resetToken, password: 'fresh-start-78' })
      .expect(200);
    const row = await app
      .get(PrismaService)
      .user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerifiedAt: true } });
    expect(row.emailVerifiedAt).not.toBeNull();
  });
});
