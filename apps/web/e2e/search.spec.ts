import { expect, test } from '@playwright/test';

// Search results come from GET /api/v1/search on the fixture API (e2e/mock-api.mjs).

test.describe('site search', () => {
  test('shows typed results with excerpts, demo labels and links to detail pages', async ({
    page,
  }) => {
    await page.goto(`/search?q=${encodeURIComponent('طرح')}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const results = page.getByRole('list').filter({ hasText: 'فرآوری سنگ آهن' });
    await expect(results.getByRole('link', { name: /واحد فرآوری سنگ آهن/ })).toHaveAttribute(
      'href',
      '/investment/iron-ore-processing',
    );
    await expect(results.getByRole('link', { name: /نیروگاه خورشیدی/ })).toContainText(
      'نمونه نمایشی',
    );
    await expect(page.getByText(/\d* ?نتیجه/).first()).toBeVisible();
  });

  test('type links filter the results and keep the query', async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent('طرح')}`);
    await page
      .getByRole('navigation', { name: 'نوع نتیجه' })
      .getByRole('link', { name: 'پژوهش' })
      .click();
    await expect(page).toHaveURL(/type=research/);
    await expect(
      page.getByRole('navigation', { name: 'نوع نتیجه' }).getByRole('link', { name: 'پژوهش' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('a[href="/research/mining-finance-models"]')).toBeVisible();
    await expect(page.locator('a[href^="/investment/"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/training/"]')).toHaveCount(0);
  });

  test('short queries, empty results and an unavailable API are handled', async ({ page }) => {
    await page.goto('/search?q=a');
    await expect(page.getByText('دست‌کم ۲ نویسه برای جستجو وارد کنید.')).toBeVisible();

    await page.goto(`/search?q=${encodeURIComponent('واژه‌ای ناموجود')}`);
    await expect(page.getByText('نتیجه‌ای یافت نشد')).toBeVisible();

    await page.goto(`/search?q=${encodeURIComponent('خطای سرور')}`);
    await expect(page.getByText(/جستجو در محتوای سایت در حال حاضر ممکن نیست/)).toBeVisible();
  });
});
