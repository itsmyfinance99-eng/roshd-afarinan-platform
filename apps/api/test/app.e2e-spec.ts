import { Controller, type INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loginSchema, type LoginInput } from '@roshd/validation';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { Public } from '../src/common/decorators/public.decorator';
import { ZodBody } from '../src/common/http/zod';
import { HealthRegistry } from '../src/modules/health/health.registry';
import type { LogErrorReporter } from '../src/modules/monitoring/adapters/log-error-reporter';
import { ERROR_REPORTER } from '../src/modules/monitoring/ports/error-reporter';

@Public()
@Controller('e2e-probe')
class ProbeController {
  @Post('echo')
  echo(@ZodBody(loginSchema) body: LoginInput) {
    return { email: body.email };
  }

  @Post('boom')
  boom() {
    throw new Error('secret internal detail');
  }

  @Post('boom-personal')
  boomPersonal() {
    throw new Error('lookup failed for maryam@example.com / 09121234567');
  }
}

describe('HTTP foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live returns the success envelope with a request id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(res.body.data).toEqual({ status: 'ok' });
    expect(res.body.meta.requestId).toBe(res.headers['x-request-id']);
  });

  it('echoes a well-formed client request id and rejects malformed ones', async () => {
    const ok = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'client-123');
    expect(ok.headers['x-request-id']).toBe('client-123');

    const bad = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'bad id <script>');
    expect(bad.headers['x-request-id']).not.toBe('bad id <script>');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns 404 in the error envelope for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns VALIDATION_FAILED with field details', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/e2e-probe/echo')
      .send({ email: 'not-email' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'email' })]),
    );
  });

  it('passes validated, normalised data to the handler', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/e2e-probe/echo')
      .send({ email: ' USER@Example.com ', password: 'x' })
      .expect(201);
    expect(res.body.data).toEqual({ email: 'user@example.com' });
  });

  it('never leaks internal error details', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/e2e-probe/boom').expect(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
  });

  it('reports 5xx errors with the request id and without personal data or query strings', async () => {
    const reporter = app.get<LogErrorReporter>(ERROR_REPORTER);
    const res = await request(app.getHttpServer())
      .post('/api/v1/e2e-probe/boom-personal?email=maryam@example.com')
      .set('X-Request-Id', 'trace-500')
      .expect(500);
    expect(res.body.error.requestId).toBe('trace-500');
    const report = reporter.recent.at(-1);
    expect(report).toMatchObject({
      name: 'Error',
      context: { source: 'http', requestId: 'trace-500', method: 'POST', statusCode: 500 },
    });
    expect(report?.context.route).toMatch(/e2e-probe\/boom-personal$/);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('maryam@example.com');
    expect(serialized).not.toContain('09121234567');
  });

  // ST-26.05 (F-10): malformed bodies are client mistakes, not server errors, and must not
  // raise error reports.
  it('maps oversized, malformed and wrongly encoded bodies to 4xx without reporting them', async () => {
    const reporter = app.get<LogErrorReporter>(ERROR_REPORTER);
    const before = reporter.recent.length;
    const post = (body: string, headers: Record<string, string>) =>
      request(app.getHttpServer()).post('/api/v1/e2e-probe/echo').set(headers).send(body);

    const tooLarge = await post('x'.repeat(2 * 1024 * 1024), {
      'Content-Type': 'application/json',
    });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    const badJson = await post('{"email":', { 'Content-Type': 'application/json' });
    expect(badJson.status).toBe(400);

    // A corrupt gzip body is malformed (400); an encoding the server cannot read is 415.
    const corruptGzip = await post('not-gzip', {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
    });
    expect(corruptGzip.status).toBe(400);
    const unknownEncoding = await post('{}', {
      'Content-Type': 'application/json',
      'Content-Encoding': 'exotic',
    });
    expect(unknownEncoding.status).toBe(415);
    expect(unknownEncoding.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    expect(reporter.recent).toHaveLength(before);
  });

  it('does not report client errors', async () => {
    const reporter = app.get<LogErrorReporter>(ERROR_REPORTER);
    const before = reporter.recent.length;
    await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    await request(app.getHttpServer()).post('/api/v1/e2e-probe/echo').send({}).expect(400);
    expect(reporter.recent).toHaveLength(before);
  });

  it('readiness turns 503 when a dependency is down', async () => {
    const ok = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(ok.body.data).toEqual({ status: 'ok', checks: { database: 'up', storage: 'up' } });

    app.get(HealthRegistry).register('fake-dependency', () => Promise.reject(new Error('down')));
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.error.details).toEqual([{ path: 'fake-dependency', message: 'down' }]);
  });
});
