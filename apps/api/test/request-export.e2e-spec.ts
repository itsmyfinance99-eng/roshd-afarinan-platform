import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

/** Collects the raw body so the BOM bytes can be asserted (string decoders may drop them). */
function binary(res: request.Response, done: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

/** Today in Iran time as YYYY-MM-DD. */
const tehranToday = () => new Date(Date.now() + 3.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('Service request export (e2e)', () => {
  let app: INestApplication;
  let support: { id: string; token: string };
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const submit = (body: Record<string, unknown>) =>
    http()
      .post('/api/v1/service-requests')
      .send({ fullName: 'کاربر خروجی', mobile: '09120000077', ...body })
      .expect(201);

  const exportCsv = (token: string, query: Record<string, string> = {}) =>
    http()
      .get('/api/v1/service-requests/export')
      .query(query)
      .set(auth(token))
      .buffer(true)
      .parse(binary);

  beforeAll(async () => {
    app = await createTestApp();
    support = await registerUser(app, ['support']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exports filtered requests as a BOM-prefixed, formula-safe CSV and audits it', async () => {
    const research = await submit({
      type: 'RESEARCH',
      topic: 'زنجیره ارزش فولاد',
      message: '=HYPERLINK("http://evil.example","کلیک")',
    });
    const contact = await submit({ type: 'CONTACT', message: 'پیام تماس برای آزمون خروجی' });
    const today = tehranToday();

    const res = await exportCsv(support.token, { type: 'RESEARCH', from: today, to: today }).expect(
      200,
    );
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="service-requests-\d{8}-\d{4}\.csv"$/,
    );
    expect(res.headers['cache-control']).toBe('private, no-store');

    const body = res.body as Buffer;
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = body.subarray(3).toString('utf8');
    const [header, ...lines] = text.trimEnd().split('\r\n');
    expect(header).toBe(
      'کد پیگیری,نوع,وضعیت,تاریخ ثبت,نام و نام خانوادگی,موبایل,ایمیل,موضوع,جزئیات,متن',
    );
    const row = lines.find((l) => l.startsWith(research.body.data.trackingCode as string));
    expect(row).toBeDefined();
    expect(row).toContain('سفارش پژوهش');
    expect(row).toContain('="09120000077"');
    expect(row).toContain('"\'=HYPERLINK(""http://evil.example"",""کلیک"")"');
    expect(text).not.toContain(contact.body.data.trackingCode as string);
    expect(res.headers['x-export-rows']).toBe(String(lines.length));

    const audit = await app.get(PrismaService).auditLog.findFirst({
      where: { action: 'service_requests.exported', actorId: support.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.metadata).toMatchObject({
      filters: { type: 'RESEARCH', status: null, from: today, to: today },
      rows: lines.length,
    });
  });

  it('returns only the header for an empty range and rejects invalid ranges', async () => {
    const empty = await exportCsv(support.token, { from: '2020-01-01', to: '2020-01-02' }).expect(
      200,
    );
    const lines = (empty.body as Buffer).subarray(3).toString('utf8').trimEnd().split('\r\n');
    expect(lines).toHaveLength(1);

    const reversed = await http()
      .get('/api/v1/service-requests/export?from=2026-09-10&to=2026-09-01')
      .set(auth(support.token))
      .expect(400);
    expect(reversed.body.error.details[0].path).toBe('to');
    await http()
      .get('/api/v1/service-requests/export?from=1405-13-40')
      .set(auth(support.token))
      .expect(400);
  });

  it('applies the same date filter to the staff list', async () => {
    const past = await http()
      .get('/api/v1/service-requests?from=2020-01-01&to=2020-01-02')
      .set(auth(support.token))
      .expect(200);
    expect(past.body.data).toHaveLength(0);
    expect(past.body.meta.total).toBe(0);
  });

  it('denies the export without requests:read-all and does not audit denied attempts', async () => {
    const user = await registerUser(app);
    const editor = await registerUser(app, ['editor']);
    const finance = await registerUser(app, ['finance']);

    await http().get('/api/v1/service-requests/export').expect(401);
    for (const who of [user, editor, finance]) {
      const denied = await http()
        .get('/api/v1/service-requests/export')
        .set(auth(who.token))
        .expect(403);
      expect(denied.body.error.code).toBe('FORBIDDEN');
    }
    const audits = await app.get(PrismaService).auditLog.count({
      where: {
        action: 'service_requests.exported',
        actorId: { in: [user.id, editor.id, finance.id] },
      },
    });
    expect(audits).toBe(0);

    // expert holds requests:read-all and may export
    const expert = await registerUser(app, ['expert']);
    await exportCsv(expert.token).expect(200);
  });
});
