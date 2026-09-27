import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown) => JSON.stringify({ data, meta: { requestId: 't' } });
const TOKEN = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v';

const errorBody = (code: string, message: string) =>
  JSON.stringify({ error: { code, message, requestId: 't' } });

async function signIn(page: Page, emailVerifiedAt: string | null) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        id: 'u1',
        email: 'maryam@example.com',
        mobile: null,
        fullName: 'مریم احمدی',
        roles: ['user'],
        permissions: [],
        emailVerifiedAt,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    }),
  );
}

test.describe('email verification', () => {
  test('a link verifies once and the token leaves the address bar', async ({ page }) => {
    let posted: unknown;
    await page.route('**/api/v1/auth/email/verify', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: envelope(null) });
    });
    await page.goto(`/verify-email?token=${TOKEN}`);
    await expect(page.getByText('ایمیل شما تأیید شد.')).toBeVisible();
    expect(posted).toEqual({ token: TOKEN });
    await expect(page).toHaveURL(/\/verify-email$/);
  });

  test('an expired link explains how to get a new one', async ({ page }) => {
    await page.route('**/api/v1/auth/email/verify', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: errorBody('BAD_REQUEST', 'لینک تأیید نامعتبر یا منقضی است.'),
      }),
    );
    await page.goto(`/verify-email?token=${TOKEN}`);
    await expect(page.getByText('لینک تأیید نامعتبر یا منقضی است.')).toBeVisible();
    await expect(page.getByRole('link', { name: /لینک تازه/ })).toHaveAttribute(
      'href',
      '/dashboard/profile',
    );
  });

  test('a link without a token sends nothing', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/v1/auth/email/verify', async (route) => {
      calls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: envelope(null) });
    });
    await page.goto('/verify-email');
    await expect(page.getByText('لینک تأیید کامل نیست.', { exact: false })).toBeVisible();
    expect(calls).toBe(0);
  });

  test('the profile shows the status and resends the link', async ({ page }) => {
    await signIn(page, null);
    let calls = 0;
    await page.route('**/api/v1/auth/email/resend', async (route) => {
      calls += 1;
      await (calls === 1
        ? route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: envelope({ message: 'ok' }),
          })
        : route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: errorBody('RATE_LIMITED', 'یک دقیقه بعد دوباره تلاش کنید.'),
          }));
    });
    await page.goto('/dashboard/profile');
    await expect(page.getByText('تأیید نشده')).toBeVisible();
    const resend = page.getByRole('button', { name: 'ارسال دوباره لینک تأیید' });
    await resend.click();
    await expect(page.getByText(/لینک تأیید به ایمیل شما ارسال شد/)).toBeVisible();
    await resend.click();
    await expect(page.getByText('یک دقیقه بعد دوباره تلاش کنید.')).toBeVisible();
  });

  test('a verified address needs no action', async ({ page }) => {
    await signIn(page, '2026-09-20T10:00:00Z');
    await page.goto('/dashboard/profile');
    await expect(page.getByText('تأیید شده', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ارسال دوباره لینک تأیید' })).toHaveCount(0);
  });
});
