import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const json = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ data, meta: { requestId: 't' } }),
});

async function signIn(page: Page, roles: string[], permissions: string[]) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill(
      json({
        id: 'me',
        email: 'user@example.com',
        mobile: null,
        fullName: 'کاربر',
        roles,
        permissions,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    ),
  );
  await page.route('**/api/v1/notifications/**', (route) => route.fulfill(json({ unread: 0 })));
}

test.describe('guide of the dashboard', () => {
  test('a member reads about the parts of their own menu only', async ({ page }) => {
    await signIn(page, ['user'], []);
    await page.goto('/dashboard/help');
    await expect(page.getByRole('heading', { level: 1, name: 'راهنمای پنل' })).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: 'درخواست‌های من', exact: true })).toBeVisible();
    await expect(
      main.getByRole('link', { name: 'پروژه‌های امکان‌سنجی', exact: true }),
    ).toBeVisible();
    await expect(main.getByRole('link', { name: 'مدیریت کاربران', exact: true })).toHaveCount(0);
    await expect(main.getByText('عضو سایت هستید', { exact: false })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'منوی داشبورد' }).getByRole('link', { name: 'راهنما' }),
    ).toHaveAttribute('aria-current', 'page');
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });

  test('staff read about the parts their permissions open', async ({ page }) => {
    await signIn(page, ['user', 'support'], ['requests:read-all', 'tickets:read-all']);
    await page.goto('/dashboard/help');
    const main = page.getByRole('main');
    await expect(main.getByText('پشتیبان هستید', { exact: false })).toBeVisible();
    await expect(main.getByRole('link', { name: 'مدیریت تیکت‌ها', exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'مدیریت درخواست‌ها', exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'گزارش رویدادها', exact: true })).toHaveCount(0);
  });
});
