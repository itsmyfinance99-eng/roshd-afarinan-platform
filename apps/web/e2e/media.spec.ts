import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 12, total } });
const json = (data: unknown, total = 1, status = 200) => ({
  status,
  contentType: 'application/json',
  body: envelope(data, total),
});

// 1×1 transparent PNG, so previews render without a backend.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const media = (id: string, originalName: string) => ({
  id,
  url: `/api/v1/media/${id}`,
  originalName,
  mimeType: 'image/png',
  size: 2048,
  createdAt: '2026-09-26T08:00:00Z',
});

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
  await page.route('**/api/v1/categories**', (route) => route.fulfill(json([], 0)));
  await page.route('**/api/v1/media/m*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );
}

const coverField = (page: Page) => page.getByLabel('تصویر شاخص (اختیاری)', { exact: true });

test.describe('media library', () => {
  test('an editor uploads a cover image and it is saved as a site path', async ({ page }) => {
    await signIn(page, ['catalog:manage']);
    let uploaded = false;
    await page.route('**/api/v1/media', async (route) => {
      uploaded = route.request().method() === 'POST';
      await route.fulfill(json(media('m1', 'cover.png'), 1, 201));
    });
    let posted: Record<string, unknown> | undefined;
    await page.route('**/api/v1/catalog/research', async (route) => {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill(json({ id: 'r9', ...posted, status: 'DRAFT' }, 1, 201));
    });
    await page.route('**/api/v1/catalog/research/r9', (route) =>
      route.fulfill(json({ id: 'r9', ...posted, status: 'DRAFT', isDemo: false })),
    );

    await page.goto('/dashboard/catalog/research/new');
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG });
    await expect(coverField(page)).toHaveValue('/api/v1/media/m1');
    await expect(page.getByAltText('پیش‌نمایش تصویر انتخاب‌شده')).toHaveAttribute(
      'src',
      '/api/v1/media/m1',
    );
    expect(uploaded).toBe(true);

    await page.getByLabel(/^عنوان(?! سئو)/).fill('زنجیره ارزش فولاد');
    await page.getByLabel(/نامک/).fill('steel-value-chain');
    await page.getByLabel(/^خلاصه/).fill('بررسی حلقه‌های زنجیره ارزش فولاد');
    await page.getByLabel(/Markdown/).fill('## یافته‌ها');
    await page.getByRole('button', { name: 'ایجاد پیش‌نویس' }).click();
    await expect(page).toHaveURL(/\/dashboard\/catalog\/research\/r9$/);
    expect(posted).toMatchObject({ coverImageUrl: '/api/v1/media/m1' });
  });

  test('picking from the library fills the field and removing clears it', async ({ page }) => {
    await signIn(page, ['cms:write']);
    await page.route('**/api/v1/media?*', (route) =>
      route.fulfill(json([media('m1', 'cover.png'), media('m2', 'team.png')], 2)),
    );
    await page.goto('/dashboard/content/new');
    await page.getByRole('button', { name: 'انتخاب از کتابخانه' }).click();
    await page.getByRole('button', { name: 'انتخاب team.png' }).click();
    await expect(coverField(page)).toHaveValue('/api/v1/media/m2');
    await expect(page.getByRole('list', { name: 'کتابخانه تصاویر' })).toHaveCount(0);

    await page.getByRole('button', { name: 'حذف تصویر' }).click();
    await expect(coverField(page)).toHaveValue('');
    await expect(page.getByAltText('پیش‌نمایش تصویر انتخاب‌شده')).toHaveCount(0);
  });

  test('the library shows empty and error states', async ({ page }) => {
    await signIn(page, ['cms:write']);
    let fail = true;
    await page.route('**/api/v1/media?*', (route) =>
      fail
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'خطای سرور', details: [] },
              meta: { requestId: 't' },
            }),
          })
        : route.fulfill(json([], 0)),
    );
    await page.goto('/dashboard/content/new');
    await page.getByRole('button', { name: 'انتخاب از کتابخانه' }).click();
    const retry = page.getByRole('button', { name: 'تلاش دوباره' });
    await expect(retry).toBeVisible();
    fail = false;
    await retry.click();
    await expect(page.getByText('کتابخانه تصاویر خالی است')).toBeVisible();
  });

  test('SVG and oversized files are refused before uploading', async ({ page }) => {
    await signIn(page, ['cms:write']);
    let calls = 0;
    await page.route('**/api/v1/media', async (route) => {
      calls += 1;
      await route.fulfill(json(media('m1', 'x.png'), 1, 201));
    });
    await page.goto('/dashboard/content/new');
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });
    await expect(page.getByText('فقط تصویر PNG، JPEG یا WebP پذیرفته می‌شود.')).toBeVisible();
    await input.setInputFiles({
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
    });
    await expect(page.getByText(/حجم تصویر بیش از/)).toBeVisible();
    expect(calls).toBe(0);
  });
});
