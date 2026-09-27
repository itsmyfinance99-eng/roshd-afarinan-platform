import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

const slug = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

describe('Investment opportunities (e2e)', () => {
  let app: INestApplication;
  let editor: { token: string };
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createOpportunity = (body: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/catalog/investments')
      .set(auth(editor.token))
      .send({
        slug: slug('opp'),
        title: 'واحد فرآوری سنگ آهن',
        summary: 'طرح فرآوری سنگ آهن در مرحله مطالعه بازار',
        description: '## معرفی طرح\nمتن',
        sector: 'MINING',
        stage: 'MARKET_STUDY',
        province: 'یزد',
        ...body,
      });

  const publish = (id: string) =>
    http().post(`/api/v1/catalog/investments/${id}/publish`).set(auth(editor.token)).expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    editor = await registerUser(app, ['editor']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes opportunities with a string amount and filters by sector, stage and province', async () => {
    const created = await createOpportunity({
      estimatedInvestmentRials: '۱۲۰٬۰۰۰٬۰۰۰٬۰۰۰',
      serviceNeeded: 'مطالعات امکان‌سنجی',
    }).expect(201);
    expect(created.body.data).toMatchObject({
      status: 'DRAFT',
      estimatedInvestmentRials: '120000000000',
    });
    const { id, slug: s } = created.body.data as { id: string; slug: string };
    await http().get(`/api/v1/investments/${s}`).expect(404);
    await publish(id);

    const detail = await http().get(`/api/v1/investments/${s}`).expect(200);
    expect(detail.body.data).toMatchObject({
      slug: s,
      sector: 'MINING',
      stage: 'MARKET_STUDY',
      estimatedInvestmentRials: '120000000000',
    });
    expect(detail.body.data.status).toBeUndefined();

    const bySector = await http()
      .get('/api/v1/investments?sector=MINING&stage=MARKET_STUDY&pageSize=100')
      .expect(200);
    expect(bySector.body.data.map((o: { slug: string }) => o.slug)).toContain(s);
    expect(bySector.body.data[0].description).toBeUndefined();
    const otherSector = await http()
      .get('/api/v1/investments?sector=ENERGY&pageSize=100')
      .expect(200);
    expect(otherSector.body.data.map((o: { slug: string }) => o.slug)).not.toContain(s);
    const byProvince = await http()
      .get(`/api/v1/investments?q=${encodeURIComponent('یزد')}&pageSize=100`)
      .expect(200);
    expect(byProvince.body.data.map((o: { slug: string }) => o.slug)).toContain(s);

    await http()
      .post(`/api/v1/catalog/investments/${id}/archive`)
      .set(auth(editor.token))
      .expect(200);
    await http().get(`/api/v1/investments/${s}`).expect(404);
  });

  it('validates amounts, enums and unique slugs', async () => {
    const zero = await createOpportunity({ estimatedInvestmentRials: '0' }).expect(400);
    expect(zero.body.error.details[0].path).toBe('estimatedInvestmentRials');
    await createOpportunity({ estimatedInvestmentRials: '12.5' }).expect(400);
    await createOpportunity({ sector: 'CRYPTO' }).expect(400);
    const s = slug('dup');
    await createOpportunity({ slug: s }).expect(201);
    await createOpportunity({ slug: s }).expect(409);
  });

  it('protects opportunity management', async () => {
    const investor = await registerUser(app, ['investor']);
    const support = await registerUser(app, ['support']);
    await http().get('/api/v1/catalog/investments').expect(401);
    for (const who of [investor, support]) {
      await http().get('/api/v1/catalog/investments').set(auth(who.token)).expect(403);
      await http()
        .post('/api/v1/catalog/investments')
        .set(auth(who.token))
        .send({ slug: slug('x') })
        .expect(403);
    }
  });

  it('records interest as an INVESTMENT service request that references the opportunity', async () => {
    const res = await http()
      .post('/api/v1/service-requests')
      .send({
        type: 'INVESTMENT',
        fullName: 'سرمایه‌گذار آزمایشی',
        mobile: '09120000055',
        reference: 'iron-ore-processing',
        message: 'علاقه‌مند به دریافت اطلاعات بیشتر درباره این طرح هستم.',
      })
      .expect(201);
    const stored = await app
      .get(PrismaService)
      .serviceRequest.findUnique({ where: { id: res.body.data.id as string } });
    expect(stored).toMatchObject({
      type: 'INVESTMENT',
      details: { reference: 'iron-ore-processing' },
    });
  });

  it('lists only indexable, real opportunities in the sitemap', async () => {
    const real = await createOpportunity().expect(201);
    const demo = await createOpportunity().expect(201);
    await app
      .get(PrismaService)
      .investmentOpportunity.update({ where: { id: demo.body.data.id }, data: { isDemo: true } });
    for (const o of [real, demo]) await publish(o.body.data.id);
    const slugs = (await http().get('/api/v1/sitemap/investments').expect(200)).body.data.map(
      (e: { slug: string }) => e.slug,
    );
    expect(slugs).toContain(real.body.data.slug);
    expect(slugs).not.toContain(demo.body.data.slug);
  });
});
