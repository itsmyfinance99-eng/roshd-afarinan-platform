import { expect, test } from '@playwright/test';

// Course fixtures come from e2e/mock-api.mjs (server-rendered pages).

test.describe('training catalog', () => {
  test('lists published courses with Persian prices and demo labels', async ({ page }) => {
    await page.goto('/training');
    const cards = page.locator('article');
    await expect(cards).toHaveCount(2);
    const paid = cards.filter({ hasText: 'مبانی امکان‌سنجی' });
    await expect(paid).toContainText('۲۵٬۰۰۰٬۰۰۰ ریال');
    await expect(paid).toContainText('سطح: مقدماتی');
    await expect(paid).toContainText('مدت: ۱۲ ساعت');
    const free = cards.filter({ hasText: 'اقتصاد برای مدیران' });
    await expect(free).toContainText('رایگان');
    await expect(free).toContainText('نمونه نمایشی');
  });

  test('free and category filters are links that keep each other', async ({ page }) => {
    await page.goto('/training');
    await page.getByRole('link', { name: 'فقط دوره‌های رایگان' }).click();
    await expect(page).toHaveURL(/\/training\?free=true$/);
    await expect(page.locator('article')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'فقط دوره‌های رایگان' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await page
      .getByRole('navigation', { name: 'دسته‌بندی' })
      .getByRole('link', { name: 'امکان‌سنجی' })
      .click();
    await expect(page).toHaveURL(/category=feasibility/);
    await expect(page).toHaveURL(/free=true/);
    await expect(page.getByText('دوره‌ای با این فیلترها یافت نشد')).toBeVisible();
  });

  test('course page shows facts, Course JSON-LD and an enrollment request', async ({ page }) => {
    await page.goto('/training');
    await page.getByRole('link', { name: 'مبانی امکان‌سنجی طرح‌های صنعتی' }).click();
    await expect(page).toHaveURL(/\/training\/feasibility-basics$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'مبانی امکان‌سنجی طرح‌های صنعتی',
    );
    const facts = page.getByRole('complementary', { name: 'مشخصات دوره' });
    await expect(facts).toContainText('۲۵٬۰۰۰٬۰۰۰ ریال');
    await expect(facts).toContainText('آنلاین');
    await expect(facts).toContainText('مدرس آزمایشی');

    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent ?? '{}') as unknown));
    expect(jsonLd).toContainEqual(
      expect.objectContaining({
        '@type': 'Course',
        name: 'مبانی امکان‌سنجی طرح‌های صنعتی',
        offers: expect.objectContaining({ price: '25000000', priceCurrency: 'IRR' }),
        hasCourseInstance: expect.objectContaining({
          courseMode: 'online',
          courseWorkload: 'PT12H',
        }),
      }),
    );

    let posted: Record<string, unknown> | undefined;
    await page.route('**/api/v1/service-requests', async (route) => {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { trackingCode: 'RA-7K3M9QPD' }, meta: { requestId: 't' } }),
      });
    });
    await page.getByRole('link', { name: 'درخواست ثبت‌نام' }).click();
    await expect(page).toHaveURL(/\/training\/feasibility-basics\/enroll$/);
    await page.getByLabel(/نام و نام خانوادگی/).fill('سارا محمدی');
    await page.getByLabel(/شماره موبایل/).fill('09121234567');
    await page.getByLabel(/پیام شما/).fill('آیا دوره گواهی پایان دوره دارد؟');
    await page.getByRole('button', { name: 'ثبت درخواست ثبت‌نام' }).click();
    await expect(page.getByText('RA-۷K۳M۹QPD')).toBeVisible();
    expect(posted).toMatchObject({ type: 'TRAINING', reference: 'feasibility-basics' });
  });

  test('demo courses are not indexed and unknown courses are a real 404', async ({ page }) => {
    await page.goto('/training/economics-for-managers');
    await expect(page.getByRole('complementary', { name: 'مشخصات دوره' })).toContainText('رایگان');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    const missing = await page.goto('/training/no-such-course');
    expect(missing?.status()).toBe(404);
    const malformed = await page.goto('/training/Not_A_Slug');
    expect(malformed?.status()).toBe(404);
  });
});
