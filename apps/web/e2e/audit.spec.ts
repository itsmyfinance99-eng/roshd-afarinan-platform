import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 30, total } });

async function signIn(page: Page, permissions: string[], roles: string[]) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        id: 'me',
        email: 'admin@example.com',
        mobile: null,
        fullName: 'مدیر',
        roles,
        permissions,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    }),
  );
}

const events = [
  {
    id: 'e1',
    action: 'users.roles_changed',
    actor: { id: 'me', fullName: 'مدیر', email: 'admin@example.com' },
    entityType: 'user',
    entityId: 'u2',
    metadata: { before: ['user'], after: ['support', 'user'] },
    ip: '10.0.0.1',
    requestId: 'r1',
    createdAt: '2026-09-11T20:45:00Z',
  },
  {
    id: 'e2',
    action: 'custom.unknown_event',
    actor: null,
    entityType: null,
    entityId: null,
    metadata: { token: '[redacted]' },
    ip: null,
    requestId: null,
    createdAt: '2026-09-10T08:00:00Z',
  },
];

test.describe('audit log viewer', () => {
  test('admins see labelled events and filters reach the API', async ({ page }) => {
    await signIn(page, ['audit:read', 'users:read'], ['user', 'admin']);
    const queries: Record<string, string>[] = [];
    await page.route('**/api/v1/audit-logs?*', (route) => {
      queries.push(Object.fromEntries(new URL(route.request().url()).searchParams));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope(events, 2),
      });
    });
    await page.goto('/dashboard/manage/audit');
    const list = page.getByRole('list', { name: 'رویدادها' });
    await expect(list.getByText('تغییر نقش کاربر')).toBeVisible();
    await expect(list.getByText('۱۴۰۵/۰۶/۲۱', { exact: false })).toBeVisible();
    await expect(list.getByText('custom.unknown_event')).toBeVisible();
    await expect(list.getByText('سیستم یا مهمان')).toBeVisible();
    await expect(list.getByText('token: [redacted]')).toBeVisible();

    await page.getByLabel('نوع رویداد').selectOption('auth.');
    await page.getByLabel('ایمیل کاربر').fill('user@example.com');
    // Jalali in, ISO Gregorian out to the API (ST-27.05).
    await page.getByLabel('از تاریخ').fill('۱۴۰۵/۰۶/۱۰');
    await page.getByLabel('تا تاریخ').fill('۱۴۰۵/۰۶/۲۹');
    await page.getByLabel('تا تاریخ').blur();
    await page.getByRole('button', { name: 'اعمال فیلترها' }).click();
    await expect
      .poll(() => queries.at(-1))
      .toMatchObject({
        action: 'auth.',
        actor: 'user@example.com',
        from: '2026-09-01',
        to: '2026-09-20',
        page: '1',
      });
  });

  test('a reversed range is blocked on the client', async ({ page }) => {
    await signIn(page, ['audit:read'], ['user', 'admin']);
    await page.route('**/api/v1/audit-logs?*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: envelope([], 0) }),
    );
    await page.goto('/dashboard/manage/audit');
    await expect(page.getByText('رویدادی یافت نشد')).toBeVisible();
    await page.getByLabel('از تاریخ').fill('۱۴۰۵/۰۶/۲۹');
    await page.getByLabel('تا تاریخ').fill('۱۴۰۵/۰۶/۱۰');
    await page.getByLabel('تا تاریخ').blur();
    await expect(page.getByRole('button', { name: 'اعمال فیلترها' })).toBeDisabled();
  });

  // ST-27.05: the picker replaced the browser's Gregorian date input.
  test('the Jalali calendar sets the filter and refuses an impossible date', async ({ page }) => {
    const queries: Record<string, string>[] = [];
    await signIn(page, ['audit:read'], ['user', 'admin']);
    await page.route('**/api/v1/audit-logs?*', (route) => {
      queries.push(Object.fromEntries(new URL(route.request().url()).searchParams));
      return route.fulfill({ status: 200, contentType: 'application/json', body: envelope([], 0) });
    });
    await page.goto('/dashboard/manage/audit');

    const from = page.getByLabel('از تاریخ');
    await from.fill('۱۴۰۴/۱۲/۳۰');
    await from.blur();
    await expect(page.getByText('تاریخ معتبر نیست.')).toBeVisible();

    // Pick 1 Mehr 1405 from the calendar instead of typing it.
    await page.getByRole('button', { name: 'انتخاب از تقویم' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'تقویم شمسی' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('gridcell', { name: '۱۴۰۵/۰۷/۰۱' }).click();
    await expect(from).toHaveValue('۱۴۰۵/۰۷/۰۱');

    await page.getByRole('button', { name: 'اعمال فیلترها' }).click();
    await expect.poll(() => queries.at(-1)?.from).toBe('2026-09-23');
  });

  test('non-admins get no access and no menu item', async ({ page }) => {
    await signIn(page, ['requests:read-all', 'tickets:read-all'], ['user', 'support']);
    await page.goto('/dashboard/manage/audit');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'گزارش رویدادها' })).toHaveCount(0);
  });
});
