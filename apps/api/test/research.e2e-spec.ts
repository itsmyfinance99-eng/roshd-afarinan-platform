import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

const slug = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

describe('Research portfolio (e2e)', () => {
  let app: INestApplication;
  let editor: { token: string };
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createProject = (body: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/catalog/research')
      .set(auth(editor.token))
      .send({
        slug: slug('study'),
        title: 'مطالعه زنجیره ارزش فولاد',
        summary: 'بررسی حلقه‌های زنجیره ارزش و گلوگاه‌های آن در استان',
        body: '## یافته‌ها\nمتن گزارش',
        ...body,
      });

  const publish = (id: string) =>
    http().post(`/api/v1/catalog/research/${id}/publish`).set(auth(editor.token)).expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    editor = await registerUser(app, ['editor']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps drafts private, publishes with category and hides archived projects', async () => {
    const categorySlug = slug('field');
    const category = await app
      .get(PrismaService)
      .category.create({ data: { scope: 'RESEARCH', slug: categorySlug, name: 'صنعتی' } });
    const created = await createProject({ categoryId: category.id, year: 1403 }).expect(201);
    expect(created.body.data).toMatchObject({ status: 'DRAFT', publishedAt: null, year: 1403 });
    const { id, slug: s } = created.body.data as { id: string; slug: string };

    await http().get(`/api/v1/research/${s}`).expect(404);
    await publish(id);

    const detail = await http().get(`/api/v1/research/${s}`).expect(200);
    expect(detail.body.data).toMatchObject({
      slug: s,
      body: '## یافته‌ها\nمتن گزارش',
      category: { slug: categorySlug, name: 'صنعتی' },
    });
    expect(detail.body.data.status).toBeUndefined();

    const list = await http().get(`/api/v1/research?category=${categorySlug}`).expect(200);
    expect(list.body.data.map((p: { slug: string }) => p.slug)).toEqual([s]);
    expect(list.body.data[0].body).toBeUndefined();
    const search = await http()
      .get(`/api/v1/research?q=${encodeURIComponent('زنجیره ارزش')}&pageSize=100`)
      .expect(200);
    expect(search.body.data.map((p: { slug: string }) => p.slug)).toContain(s);

    await http().post(`/api/v1/catalog/research/${id}/archive`).set(auth(editor.token)).expect(200);
    await http().get(`/api/v1/research/${s}`).expect(404);
  });

  it('validates year, category scope and unique slugs', async () => {
    const gregorian = await createProject({ year: 2024 }).expect(400);
    expect(gregorian.body.error.details[0].path).toBe('year');

    const courseCategory = await app
      .get(PrismaService)
      .category.create({ data: { scope: 'COURSE', slug: slug('c'), name: 'دسته دوره' } });
    const wrongScope = await createProject({ categoryId: courseCategory.id }).expect(400);
    expect(wrongScope.body.error.details[0].path).toBe('categoryId');

    const s = slug('dup');
    await createProject({ slug: s }).expect(201);
    await createProject({ slug: s }).expect(409);
  });

  it('protects research management', async () => {
    const user = await registerUser(app);
    const support = await registerUser(app, ['support']);
    await http().get('/api/v1/catalog/research').expect(401);
    for (const who of [user, support]) {
      await http().get('/api/v1/catalog/research').set(auth(who.token)).expect(403);
      await http()
        .post('/api/v1/catalog/research')
        .set(auth(who.token))
        .send({ slug: slug('x'), title: 'عنوان', summary: 'خلاصه کافی برای آزمون', body: 'متن' })
        .expect(403);
    }
  });

  it('lists only indexable, real projects in the sitemap', async () => {
    const real = await createProject().expect(201);
    const hidden = await createProject({ noIndex: true }).expect(201);
    const demo = await createProject().expect(201);
    await app
      .get(PrismaService)
      .researchProject.update({ where: { id: demo.body.data.id }, data: { isDemo: true } });
    for (const p of [real, hidden, demo]) await publish(p.body.data.id);

    const slugs = (await http().get('/api/v1/sitemap/research').expect(200)).body.data.map(
      (e: { slug: string }) => e.slug,
    );
    expect(slugs).toContain(real.body.data.slug);
    expect(slugs).not.toContain(hidden.body.data.slug);
    expect(slugs).not.toContain(demo.body.data.slug);
  });
});
