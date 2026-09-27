import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SITE_CACHE,
  type SiteCache,
  type SiteCacheTag,
} from '../src/modules/publishing/ports/site-cache';
import { createTestApp, registerUser } from './helpers';

const slug = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

class RecordingSiteCache implements SiteCache {
  readonly driver = 'recording';
  calls: SiteCacheTag[][] = [];
  invalidate(tags: readonly SiteCacheTag[]): Promise<void> {
    this.calls.push([...tags]);
    return Promise.resolve();
  }
}

/**
 * ST-27.04: an editorial change used to reach the public site only after the ISR window. These
 * tests pin down which mutations ask the site to drop its cache — and, just as importantly, that
 * a draft edit does not, since a draft is not on the site at all.
 */
describe('Site cache invalidation (e2e)', () => {
  let app: INestApplication;
  let cache: RecordingSiteCache;
  let editor: { id: string; token: string };
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const tags = () => cache.calls.flat();

  beforeAll(async () => {
    cache = new RecordingSiteCache();
    app = await createTestApp([], [{ token: SITE_CACHE, value: cache }]);
    editor = await registerUser(app, ['editor', 'admin']);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    cache.calls = [];
  });

  it('leaves the site alone while an entry is only a draft', async () => {
    const created = await http()
      .post('/api/v1/cms/entries')
      .set(auth(editor.token))
      .send({
        kind: 'ARTICLE',
        title: 'پیش‌نویس بدون انتشار',
        body: '## بخش\nمتن',
        slug: slug('draft'),
      })
      .expect(201);
    await http()
      .patch(`/api/v1/cms/entries/${created.body.data.id as string}`)
      .set(auth(editor.token))
      .send({ title: 'عنوان تازه پیش‌نویس' })
      .expect(200);
    expect(cache.calls).toEqual([]);
  });

  it('drops the content cache when an entry is published, edited and archived', async () => {
    const id = (
      await http()
        .post('/api/v1/cms/entries')
        .set(auth(editor.token))
        .send({
          kind: 'ARTICLE',
          title: 'مقاله منتشرشده',
          body: '## بخش\nمتن',
          slug: slug('published'),
        })
        .expect(201)
    ).body.data.id as string;

    await http().post(`/api/v1/cms/entries/${id}/publish`).set(auth(editor.token)).expect(200);
    expect(tags()).toEqual(['content']);

    cache.calls = [];
    await http()
      .patch(`/api/v1/cms/entries/${id}`)
      .set(auth(editor.token))
      .send({ title: 'عنوان اصلاح‌شده' })
      .expect(200);
    expect(tags()).toEqual(['content']);

    cache.calls = [];
    await http().post(`/api/v1/cms/entries/${id}/archive`).set(auth(editor.token)).expect(200);
    expect(tags()).toEqual(['content']);
  });

  it('drops the pages cache when an institutional page is published', async () => {
    await http()
      .put(`/api/v1/cms/pages/${slug('about')}?publish=true`)
      .set(auth(editor.token))
      .send({ title: 'صفحه آزمایشی', sections: [] })
      .expect(200);
    expect(tags()).toEqual(['pages']);
  });

  it('drops the courses cache when a course is published', async () => {
    const id = (
      await http()
        .post('/api/v1/catalog/courses')
        .set(auth(editor.token))
        .send({
          slug: slug('course'),
          title: 'دوره آزمایشی انتشار',
          summary: 'خلاصه دوره آزمایشی برای انتشار.',
          description: '## سرفصل\nمتن',
          level: 'BEGINNER',
          deliveryMode: 'ONLINE',
          isFree: true,
        })
        .expect(201)
    ).body.data.id as string;
    expect(cache.calls).toEqual([]);

    await http().post(`/api/v1/catalog/courses/${id}/publish`).set(auth(editor.token)).expect(200);
    expect(tags()).toEqual(['courses']);
  });
});
