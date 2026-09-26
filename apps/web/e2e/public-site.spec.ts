import { expect, test } from '@playwright/test';

const ROUTES = [
  '/',
  '/about',
  '/services',
  '/consulting',
  '/consulting/request',
  '/training',
  '/training/feasibility-basics',
  '/training/feasibility-basics/enroll',
  '/feasibility',
  '/feasibility/request',
  '/research',
  '/research/steel-value-chain',
  '/research/request',
  '/investment',
  '/iran-sahamdar',
  '/knowledge',
  '/articles',
  '/contact',
  '/track',
  '/search?q=امکان‌سنجی',
];

test.describe('public routes', () => {
  for (const route of ROUTES) {
    test(`${route} renders RTL with one h1 and no horizontal overflow`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('lang', 'fa-IR');
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('unknown routes return the Persian 404 page', async ({ page }) => {
    const response = await page.goto('/does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'صفحه مورد نظر یافت نشد' })).toBeVisible();
  });

  test('home page prioritises the four journeys', async ({ page }) => {
    await page.goto('/');
    const journeys = page.getByRole('region', { name: 'چهار مسیر اصلی' });
    for (const href of ['/training', '/feasibility', '/research', '/iran-sahamdar']) {
      await expect(journeys.locator(`a[href="${href}"]`)).toBeVisible();
    }
    await expect(journeys.locator('a')).toHaveCount(4);
  });

  test('footer shows the official contact details', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer).toContainText('پارک علم و فناوری اقبال');
    await expect(footer.locator('a[href="tel:+983538345890"]')).toBeVisible();
    await expect(footer.locator('a[href^="mailto:"]')).toBeVisible();
  });
});

test.describe('navigation', () => {
  test('mobile drawer opens, navigates and closes with Escape', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/');
    await page.getByRole('button', { name: 'باز کردن منو' }).click();
    const dialog = page.getByRole('dialog', { name: 'منوی اصلی' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'باز کردن منو' })).toBeFocused();

    await page.getByRole('button', { name: 'باز کردن منو' }).click();
    await dialog.getByRole('link', { name: 'پژوهش' }).click();
    await expect(page).toHaveURL(/\/research$/);
    await expect(dialog).toBeHidden();
  });

  test('desktop nav marks the current section', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only');
    await page.goto('/training');
    await expect(
      page.getByRole('navigation', { name: 'ناوبری اصلی' }).getByRole('link', { name: 'آموزش' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('header search goes to the results page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'جستجو در سایت' }).click();
    await page.getByLabel('عبارت جستجو').fill('معدن');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByText(/نتیجه/).first()).toBeVisible();
  });
});

test.describe('catalog filters', () => {
  test('investment filters show an empty state and can be reset', async ({ page }) => {
    await page.goto('/investment');
    await page.getByRole('radio', { name: 'انرژی' }).check();
    await page.getByLabel('مرحله').selectOption('طرح توجیهی');
    await expect(page.getByText('پروژه‌ای یافت نشد')).toBeVisible();
    await page.getByRole('button', { name: 'حذف فیلترها' }).click();
    await expect(page.locator('article')).toHaveCount(6);
  });
});
