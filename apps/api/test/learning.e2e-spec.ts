import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

const slug = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

describe('Learning catalog (e2e)', () => {
  let app: INestApplication;
  let editor: { token: string };
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createCourse = (body: Record<string, unknown> = {}) =>
    http()
      .post('/api/v1/catalog/courses')
      .set(auth(editor.token))
      .send({
        slug: slug('course'),
        title: 'مبانی امکان‌سنجی طرح‌ها',
        summary: 'آشنایی با مراحل و خروجی‌های مطالعات امکان‌سنجی',
        description: '## سرفصل‌ها\n- بازار\n- فنی\n- مالی',
        level: 'BEGINNER',
        deliveryMode: 'ONLINE',
        ...body,
      });

  const publish = (id: string) =>
    http().post(`/api/v1/catalog/courses/${id}/publish`).set(auth(editor.token)).expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    editor = await registerUser(app, ['editor']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps drafts private, publishes with a string price and hides archived courses', async () => {
    const instructor = await http()
      .post('/api/v1/catalog/instructors')
      .set(auth(editor.token))
      .send({ name: 'مدرس آزمایشی', title: 'کارشناس امکان‌سنجی' })
      .expect(201);
    const created = await createCourse({
      priceRials: '۲٬۵۰۰٬۰۰۰',
      durationHours: 12,
      instructorId: instructor.body.data.id,
    }).expect(201);
    expect(created.body.data).toMatchObject({
      status: 'DRAFT',
      publishedAt: null,
      priceRials: '2500000',
      isFree: false,
    });
    const { id, slug: s } = created.body.data as { id: string; slug: string };

    await http().get(`/api/v1/courses/${s}`).expect(404);

    await publish(id);
    const detail = await http().get(`/api/v1/courses/${s}`).expect(200);
    expect(detail.body.data).toMatchObject({
      slug: s,
      priceRials: '2500000',
      durationHours: 12,
      instructor: { name: 'مدرس آزمایشی', title: 'کارشناس امکان‌سنجی' },
    });
    expect(detail.body.data.status).toBeUndefined();
    expect(detail.body.data.createdById).toBeUndefined();

    const list = await http().get('/api/v1/courses?pageSize=100').expect(200);
    const card = list.body.data.find((c: { slug: string }) => c.slug === s);
    expect(card).toBeDefined();
    expect(card.description).toBeUndefined();

    await http().post(`/api/v1/catalog/courses/${id}/archive`).set(auth(editor.token)).expect(200);
    await http().get(`/api/v1/courses/${s}`).expect(404);
  });

  it('filters by category, level and free courses', async () => {
    const prisma = app.get(PrismaService);
    const categorySlug = slug('cat');
    const category = await prisma.category.create({
      data: { scope: 'COURSE', slug: categorySlug, name: 'دسته آزمایشی' },
    });
    const free = await createCourse({
      isFree: true,
      level: 'ADVANCED',
      categoryId: category.id,
    }).expect(201);
    const paid = await createCourse({ categoryId: category.id }).expect(201);
    await publish(free.body.data.id);
    await publish(paid.body.data.id);

    const byCategory = await http().get(`/api/v1/courses?category=${categorySlug}`).expect(200);
    expect(byCategory.body.data).toHaveLength(2);
    expect(byCategory.body.data[0].category).toMatchObject({ slug: categorySlug });
    expect(byCategory.body.meta.total).toBe(2);

    const freeOnly = await http()
      .get(`/api/v1/courses?category=${categorySlug}&free=true`)
      .expect(200);
    expect(freeOnly.body.data.map((c: { id: string }) => c.id)).toEqual([free.body.data.id]);

    const advanced = await http()
      .get(`/api/v1/courses?category=${categorySlug}&level=ADVANCED`)
      .expect(200);
    expect(advanced.body.data).toHaveLength(1);

    const unknown = await http().get('/api/v1/courses?category=no-such-category').expect(200);
    expect(unknown.body.data).toHaveLength(0);
  });

  it('enforces the pricing rules and valid references', async () => {
    const freeWithPrice = await createCourse({ isFree: true, priceRials: '1000' }).expect(400);
    expect(freeWithPrice.body.error.details[0].path).toBe('priceRials');
    await createCourse({ priceRials: '12.5' }).expect(400);
    await createCourse({ priceRials: '0' }).expect(400);

    // A partial update that makes a priced course free must also clear the price
    const paid = await createCourse({ priceRials: '5000000' }).expect(201);
    const id = paid.body.data.id as string;
    const conflict = await http()
      .patch(`/api/v1/catalog/courses/${id}`)
      .set(auth(editor.token))
      .send({ isFree: true })
      .expect(400);
    expect(conflict.body.error.details[0].path).toBe('priceRials');
    const madeFree = await http()
      .patch(`/api/v1/catalog/courses/${id}`)
      .set(auth(editor.token))
      .send({ isFree: true, priceRials: null })
      .expect(200);
    expect(madeFree.body.data).toMatchObject({ isFree: true, priceRials: null });

    // Only COURSE categories and existing instructors are accepted
    const articleCategory = await app
      .get(PrismaService)
      .category.create({ data: { scope: 'ARTICLE', slug: slug('art'), name: 'دسته مقاله' } });
    const wrongScope = await createCourse({ categoryId: articleCategory.id }).expect(400);
    expect(wrongScope.body.error.details[0].path).toBe('categoryId');
    const noInstructor = await createCourse({ instructorId: randomUUID() }).expect(400);
    expect(noInstructor.body.error.details[0].path).toBe('instructorId');

    const s = slug('dup');
    await createCourse({ slug: s }).expect(201);
    await createCourse({ slug: s }).expect(409);
  });

  it('protects catalog management', async () => {
    const user = await registerUser(app);
    await http().get('/api/v1/catalog/courses').expect(401);
    await http().get('/api/v1/catalog/courses').set(auth(user.token)).expect(403);
    await http()
      .post('/api/v1/catalog/instructors')
      .set(auth(user.token))
      .send({ name: 'نفوذی' })
      .expect(403);
    await http().get('/api/v1/catalog/courses/not-a-uuid').set(auth(editor.token)).expect(400);
    await http().get(`/api/v1/catalog/courses/${randomUUID()}`).set(auth(editor.token)).expect(404);
  });

  it('lists only indexable, real courses in the sitemap', async () => {
    const real = await createCourse().expect(201);
    const hidden = await createCourse({ noIndex: true }).expect(201);
    const demo = await createCourse().expect(201);
    await app
      .get(PrismaService)
      .course.update({ where: { id: demo.body.data.id }, data: { isDemo: true } });
    for (const c of [real, hidden, demo]) await publish(c.body.data.id);

    const sitemap = await http().get('/api/v1/sitemap/courses').expect(200);
    const slugs = sitemap.body.data.map((e: { slug: string }) => e.slug);
    expect(slugs).toContain(real.body.data.slug);
    expect(slugs).not.toContain(hidden.body.data.slug);
    expect(slugs).not.toContain(demo.body.data.slug);
  });
});
