import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './helpers';

describe('Site search (e2e)', () => {
  let app: INestApplication;
  let editor: { token: string };
  /** A token unique to this run so results from other suites never interfere. */
  const word = `واژه${randomUUID().slice(0, 6)}`;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const slug = (p: string) => `${p}-${randomUUID().slice(0, 8)}`;

  async function publish(path: string, body: Record<string, unknown>) {
    const created = await http().post(path).set(auth(editor.token)).send(body).expect(201);
    const id = created.body.data.id as string;
    await http().post(`${path}/${id}/publish`).set(auth(editor.token)).expect(200);
    return created.body.data.slug as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    editor = await registerUser(app, ['editor']);
    await publish('/api/v1/cms/entries', {
      kind: 'ARTICLE',
      slug: slug('article'),
      title: `${word} امکان‌سنجی طرح‌ها`,
      excerpt: 'مروری بر مراحل مطالعه',
      body: 'متن',
    });
    await publish('/api/v1/catalog/courses', {
      slug: slug('course'),
      title: `دوره ${word}`,
      summary: 'آشنایی با امکان سنجی طرح‌های صنعتی',
      description: 'متن',
      level: 'BEGINNER',
      deliveryMode: 'ONLINE',
    });
    await publish('/api/v1/catalog/investments', {
      slug: slug('opp'),
      title: 'واحد فرآوری',
      summary: `طرح ${word} در استان یزد`,
      description: 'متن',
      sector: 'MINING',
      stage: 'IDEA',
    });
    // A draft must never be found
    await http()
      .post('/api/v1/catalog/research')
      .set(auth(editor.token))
      .send({
        slug: slug('draft'),
        title: `پیش‌نویس ${word}`,
        summary: 'متن پیش‌نویس پژوهش',
        body: 'x',
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns typed, published results only, ranked by relevance', async () => {
    const res = await http()
      .get(`/api/v1/search?q=${encodeURIComponent(word)}`)
      .expect(200);
    const types = res.body.data.map((h: { type: string }) => h.type);
    expect(types.sort()).toEqual(['article', 'course', 'investment']);
    expect(res.body.meta.total).toBe(3);
    // Title prefix beats a summary-only match
    expect(res.body.data[0].type).toBe('article');
    expect(res.body.data.at(-1).type).toBe('investment');
    expect(res.body.data[0]).toMatchObject({ slug: expect.any(String), isDemo: false });
    expect(res.body.data[0].body).toBeUndefined();
  });

  it('matches space and ZWNJ spellings and filters by type', async () => {
    const spaced = await http()
      .get(`/api/v1/search?q=${encodeURIComponent(`${word} امکان سنجی`)}`)
      .expect(200);
    expect(spaced.body.data.map((h: { type: string }) => h.type)).toContain('article');

    const onlyCourses = await http()
      .get(`/api/v1/search?q=${encodeURIComponent(word)}&types=course`)
      .expect(200);
    expect(onlyCourses.body.data.map((h: { type: string }) => h.type)).toEqual(['course']);
  });

  it('validates the query', async () => {
    await http().get('/api/v1/search?q=a').expect(400);
    await http()
      .get(`/api/v1/search?q=${encodeURIComponent(word)}&types=users`)
      .expect(400);
    await http().get('/api/v1/search').expect(400);
  });
});
