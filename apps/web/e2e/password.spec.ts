import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown) => JSON.stringify({ data, meta: { requestId: 't' } });
const json = (data: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: envelope(data),
});
const TOKEN = 'A'.repeat(43);

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
}

test.describe('password recovery', () => {
  test('login links to recovery; the request shows the same answer for any email', async ({
    page,
  }) => {
    let posted: unknown;
    await page.route('**/api/v1/auth/password/forgot', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill(
        json(
          { message: 'اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی رمز ارسال می‌شود.' },
          202,
        ),
      );
    });
    await page.goto('/login');
    await page.getByRole('link', { name: 'رمز عبور را فراموش کرده‌اید؟' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel(/ایمیل حساب کاربری/).fill('User@Example.com');
    await page.getByRole('button', { name: 'ارسال لینک بازیابی' }).click();
    await expect(page.getByText(/اگر حسابی با این ایمیل وجود داشته باشد/)).toBeVisible();
    expect(posted).toEqual({ email: 'user@example.com' });
  });

  test('reset requires a token, matching passwords, and reports expired links', async ({
    page,
  }) => {
    await page.goto('/reset-password');
    await expect(
      page.getByText('لینک بازیابی کامل نیست. لطفاً دوباره درخواست دهید.'),
    ).toBeVisible();

    let calls = 0;
    await page.route('**/api/v1/auth/password/reset', async (route) => {
      calls += 1;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'BAD_REQUEST',
            message: 'لینک بازیابی نامعتبر یا منقضی است. دوباره درخواست دهید.',
            requestId: 't',
          },
        }),
      });
    });
    await page.goto(`/reset-password?token=${TOKEN}`);
    await page.getByLabel(/^رمز عبور جدید/).fill('new-secret-42');
    await page.getByLabel(/تکرار رمز عبور جدید/).fill('different-42');
    await page.getByRole('button', { name: 'ذخیره رمز جدید' }).click();
    await expect(page.getByText('تکرار رمز با رمز جدید یکسان نیست.')).toBeVisible();
    expect(calls).toBe(0);

    await page.getByLabel(/تکرار رمز عبور جدید/).fill('new-secret-42');
    await page.getByRole('button', { name: 'ذخیره رمز جدید' }).click();
    await expect(page.getByText(/نامعتبر یا منقضی است/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'درخواست لینک جدید' })).toBeVisible();
  });

  test('a valid link sets the new password', async ({ page }) => {
    let posted: unknown;
    await page.route('**/api/v1/auth/password/reset', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill(json(null));
    });
    await page.goto(`/reset-password?token=${TOKEN}`);
    await page.getByLabel(/^رمز عبور جدید/).fill('new-secret-42');
    await page.getByLabel(/تکرار رمز عبور جدید/).fill('new-secret-42');
    await page.getByRole('button', { name: 'ذخیره رمز جدید' }).click();
    await expect(page.getByText(/رمز عبور شما تغییر کرد/)).toBeVisible();
    expect(posted).toEqual({ token: TOKEN, password: 'new-secret-42' });
  });

  test('the profile changes the password and signs out everywhere', async ({ page }) => {
    await signIn(page);
    let changed: unknown;
    await page.route('**/api/v1/auth/password/change', async (route) => {
      changed = route.request().postDataJSON();
      await route.fulfill(json({ user: {} }));
    });
    await page.route('**/api/v1/auth/logout-all', (route) => route.fulfill(json(null)));

    await page.goto('/dashboard/profile');
    await page.getByLabel('رمز فعلی').fill('old-secret-41');
    await page.getByLabel(/^رمز جدید/).fill('new-secret-42');
    await page.getByLabel('تکرار رمز جدید').fill('new-secret-42');
    await page.getByRole('button', { name: 'تغییر رمز' }).click();
    await expect(page.getByText(/رمز عبور تغییر کرد/)).toBeVisible();
    expect(changed).toEqual({ currentPassword: 'old-secret-41', newPassword: 'new-secret-42' });

    await page.getByRole('button', { name: 'خروج از همه دستگاه‌ها' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
