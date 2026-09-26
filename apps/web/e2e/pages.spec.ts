import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown) => JSON.stringify({ data, meta: { requestId: 't' } });
const json = (data: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: envelope(data),
});
const notFound = {
  status: 404,
  contentType: 'application/json',
  body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'یافت نشد.', requestId: 't' } }),
};

async function signIn(page: Page, permissions: string[]) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill(
      json({
        id: 'me',
        email: 'editor@example.com',
        mobile: null,
        fullName: 'ویراستار',
        roles: ['user', 'editor'],
        permissions,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    ),
  );
}

test.describe('institutional pages', () => {
  test('the about page renders the reviewed content when no CMS page is published', async ({
    page,
  }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('رشد آفرینان');
    await expect(page.getByRole('heading', { name: 'حوزه‌های اصلی فعالیت' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'مجوزها و عضویت‌ها' })).toBeVisible();
    await expect(page.getByText('+۵۰')).toBeVisible();
  });

  test('an editor starts from the site defaults, reorders sections and publishes', async ({
    page,
  }) => {
    await signIn(page, ['cms:write', 'cms:publish']);
    let saved: { url: string; body: { sections: { type: string; title?: string }[] } } | undefined;
    await page.route('**/api/v1/cms/pages/about*', async (route) => {
      if (route.request().method() === 'PUT') {
        saved = { url: route.request().url(), body: route.request().postDataJSON() };
        await route.fulfill(json({ slug: 'about', status: 'PUBLISHED' }));
      } else {
        await route.fulfill(notFound);
      }
    });
    await page.goto('/dashboard/pages/about');
    await expect(page.getByText(/فرم با متن فعلی سایت پر شده/)).toBeVisible();
    await expect(page.getByLabel('عنوان صفحه')).toHaveValue('درباره ما');

    // Move section 3 (activity areas) above section 2 (stats)
    await page.getByRole('button', { name: 'انتقال بخش ۳ به بالا' }).click();
    await page.getByRole('button', { name: 'ذخیره و انتشار' }).click();
    await expect(page.getByText('صفحه منتشر شد.')).toBeVisible();
    expect(saved?.url).toContain('/cms/pages/about?publish=true');
    expect(saved?.body.sections.map((s) => s.type).slice(0, 3)).toEqual(['intro', 'list', 'stats']);
  });

  test('invalid sections are reported before saving; drafts need no publish right', async ({
    page,
  }) => {
    await signIn(page, ['cms:write']);
    let puts = 0;
    await page.route('**/api/v1/cms/pages/about*', async (route) => {
      if (route.request().method() === 'PUT') {
        puts += 1;
        await route.fulfill(json({ slug: 'about', status: 'DRAFT' }));
      } else {
        await route.fulfill(notFound);
      }
    });
    await page.goto('/dashboard/pages/about');
    await expect(page.getByRole('button', { name: 'ذخیره و انتشار' })).toHaveCount(0);
    await page.getByLabel('نوع بخش جدید').selectOption('list');
    await page.getByRole('button', { name: 'افزودن بخش' }).click();
    await page.getByRole('button', { name: 'ذخیره پیش‌نویس' }).click();
    await expect(page.getByText('لطفاً موارد مشخص‌شده را اصلاح کنید.')).toBeVisible();
    await expect(page.getByText(/^بخش ۷:/).first()).toBeVisible();
    expect(puts).toBe(0);

    await page.getByRole('button', { name: 'حذف بخش ۷' }).click();
    await page.getByRole('button', { name: 'ذخیره پیش‌نویس' }).click();
    await expect(page.getByText('پیش‌نویس ذخیره شد.')).toBeVisible();
    expect(puts).toBe(1);
  });

  test('users without cms:write cannot edit pages', async ({ page }) => {
    await signIn(page, ['requests:read-all']);
    await page.goto('/dashboard/pages/about');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'صفحات سازمانی' })).toHaveCount(0);
  });
});
