import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown) => JSON.stringify({ data, meta: { requestId: 't' } });

async function signIn(page: Page, permissions: string[], roles: string[]) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        id: 'me',
        email: 'staff@example.com',
        mobile: null,
        fullName: 'کارشناس',
        roles,
        permissions,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    }),
  );
  await page.route('**/api/v1/service-requests/mine?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: envelope([]) }),
  );
}

test.describe('staff dashboard stats', () => {
  test('support staff see live request and ticket counts', async ({ page }) => {
    await signIn(
      page,
      ['requests:read-all', 'requests:manage', 'tickets:read-all'],
      ['user', 'support'],
    );
    await page.route('**/api/v1/dashboard/stats', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({
          requests: {
            byStatus: { NEW: 12, IN_REVIEW: 3, RESPONDED: 2, CLOSED: 40 },
            total: 57,
            open: 17,
            lastSevenDays: 9,
          },
          tickets: { byStatus: { OPEN: 4, PENDING: 1, ANSWERED: 6, CLOSED: 20 }, open: 5 },
          generatedAt: '2026-09-26T08:00:00Z',
        }),
      }),
    );
    await page.goto('/dashboard');
    const stats = page.getByRole('region', { name: 'آمار سامانه' });
    await expect(stats.getByRole('link', { name: /درخواست‌های باز\s*۱۷/ })).toHaveAttribute(
      'href',
      '/dashboard/manage/requests',
    );
    await expect(stats.getByText('درخواست‌های ۷ روز اخیر')).toBeVisible();
    await expect(stats.getByRole('link', { name: /تیکت‌های باز\s*۵/ })).toBeVisible();
    await expect(stats.getByText('کاربران فعال')).toHaveCount(0);
    await expect(stats.getByLabel('درخواست‌ها بر اساس وضعیت')).toContainText('۱۲');
  });

  test('a failed load shows an error with retry', async ({ page }) => {
    await signIn(page, ['users:read'], ['user', 'admin']);
    let calls = 0;
    await page.route('**/api/v1/dashboard/stats', (route) => {
      calls += 1;
      return calls === 1
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور.', requestId: 't' },
            }),
          })
        : route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: envelope({
              users: { active: 42, suspended: 0 },
              generatedAt: '2026-09-26T08:00:00Z',
            }),
          });
    });
    await page.goto('/dashboard');
    await expect(page.getByText('خطای داخلی سرور.')).toBeVisible();
    await page.getByRole('button', { name: 'تلاش دوباره' }).click();
    await expect(page.getByRole('link', { name: /کاربران فعال\s*۴۲/ })).toBeVisible();
  });

  test('regular users get no stats section and no stats request', async ({ page }) => {
    await signIn(page, [], ['user']);
    let requested = false;
    await page.route('**/api/v1/dashboard/stats', (route) => {
      requested = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: envelope({}) });
    });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /خوش آمدید/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'آمار سامانه' })).toHaveCount(0);
    expect(requested).toBe(false);
  });
});
