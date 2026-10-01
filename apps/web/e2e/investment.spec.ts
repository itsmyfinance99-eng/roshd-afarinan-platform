import { expect, test } from '@playwright/test';

// Opportunity fixtures come from e2e/mock-api.mjs (server-rendered pages).

test.describe('investment opportunities', () => {
  test('lists opportunities with a no-offer notice and demo labels', async ({ page }) => {
    await page.goto('/investment');
    await expect(page.getByText(/معرفی طرح به معنای پیشنهاد سرمایه‌گذاری/)).toBeVisible();
    const cards = page.locator('article');
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: 'واحد فرآوری سنگ آهن' })).toContainText('مطالعه بازار');
    await expect(cards.filter({ hasText: 'نیروگاه خورشیدی' })).toContainText('نمونه نمایشی');
    await expect(page.getByText('۲ طرح')).toBeVisible();
  });

  test('sector chips and the stage select narrow results, then reset', async ({ page }) => {
    await page.goto('/investment');
    const sectors = page.getByRole('navigation', { name: 'حوزه' });
    await sectors.getByRole('link', { name: 'انرژی' }).click();
    await expect(page).toHaveURL(/sector=ENERGY/);
    await expect(page.locator('article')).toHaveCount(1);
    await expect(sectors.getByRole('link', { name: 'انرژی' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByLabel('مرحله').selectOption('FEASIBILITY_STUDY');
    await expect(page).toHaveURL(/stage=FEASIBILITY_STUDY/);
    await expect(page).toHaveURL(/sector=ENERGY/);
    await expect(page.getByText('طرحی با این فیلترها یافت نشد')).toBeVisible();
    await page.getByRole('link', { name: 'حذف فیلترها', exact: true }).click();
    await expect(page).toHaveURL(/\/investment$/);
    await expect(page.locator('article')).toHaveCount(2);
  });

  test('the search box is a GET form that also works without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/investment');
    await page.getByLabel('جستجو در پروژه‌ها').fill('سنگ');
    await page.getByRole('button', { name: 'اعمال فیلترها' }).click();
    await expect(page).toHaveURL(/q=/);
    await context.close();
  });

  test('an opportunity page shows facts and records interest as a service request', async ({
    page,
  }) => {
    await page.goto('/investment/iron-ore-processing');
    const facts = page.getByRole('complementary', { name: 'مشخصات طرح' });
    await expect(facts).toContainText('معدنی');
    await expect(facts).toContainText('کرمان');
    await expect(facts).toContainText('۱۲۰٬۰۰۰٬۰۰۰٬۰۰۰ ریال');
    await expect(facts).toContainText('هیچ تراکنشی');

    let posted: Record<string, unknown> | undefined;
    await page.route('**/api/v1/service-requests', async (route) => {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { trackingCode: 'RA-7K3M9QPD' }, meta: { requestId: 't' } }),
      });
    });
    await page.getByRole('link', { name: 'ابراز علاقه و دریافت اطلاعات' }).click();
    await expect(page).toHaveURL(/\/investment\/iron-ore-processing\/interest$/);
    await page.getByLabel(/نام و نام خانوادگی/).fill('رضا کریمی');
    await page.getByLabel(/شماره موبایل/).fill('09121234567');
    await page.getByLabel(/نوع علاقه‌مندی/).fill('مایل به مشارکت در مطالعات امکان‌سنجی هستم.');
    await page.getByRole('button', { name: 'ثبت ابراز علاقه' }).click();
    await expect(page.getByText('RA-۷K۳M۹QPD')).toBeVisible();
    expect(posted).toMatchObject({ type: 'INVESTMENT', reference: 'iron-ore-processing' });
  });

  test('demo opportunities are not indexed and unknown ones are a real 404', async ({ page }) => {
    await page.goto('/investment/small-solar-plant');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const missing = await page.goto('/investment/no-such-project');
    expect(missing?.status()).toBe(404);
  });
});
