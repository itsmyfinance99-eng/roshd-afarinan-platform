import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total } });

const json = (data: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: envelope(data),
});

async function signIn(page: Page, permissions: string[], roles = ['user', 'editor']) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill(
      json({
        id: 'me',
        email: 'editor@example.com',
        mobile: null,
        fullName: 'ویراستار',
        roles,
        permissions,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    ),
  );
}

const EDITOR = ['cms:write', 'cms:publish', 'catalog:manage'];

const researchRecord = (status: string) => ({
  id: 'r9',
  slug: 'steel-value-chain',
  title: 'زنجیره ارزش فولاد',
  summary: 'بررسی حلقه‌های زنجیره ارزش فولاد',
  body: '## یافته‌ها',
  categoryId: null,
  category: null,
  year: 1403,
  coverImageUrl: null,
  metaTitle: null,
  metaDescription: null,
  noIndex: false,
  status,
  isDemo: false,
  publishedAt: null,
  createdAt: '2026-09-20T00:00:00Z',
  updatedAt: '2026-09-20T00:00:00Z',
});

test.describe('catalog management', () => {
  test('an editor creates a course draft with typed values', async ({ page }) => {
    await signIn(page, EDITOR);
    await page.route('**/api/v1/catalog/instructors', (route) =>
      route.fulfill(
        json([
          {
            id: '0199a000-0000-7000-8000-00000000000b',
            name: 'مدرس آزمایشی',
            title: null,
            bio: null,
          },
        ]),
      ),
    );
    await page.route('**/api/v1/categories?scope=COURSE', (route) =>
      route.fulfill(
        json([
          { id: '0199a000-0000-7000-8000-00000000000a', slug: 'feasibility', name: 'امکان‌سنجی' },
        ]),
      ),
    );
    let posted: Record<string, unknown> | undefined;
    await page.route('**/api/v1/catalog/courses', async (route) => {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill(json({ id: 'c9', ...posted, status: 'DRAFT' }, 201));
    });
    await page.route('**/api/v1/catalog/courses/c9', (route) =>
      route.fulfill(
        json({
          id: 'c9',
          slug: 'feasibility-basics',
          title: 'مبانی امکان‌سنجی',
          status: 'DRAFT',
          isDemo: false,
          updatedAt: '2026-09-26T00:00:00Z',
        }),
      ),
    );

    await page.goto('/dashboard/catalog/courses/new');
    await page.getByLabel(/^عنوان(?! سئو)/).fill('مبانی امکان‌سنجی');
    await page.getByLabel(/نامک/).fill('feasibility-basics');
    await page.getByLabel(/^خلاصه/).fill('آشنایی با مراحل امکان‌سنجی طرح‌ها');
    await page.getByLabel(/معرفی و سرفصل‌ها/).fill('## سرفصل‌ها');
    await page.getByLabel(/^دسته/).selectOption('0199a000-0000-7000-8000-00000000000a');
    await page.getByLabel(/^مدرس/).selectOption('0199a000-0000-7000-8000-00000000000b');
    await page.getByLabel(/^سطح/).selectOption('BEGINNER');
    await page.getByLabel(/نحوه برگزاری/).selectOption('HYBRID');
    await page.getByLabel(/مدت/).fill('۱۲');
    await page.getByLabel(/تاریخ شروع/).fill('2026-10-01');
    await page.getByLabel(/هزینه/).fill('۲٬۵۰۰٬۰۰۰');
    await page.getByRole('button', { name: 'ایجاد پیش‌نویس' }).click();

    await expect(page).toHaveURL(/\/dashboard\/catalog\/courses\/c9$/);
    expect(posted).toMatchObject({
      slug: 'feasibility-basics',
      categoryId: '0199a000-0000-7000-8000-00000000000a',
      instructorId: '0199a000-0000-7000-8000-00000000000b',
      level: 'BEGINNER',
      deliveryMode: 'HYBRID',
      durationHours: 12,
      startsAt: '2026-10-01T00:00:00+03:30',
      isFree: false,
      priceRials: '۲٬۵۰۰٬۰۰۰',
      metaTitle: null,
      noIndex: false,
    });
  });

  test('client validation blocks a priced free course before any request', async ({ page }) => {
    await signIn(page, EDITOR);
    await page.route('**/api/v1/catalog/instructors', (route) => route.fulfill(json([])));
    await page.route('**/api/v1/categories?scope=COURSE', (route) => route.fulfill(json([])));
    let calls = 0;
    await page.route('**/api/v1/catalog/courses', async (route) => {
      calls += 1;
      await route.fulfill(json({}, 201));
    });
    await page.goto('/dashboard/catalog/courses/new');
    await page.getByLabel(/^عنوان(?! سئو)/).fill('اقتصاد برای مدیران');
    await page.getByLabel(/نامک/).fill('economics');
    await page.getByLabel(/^خلاصه/).fill('مفاهیم پایه اقتصاد برای مدیران');
    await page.getByLabel(/معرفی و سرفصل‌ها/).fill('متن');
    await page.getByLabel(/^سطح/).selectOption('BEGINNER');
    await page.getByLabel(/نحوه برگزاری/).selectOption('ONLINE');
    await page.getByLabel('دوره رایگان است').check();
    await page.getByLabel(/هزینه/).fill('1000');
    await page.getByRole('button', { name: 'ایجاد پیش‌نویس' }).click();
    await expect(page.getByText('دوره رایگان نمی‌تواند مبلغ داشته باشد.')).toBeVisible();
    expect(calls).toBe(0);
  });

  test('a research draft is published and the new status is shown', async ({ page }) => {
    await signIn(page, EDITOR);
    let status = 'DRAFT';
    await page.route('**/api/v1/categories?scope=RESEARCH', (route) => route.fulfill(json([])));
    await page.route('**/api/v1/catalog/research/r9', (route) =>
      route.fulfill(json(researchRecord(status))),
    );
    await page.route('**/api/v1/catalog/research/r9/publish', async (route) => {
      status = 'PUBLISHED';
      await route.fulfill(json(researchRecord(status)));
    });
    await page.goto('/dashboard/catalog/research/r9');
    await expect(page.getByLabel(/سال انجام/)).toHaveValue('1403');
    await page.getByRole('button', { name: 'انتشار' }).click();
    await expect(page.getByText('منتشر شد.')).toBeVisible();
    await expect(page.getByText('منتشرشده')).toBeVisible();
    await expect(page.getByRole('link', { name: 'مشاهده در سایت' })).toHaveAttribute(
      'href',
      '/research/steel-value-chain',
    );
  });

  test('server errors are mapped back to their fields', async ({ page }) => {
    await signIn(page, EDITOR);
    const record = {
      id: 'o9',
      slug: 'iron-ore',
      title: 'فرآوری سنگ آهن',
      summary: 'طرح فرآوری سنگ آهن در کرمان',
      description: 'متن',
      sector: 'MINING',
      stage: 'IDEA',
      province: null,
      serviceNeeded: null,
      estimatedInvestmentRials: null,
      coverImageUrl: null,
      metaTitle: null,
      metaDescription: null,
      noIndex: false,
      status: 'DRAFT',
      isDemo: false,
      updatedAt: '2026-09-20T00:00:00Z',
    };
    await page.route('**/api/v1/catalog/investments/o9', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'VALIDATION_FAILED',
                message: 'اطلاعات ارسالی معتبر نیست.',
                details: [
                  { path: 'estimatedInvestmentRials', message: 'مبلغ باید بیشتر از صفر باشد.' },
                ],
                requestId: 't',
              },
            }),
          })
        : route.fulfill(json(record)),
    );
    await page.goto('/dashboard/catalog/investments/o9');
    await page.getByLabel(/برآورد سرمایه‌گذاری/).fill('5000');
    await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
    await expect(page.getByText('مبلغ باید بیشتر از صفر باشد.')).toBeVisible();
    await expect(page.getByLabel(/برآورد سرمایه‌گذاری/)).toHaveAttribute('aria-invalid', 'true');
  });

  test('the list switches catalogs; categories can be added only with cms:write', async ({
    page,
  }) => {
    await signIn(page, ['catalog:manage']);
    await page.route('**/api/v1/catalog/courses?*', (route) => route.fulfill(json([], 0)));
    await page.route('**/api/v1/catalog/research?*', (route) => route.fulfill(json([], 0)));
    await page.goto('/dashboard/catalog');
    await expect(page).toHaveURL(/\/dashboard\/catalog\/courses$/);
    await expect(page.getByText('موردی یافت نشد')).toBeVisible();
    await expect(page.getByText('افزودن مدرس')).toBeVisible();
    await expect(page.getByText('افزودن دسته')).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'کاتالوگ‌ها' })
      .getByRole('link', { name: 'پژوهش‌ها' })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/catalog\/research$/);
    await expect(page.getByRole('link', { name: 'مدیریت کاتالوگ' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('users without catalog:manage get no access and no menu item', async ({ page }) => {
    await signIn(page, ['requests:read-all'], ['user', 'support']);
    await page.goto('/dashboard/catalog/courses');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'مدیریت کاتالوگ' })).toHaveCount(0);
    await page.goto('/dashboard/catalog/courses/new');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ایجاد پیش‌نویس' })).toHaveCount(0);
  });
});
