import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

const slug = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

describe('CMS (e2e)', () => {
  let app: INestApplication;
  let editor: { id: string; token: string };
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createEntry = (body: Record<string, unknown>) =>
    http()
      .post('/api/v1/cms/entries')
      .set(auth(editor.token))
      .send({ kind: 'ARTICLE', title: 'عنوان مقاله آزمایشی', body: '## بخش اول\nمتن', ...body });

  beforeAll(async () => {
    app = await createTestApp();
    editor = await registerUser(app, ['editor']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps drafts private, publishes, and hides archived entries', async () => {
    const s = slug('lifecycle');
    const created = await createEntry({ slug: s, tags: ['امکان‌سنجی'] }).expect(201);
    expect(created.body.data).toMatchObject({ status: 'DRAFT', publishedAt: null });
    const id = created.body.data.id as string;

    await http().get(`/api/v1/articles/${s}`).expect(404);

    const published = await http()
      .post(`/api/v1/cms/entries/${id}/publish`)
      .set(auth(editor.token))
      .expect(200);
    expect(published.body.data.status).toBe('PUBLISHED');
    const firstPublishedAt = published.body.data.publishedAt as string;

    const detail = await http().get(`/api/v1/articles/${s}`).expect(200);
    expect(detail.body.data).toMatchObject({ slug: s, body: '## بخش اول\nمتن' });
    expect(detail.body.data.status).toBeUndefined();
    const list = await http().get('/api/v1/articles?pageSize=100').expect(200);
    expect(list.body.data.map((a: { slug: string }) => a.slug)).toContain(s);
    expect(list.body.data[0].body).toBeUndefined();

    // Knowledge endpoints never expose articles
    await http().get(`/api/v1/knowledge/${s}`).expect(404);

    await http().post(`/api/v1/cms/entries/${id}/archive`).set(auth(editor.token)).expect(200);
    await http().get(`/api/v1/articles/${s}`).expect(404);

    // Republishing keeps the original publication date
    const again = await http()
      .post(`/api/v1/cms/entries/${id}/publish`)
      .set(auth(editor.token))
      .expect(200);
    expect(again.body.data.publishedAt).toBe(firstPublishedAt);

    const prisma = app.get(PrismaService);
    expect(
      await prisma.auditLog.count({ where: { entityId: id, action: { startsWith: 'cms.' } } }),
    ).toBe(4);
  });

  it('enforces unique slugs per kind only', async () => {
    const s = slug('dup');
    await createEntry({ slug: s }).expect(201);
    const conflict = await createEntry({ slug: s }).expect(409);
    expect(conflict.body.error.code).toBe('CONFLICT');
    await createEntry({ slug: s, kind: 'KNOWLEDGE' }).expect(201);
  });

  it('updates without wiping omitted fields', async () => {
    const s = slug('patch');
    const created = await createEntry({
      slug: s,
      tags: ['مالی'],
      references: [{ title: 'منبع' }],
    }).expect(201);
    const updated = await http()
      .patch(`/api/v1/cms/entries/${created.body.data.id}`)
      .set(auth(editor.token))
      .send({ title: 'عنوان ویرایش‌شده' })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      title: 'عنوان ویرایش‌شده',
      tags: ['مالی'],
      references: [{ title: 'منبع' }],
    });
  });

  it('rejects unsafe URLs and invalid slugs', async () => {
    await createEntry({ slug: 'Bad Slug' }).expect(400);
    await createEntry({ slug: slug('url'), coverImageUrl: 'javascript:alert(1)' }).expect(400);
  });

  it('denies editorial access to non-editors', async () => {
    const user = await registerUser(app);
    const support = await registerUser(app, ['support']);
    await http().get('/api/v1/cms/entries').expect(401);
    await http().get('/api/v1/cms/entries').set(auth(user.token)).expect(403);
    await http()
      .post('/api/v1/cms/entries')
      .set(auth(support.token))
      .send({ kind: 'ARTICLE', slug: slug('x'), title: 'عنوان', body: 'متن' })
      .expect(403);
  });

  it('filters by category and exposes only indexable content in the sitemap', async () => {
    const category = await http()
      .post('/api/v1/cms/categories')
      .set(auth(editor.token))
      .send({ scope: 'KNOWLEDGE', slug: slug('cat'), name: 'مالی' })
      .expect(201);
    const catSlug = category.body.data.slug as string;

    const indexable = slug('kn');
    const hidden = slug('kn-hidden');
    for (const [s, noIndex] of [
      [indexable, false],
      [hidden, true],
    ] as const) {
      const created = await createEntry({
        kind: 'KNOWLEDGE',
        slug: s,
        categoryId: category.body.data.id,
        noIndex,
      }).expect(201);
      await http()
        .post(`/api/v1/cms/entries/${created.body.data.id}/publish`)
        .set(auth(editor.token))
        .expect(200);
    }

    const filtered = await http().get(`/api/v1/knowledge?category=${catSlug}`).expect(200);
    expect(filtered.body.data.map((e: { slug: string }) => e.slug).sort()).toEqual(
      [indexable, hidden].sort(),
    );
    expect(filtered.body.meta.total).toBe(2);

    const sitemap = await http().get('/api/v1/content/sitemap').expect(200);
    const slugs = sitemap.body.data.map((e: { slug: string }) => e.slug);
    expect(slugs).toContain(indexable);
    expect(slugs).not.toContain(hidden);

    const categories = await http().get('/api/v1/categories?scope=KNOWLEDGE').expect(200);
    expect(categories.body.data.map((c: { slug: string }) => c.slug)).toContain(catSlug);
  });

  it('serves only published pages and requires cms:publish to publish them', async () => {
    const pageSlug = slug('about');
    await http()
      .put(`/api/v1/cms/pages/${pageSlug}`)
      .set(auth(editor.token))
      .send({ title: 'درباره ما', sections: [{ type: 'text', body: 'متن' }] })
      .expect(200);
    await http().get(`/api/v1/pages/${pageSlug}`).expect(404);

    await http()
      .put(`/api/v1/cms/pages/${pageSlug}?publish=true`)
      .set(auth(editor.token))
      .send({ title: 'درباره ما', sections: [{ type: 'text', body: 'متن' }] })
      .expect(200);
    const page = await http().get(`/api/v1/pages/${pageSlug}`).expect(200);
    expect(page.body.data.sections).toEqual([{ type: 'text', body: 'متن' }]);
  });
});
