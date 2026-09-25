import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, uniqueEmail } from './helpers';

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication;
  const previous = process.env.AUTH_THROTTLE_LIMIT;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '3';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    process.env.AUTH_THROTTLE_LIMIT = previous;
  });

  it('returns 429 RATE_LIMITED after too many login attempts', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail(), password: 'whatever-1' });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not apply the auth limit to other routes', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    }
  });
});
