import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, uniqueEmail } from './helpers';

/**
 * Behind one reverse proxy (TRUST_PROXY=1): each visitor has its own rate-limit bucket and
 * audit IP, a forged X-Forwarded-For cannot change it, and server-side reads with the internal
 * token are not throttled. Supertest's socket plays the proxy (127.0.0.1).
 */
describe('Client IP behind a proxy (e2e)', () => {
  let app: INestApplication;
  const TOKEN = 'internal-token-for-tests-0123456789abcdef';
  const saved = {
    TRUST_PROXY: process.env.TRUST_PROXY,
    THROTTLE_LIMIT: process.env.THROTTLE_LIMIT,
    INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN,
  };
  const http = () => request(app.getHttpServer());
  /** What nginx forwards: whatever the client sent, then the real client address. */
  const via = (clientIp: string, forged?: string) => ({
    'X-Forwarded-For': forged ? `${forged}, ${clientIp}` : clientIp,
  });

  beforeAll(async () => {
    process.env.TRUST_PROXY = '1';
    process.env.THROTTLE_LIMIT = '3';
    process.env.INTERNAL_API_TOKEN = TOKEN;
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('gives every visitor a separate rate-limit bucket', async () => {
    for (let i = 0; i < 3; i++)
      await http().get('/api/v1/articles').set(via('198.51.100.1')).expect(200);
    await http().get('/api/v1/articles').set(via('198.51.100.1')).expect(429);
    // Another visitor behind the same proxy is unaffected
    await http().get('/api/v1/articles').set(via('198.51.100.2')).expect(200);
  });

  it('ignores addresses forged by the client in X-Forwarded-For', async () => {
    for (let i = 0; i < 3; i++) {
      await http()
        .get('/api/v1/articles')
        .set(via('198.51.100.3', `10.0.0.${i}`))
        .expect(200);
    }
    await http().get('/api/v1/articles').set(via('198.51.100.3', '10.0.0.99')).expect(429);
  });

  it('exempts server-side reads with the internal token, but never mutations', async () => {
    for (let i = 0; i < 6; i++) {
      await http().get('/api/v1/articles').set({ 'x-internal-token': TOKEN }).expect(200);
    }
    // A wrong token is an ordinary visitor (the proxy address here)
    const wrong = () => http().get('/api/v1/articles').set({ 'x-internal-token': 'nope' });
    for (let i = 0; i < 3; i++) await wrong().expect(200);
    await wrong().expect(429);
    // Mutations are throttled even with the token
    const post = () =>
      http()
        .post('/api/v1/auth/login')
        .set({ 'x-internal-token': TOKEN, ...via('198.51.100.9') })
        .send({ email: uniqueEmail(), password: 'wrong-password-1' });
    for (let i = 0; i < 3; i++) expect((await post()).status).toBe(401);
    expect((await post()).status).toBe(429);
  });

  it('records the real visitor IP in the audit log', async () => {
    const email = uniqueEmail();
    await http()
      .post('/api/v1/auth/login')
      .set(via('203.0.113.77', '1.2.3.4'))
      .send({ email, password: 'wrong-password-1' })
      .expect(401);
    const entry = await app.get(PrismaService).auditLog.findFirst({
      where: { action: 'auth.login_failed', ip: '203.0.113.77' },
    });
    expect(entry).not.toBeNull();
  });
});
