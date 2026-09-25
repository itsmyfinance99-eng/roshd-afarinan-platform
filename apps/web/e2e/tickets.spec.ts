import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown) => JSON.stringify({ data, meta: { requestId: 't', total: 1 } });

async function signIn(page: Page, permissions: string[] = [], roles = ['user']) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        id: 'u1',
        email: 'u@example.com',
        mobile: null,
        fullName: 'کاربر',
        roles,
        permissions,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    }),
  );
}

const ticket = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 't1',
  code: 'TK-7K3M9Q',
  subject: 'پیگیری درخواست',
  category: 'REQUEST',
  priority: 'NORMAL',
  status,
  lastMessageAt: '2026-09-25T10:00:00Z',
  createdAt: '2026-09-25T09:00:00Z',
  messages: [
    {
      id: 'm1',
      fromStaff: false,
      internal: false,
      body: 'وضعیت درخواست من چیست؟',
      createdAt: '2026-09-25T09:00:00Z',
      authorName: null,
    },
    {
      id: 'm2',
      fromStaff: true,
      internal: false,
      body: 'در حال بررسی است.',
      createdAt: '2026-09-25T10:00:00Z',
      authorName: null,
    },
  ],
  attachments: [],
  ...extra,
});

test.describe('tickets', () => {
  test('a user opens a ticket and lands on the conversation', async ({ page }) => {
    await signIn(page);
    let posted: Record<string, unknown> | undefined;
    await page.route('**/api/v1/tickets', async (route) => {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: envelope(ticket('OPEN')),
      });
    });
    await page.route('**/api/v1/tickets/t1', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope(ticket('OPEN')),
      }),
    );

    await page.goto('/dashboard/tickets/new');
    await page.getByLabel(/موضوع/).fill('پیگیری درخواست');
    await page.getByLabel(/دسته/).selectOption('REQUEST');
    await page.getByLabel(/شرح/).fill('وضعیت درخواست من چیست؟');
    await page.getByRole('button', { name: 'ثبت تیکت' }).click();

    await expect(page).toHaveURL(/\/dashboard\/tickets\/t1$/);
    await expect(page.getByText('در حال بررسی است.')).toBeVisible();
    expect(posted).toMatchObject({
      subject: 'پیگیری درخواست',
      category: 'REQUEST',
      priority: 'NORMAL',
    });
  });

  test('closed tickets show a notice instead of the reply form', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/v1/tickets/t1', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope(ticket('CLOSED')),
      }),
    );
    await page.goto('/dashboard/tickets/t1');
    await expect(page.getByText(/این تیکت بسته شده است/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'ارسال' })).toHaveCount(0);
  });

  test('support sends an internal note and sees the requester', async ({ page }) => {
    await signIn(page, ['tickets:read-all', 'tickets:reply'], ['user', 'support']);
    let reply: Record<string, unknown> | undefined;
    await page.route('**/api/v1/tickets/t1/messages', async (route) => {
      reply = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: envelope(ticket('OPEN')),
      });
    });
    await page.route('**/api/v1/tickets/t1', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope(
          ticket('OPEN', {
            requester: { id: 'u9', fullName: 'مریم احمدی', email: 'maryam@example.com' },
          }),
        ),
      }),
    );
    await page.goto('/dashboard/manage/tickets/t1');
    await expect(page.getByText('مریم احمدی')).toBeVisible();
    await page.getByLabel('پاسخ').fill('با واحد مالی هماهنگ شود.');
    await page.getByLabel(/یادداشت داخلی/).check();
    await page.getByRole('button', { name: 'ارسال' }).click();
    await expect(page.getByText('پیام ثبت شد.')).toBeVisible();
    expect(reply).toEqual({ body: 'با واحد مالی هماهنگ شود.', internal: true });
  });
});
