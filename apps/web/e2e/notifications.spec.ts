import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total } });
const json = (data: unknown, total = 1) => ({
  status: 200,
  contentType: 'application/json',
  body: envelope(data, total),
});

async function signIn(page: Page) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill(
      json({
        id: 'me',
        email: 'user@example.com',
        mobile: null,
        fullName: 'کاربر',
        roles: ['user'],
        permissions: [],
        createdAt: '2026-09-01T00:00:00Z',
      }),
    ),
  );
  await page.route('**/api/v1/service-requests/mine?*', (route) => route.fulfill(json([], 0)));
}

const item = (id: string, readAt: string | null, link = '/dashboard/requests/r1') => ({
  id,
  kind: 'service_request.status_changed',
  title: 'وضعیت درخواست RA-7K3M9QPD: در حال بررسی',
  body: null,
  link,
  readAt,
  createdAt: '2026-09-26T08:00:00Z',
});

test.describe('notification center', () => {
  test('the bell shows the unread count and opening a notification marks it read', async ({
    page,
  }) => {
    await signIn(page);
    let unread = 2;
    const read: string[] = [];
    await page.route('**/api/v1/notifications/unread-count', (route) =>
      route.fulfill(json({ unread })),
    );
    await page.route('**/api/v1/notifications/mine?*', (route) =>
      route.fulfill(json([item('n1', null), item('n2', null)], 2)),
    );
    await page.route('**/api/v1/notifications/*/read', async (route) => {
      read.push(route.request().url());
      unread -= 1;
      await route.fulfill(json({ unread }));
    });
    await page.route('**/api/v1/service-requests/r1', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/dashboard');
    const bell = page.getByRole('link', { name: 'اعلان‌ها (۲ خوانده‌نشده)' });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page).toHaveURL(/\/dashboard\/notifications$/);
    await page
      .getByRole('button', { name: /وضعیت درخواست RA-7K3M9QPD/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/dashboard\/requests\/r1$/);
    expect(read).toHaveLength(1);
    await expect(page.getByRole('link', { name: 'اعلان‌ها (۱ خوانده‌نشده)' })).toBeVisible();
  });

  test('mark all as read and the empty unread filter', async ({ page }) => {
    await signIn(page);
    let unread = 1;
    await page.route('**/api/v1/notifications/unread-count', (route) =>
      route.fulfill(json({ unread })),
    );
    await page.route('**/api/v1/notifications/mine?*', (route) => {
      const onlyUnread = new URL(route.request().url()).searchParams.get('unread') === 'true';
      return route.fulfill(onlyUnread && unread === 0 ? json([], 0) : json([item('n1', null)]));
    });
    await page.route('**/api/v1/notifications/read-all', async (route) => {
      unread = 0;
      await route.fulfill(json({ unread }));
    });
    await page.goto('/dashboard/notifications');
    await page.getByRole('button', { name: 'علامت‌گذاری همه به‌عنوان خوانده‌شده' }).click();
    await expect(page.getByRole('link', { name: 'اعلان‌ها', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'خوانده‌نشده', exact: true }).click();
    await expect(page.getByText('اعلان خوانده‌نشده‌ای ندارید')).toBeVisible();
  });

  test('links outside the dashboard are never followed', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/v1/notifications/unread-count', (route) =>
      route.fulfill(json({ unread: 1 })),
    );
    await page.route('**/api/v1/notifications/mine?*', (route) =>
      route.fulfill(json([item('n9', null, 'https://evil.example/phish')])),
    );
    await page.route('**/api/v1/notifications/n9/read', (route) =>
      route.fulfill(json({ unread: 0 })),
    );
    await page.goto('/dashboard/notifications');
    await page.getByRole('button', { name: /وضعیت درخواست/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/notifications$/);
  });
});
