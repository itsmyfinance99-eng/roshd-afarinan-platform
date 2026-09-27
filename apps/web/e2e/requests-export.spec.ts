import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown, total = 0) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total } });

async function signIn(page: Page, permissions: string[], roles: string[]) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        id: 'u1',
        email: 'staff@example.com',
        mobile: null,
        fullName: 'کارشناس',
        roles,
        permissions,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    }),
  );
  await page.route('**/api/v1/service-requests?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: envelope([]) }),
  );
}

test.describe('request export', () => {
  test('staff export the filtered requests as a CSV file', async ({ page }) => {
    await signIn(page, ['requests:read-all', 'requests:manage'], ['user', 'support']);
    let exportUrl: URL | undefined;
    await page.route('**/api/v1/service-requests/export*', async (route) => {
      exportUrl = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="service-requests-20260926-1430.csv"',
          'X-Export-Rows': '3',
        },
        body: '﻿کد پیگیری\r\n',
      });
    });

    await page.goto('/dashboard/manage/requests');
    await page.getByRole('button', { name: 'سفارش پژوهش' }).click();
    // The filter is a Jalali field now (ST-27.05); the API still receives ISO Gregorian days.
    await page.getByLabel('از تاریخ').fill('۱۴۰۵/۰۶/۱۰');
    await page.getByLabel('تا تاریخ').fill('۱۴۰۵/۰۷/۰۳');
    await page.getByLabel('تا تاریخ').blur();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'خروجی Excel (CSV)' }).click();
    expect((await download).suggestedFilename()).toBe('service-requests-20260926-1430.csv');
    await expect(page.getByText('فایل خروجی با ۳ ردیف آماده شد.')).toBeVisible();
    expect(Object.fromEntries(exportUrl?.searchParams ?? [])).toEqual({
      status: 'NEW',
      type: 'RESEARCH',
      from: '2026-09-01',
      to: '2026-09-25',
    });
  });

  test('a reversed date range disables the export', async ({ page }) => {
    await signIn(page, ['requests:read-all'], ['user', 'expert']);
    await page.goto('/dashboard/manage/requests');
    await page.getByLabel('از تاریخ').fill('۱۴۰۵/۰۷/۰۳');
    await page.getByLabel('تا تاریخ').fill('۱۴۰۵/۰۶/۱۰');
    await page.getByLabel('تا تاریخ').blur();
    await expect(page.getByText('تاریخ شروع نباید بعد از تاریخ پایان باشد.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'خروجی Excel (CSV)' })).toBeDisabled();
  });

  test('server errors are shown instead of downloading', async ({ page }) => {
    await signIn(page, ['requests:read-all'], ['user', 'expert']);
    await page.route('**/api/v1/service-requests/export*', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'BAD_REQUEST',
            message: 'تعداد درخواست‌ها بیش از ۱۰٬۰۰۰ است؛ بازه تاریخ یا فیلترها را محدودتر کنید.',
            requestId: 't',
          },
        }),
      }),
    );
    await page.goto('/dashboard/manage/requests');
    await page.getByRole('button', { name: 'خروجی Excel (CSV)' }).click();
    await expect(page.getByText(/بازه تاریخ یا فیلترها را محدودتر کنید/)).toBeVisible();
  });

  test('users without requests:read-all see no export', async ({ page }) => {
    await signIn(page, ['cms:write'], ['user', 'editor']);
    await page.goto('/dashboard/manage/requests');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'خروجی Excel (CSV)' })).toHaveCount(0);
  });
});
