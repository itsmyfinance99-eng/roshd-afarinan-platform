import { expect, test } from '@playwright/test';
import { E2E_INTERNAL_TOKEN } from '../playwright.config';

const MOCK_API = `http://127.0.0.1:${Number(process.env.MOCK_API_PORT ?? 4100)}`;
const ORIGINAL = 'مبانی امکان‌سنجی طرح‌های صنعتی';
const RENAMED = 'مبانی امکان‌سنجی — ویرایش تازه';

/**
 * ST-27.04: published content used to appear only after the five-minute ISR window, which
 * editors read as "it did not save". These tests prove the cache exists, that the endpoint is
 * closed to anyone without the internal token, and that a valid call makes the change visible.
 */
test.describe('on-demand revalidation', () => {
  test.describe.configure({ mode: 'serial' });

  test('refuses a caller without the internal token, and an unknown tag', async ({ request }) => {
    const noToken = await request.post('/internal/revalidate', { data: { tags: ['courses'] } });
    expect(noToken.status()).toBe(403);

    const wrongToken = await request.post('/internal/revalidate', {
      headers: { 'x-internal-token': 'not-the-token' },
      data: { tags: ['courses'] },
    });
    expect(wrongToken.status()).toBe(403);

    const headers = { 'x-internal-token': E2E_INTERNAL_TOKEN };
    expect((await request.post('/internal/revalidate', { headers, data: {} })).status()).toBe(400);
    expect(
      (
        await request.post('/internal/revalidate', { headers, data: { tags: ['secrets'] } })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post('/internal/revalidate', {
          headers,
          data: { paths: ['../../etc/passwd'] },
        })
      ).status(),
    ).toBe(400);
    // A GET is not a revalidation trigger.
    expect((await request.get('/internal/revalidate')).status()).toBe(405);
  });

  test('a published change shows up only after the tag is revalidated', async ({
    page,
    request,
  }) => {
    await request.get(`${MOCK_API}/_fixture/course-title?value=${encodeURIComponent(ORIGINAL)}`);
    await page.goto('/training');
    await expect(page.getByRole('heading', { level: 3, name: ORIGINAL })).toBeVisible();

    // The "editor" changes the published title.
    await request.get(`${MOCK_API}/_fixture/course-title?value=${encodeURIComponent(RENAMED)}`);
    await page.reload();
    await expect(page.getByRole('heading', { level: 3, name: ORIGINAL })).toBeVisible();

    const revalidated = await request.post('/internal/revalidate', {
      headers: { 'x-internal-token': E2E_INTERNAL_TOKEN },
      data: { tags: ['courses'] },
    });
    expect(revalidated.ok()).toBe(true);

    await page.reload();
    await expect(page.getByRole('heading', { level: 3, name: RENAMED })).toBeVisible();

    // Leave the fixture as the other specs expect it.
    await request.get(`${MOCK_API}/_fixture/course-title?value=${encodeURIComponent(ORIGINAL)}`);
    await request.post('/internal/revalidate', {
      headers: { 'x-internal-token': E2E_INTERNAL_TOKEN },
      data: { tags: ['courses'] },
    });
  });
});
