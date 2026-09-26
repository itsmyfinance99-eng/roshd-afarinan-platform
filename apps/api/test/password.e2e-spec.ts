import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { NOTIFICATION_PROVIDER } from '../src/modules/notifications/ports/notification-provider';
import { createTestApp, PASSWORD, registerUser, TOKEN_TRANSPORT, uniqueEmail } from './helpers';

describe('Password recovery and sessions (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const NEW_PASSWORD = 'brand-new-secret-42';

  const login = (email: string, password: string) =>
    http().post('/api/v1/auth/login').set(TOKEN_TRANSPORT).send({ email, password });

  /** Requests a reset link and returns the token from the (log) email. */
  async function resetToken(email: string): Promise<string> {
    await http().post('/api/v1/auth/password/forgot').send({ email }).expect(202);
    const sent = app.get(NOTIFICATION_PROVIDER).sent.at(-1);
    expect(sent).toMatchObject({ to: email, template: 'auth.password-reset' });
    const url = new URL(String(sent?.data.resetUrl));
    expect(url.pathname).toBe('/reset-password');
    return url.searchParams.get('token') ?? '';
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('never reveals whether an account exists', async () => {
    const provider = app.get(NOTIFICATION_PROVIDER);
    const before = provider.sent.length;
    const res = await http()
      .post('/api/v1/auth/password/forgot')
      .send({ email: uniqueEmail('nobody') })
      .expect(202);
    expect(res.body.data.message).toMatch(/اگر حسابی/);
    expect(provider.sent.length).toBe(before);
  });

  it('resets the password once, ends every session and stores only a hash', async () => {
    const user = await registerUser(app);
    const token = await resetToken(user.email);
    const stored = await app.get(PrismaService).passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(stored?.tokenHash).not.toBe(token);

    await http()
      .post('/api/v1/auth/password/reset')
      .send({ token, password: NEW_PASSWORD })
      .expect(200);

    // Old password, old refresh token and old access token no longer work
    await login(user.email, PASSWORD).expect(401);
    await http().post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    await http().get('/api/v1/auth/me').set(auth(user.token)).expect(401);
    await login(user.email, NEW_PASSWORD).expect(200);

    // The link is single-use
    const reused = await http()
      .post('/api/v1/auth/password/reset')
      .send({ token, password: 'another-secret-43' })
      .expect(400);
    expect(reused.body.error.message).toMatch(/نامعتبر یا منقضی/);
  });

  it('rejects expired, superseded and forged links', async () => {
    const user = await registerUser(app);
    const first = await resetToken(user.email);
    const second = await resetToken(user.email);
    // A newer request invalidates older links
    await http()
      .post('/api/v1/auth/password/reset')
      .send({ token: first, password: NEW_PASSWORD })
      .expect(400);

    await app.get(PrismaService).passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http()
      .post('/api/v1/auth/password/reset')
      .send({ token: second, password: NEW_PASSWORD })
      .expect(400);

    await http()
      .post('/api/v1/auth/password/reset')
      .send({ token: 'A'.repeat(43), password: NEW_PASSWORD })
      .expect(400);
    await http()
      .post('/api/v1/auth/password/reset')
      .send({ token: 'short', password: NEW_PASSWORD })
      .expect(400);
  });

  it('changes the password, keeps this device and signs out the others', async () => {
    const user = await registerUser(app);
    const other = await login(user.email, PASSWORD).expect(200);

    const wrong = await http()
      .post('/api/v1/auth/password/change')
      .set(auth(user.token))
      .send({ currentPassword: 'not-my-password-1', newPassword: NEW_PASSWORD })
      .expect(400);
    expect(wrong.body.error.details[0].path).toBe('currentPassword');
    const same = await http()
      .post('/api/v1/auth/password/change')
      .set(auth(user.token))
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD })
      .expect(400);
    expect(same.body.error.details[0].path).toBe('newPassword');

    const changed = await http()
      .post('/api/v1/auth/password/change')
      .set({ ...auth(user.token), ...TOKEN_TRANSPORT })
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);
    const fresh = changed.body.data.accessToken as string;
    await http().get('/api/v1/auth/me').set(auth(fresh)).expect(200);

    // The other device is signed out immediately (access and refresh token)
    await http().get('/api/v1/auth/me').set(auth(other.body.data.accessToken)).expect(401);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: other.body.data.refreshToken })
      .expect(401);

    const audit = await app.get(PrismaService).auditLog.findFirst({
      where: { action: 'auth.password_changed', actorId: user.id },
    });
    expect(audit).not.toBeNull();
    expect(app.get(NOTIFICATION_PROVIDER).sent.at(-1)).toMatchObject({
      to: user.email,
      template: 'auth.password-changed',
    });
  });

  it('signs out everywhere, including the current device', async () => {
    const user = await registerUser(app);
    const other = await login(user.email, PASSWORD).expect(200);
    await http().post('/api/v1/auth/logout-all').set(auth(user.token)).expect(200);
    await http().get('/api/v1/auth/me').set(auth(user.token)).expect(401);
    await http().get('/api/v1/auth/me').set(auth(other.body.data.accessToken)).expect(401);
    // Signing in again works
    await login(user.email, PASSWORD).expect(200);
  });

  it('requires authentication to change the password or sign out everywhere', async () => {
    await http()
      .post('/api/v1/auth/password/change')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
    await http().post('/api/v1/auth/logout-all').expect(401);
  });
});
