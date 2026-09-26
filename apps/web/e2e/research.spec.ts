import { expect, test } from '@playwright/test';

// Research fixtures come from e2e/mock-api.mjs (server-rendered pages).

test.describe('research portfolio', () => {
  test('lists published research with years, demo labels and category links', async ({ page }) => {
    await page.goto('/research');
    const cards = page.locator('article');
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: 'زنجیره ارزش فولاد' })).toContainText('سال ۱۴۰۳');
    await expect(cards.filter({ hasText: 'الگوهای تأمین مالی' })).toContainText('نمونه نمایشی');
    await expect(page.getByText(/برچسب‌خورده «نمونه نمایشی»/)).toBeVisible();

    await page
      .getByRole('navigation', { name: 'دسته‌بندی' })
      .getByRole('link', { name: 'مالی' })
      .click();
    await expect(page).toHaveURL(/\/research\?category=financial$/);
    await expect(page.locator('article')).toHaveCount(1);
  });

  test('a research page renders the report with Report JSON-LD and an order CTA', async ({
    page,
  }) => {
    await page.goto('/research');
    await page.getByRole('link', { name: 'بررسی زنجیره ارزش فولاد استان', exact: true }).click();
    await expect(page).toHaveURL(/\/research\/steel-value-chain$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'بررسی زنجیره ارزش فولاد استان',
    );
    await expect(page.getByRole('heading', { name: 'یافته‌ها' })).toBeVisible();
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent ?? '{}') as unknown));
    expect(jsonLd).toContainEqual(
      expect.objectContaining({ '@type': 'Report', headline: 'بررسی زنجیره ارزش فولاد استان' }),
    );
    await page.getByRole('link', { name: 'ثبت سفارش پژوهش' }).click();
    await expect(page).toHaveURL(/\/research\/request$/);
  });

  test('demo research is not indexed and unknown research is a real 404', async ({ page }) => {
    await page.goto('/research/mining-finance-models');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const missing = await page.goto('/research/no-such-study');
    expect(missing?.status()).toBe(404);
  });
});
