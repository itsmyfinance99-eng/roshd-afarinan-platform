import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total } });

const user = (id: string, fullName: string, roles: string[]) => ({
  id,
  email: `${id}@example.com`,
  mobile: null,
  fullName,
  status: 'ACTIVE',
  roles,
  createdAt: '2026-09-01T00:00:00Z',
});

const ADMIN_PERMISSIONS = ['users:read', 'users:manage-roles', 'audit:read'];

async function signIn(page: Page, permissions: string[], roles: string[]) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({ ...user('me', 'مدیر سامانه', roles), permissions }),
    }),
  );
}

async function mockUsers(page: Page, items: unknown[], onQuery?: (url: URL) => void) {
  await page.route('**/api/v1/users?*', (route) => {
    onQuery?.(new URL(route.request().url()));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope(items, items.length),
    });
  });
}

const editButton = (page: Page) => page.getByRole('button', { name: 'ویرایش نقش‌ها' });

test.describe('user management', () => {
  test('an admin changes a role; admin roles stay locked without super_admin', async ({ page }) => {
    await signIn(page, ADMIN_PERMISSIONS, ['admin', 'user']);
    const target = user('u2', 'مریم احمدی', ['support', 'user']);
    await mockUsers(page, [target]);
    let body: unknown;
    await page.route('**/api/v1/users/u2/roles', async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({ ...target, roles: ['expert', 'support', 'user'] }),
      });
    });

    await page.goto('/dashboard/manage/users');
    await expect(page.getByRole('link', { name: 'مدیریت کاربران' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await editButton(page).click();
    await expect(page.getByRole('checkbox', { name: 'مدیر', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'مدیر ارشد' })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'کاربر', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'ذخیره نقش‌ها' })).toBeDisabled();

    await page.getByRole('checkbox', { name: 'کارشناس' }).check();
    await page.getByRole('button', { name: 'ذخیره نقش‌ها' }).click();
    await expect(page.getByText('نقش‌ها ذخیره شد.')).toBeVisible();
    expect(body).toEqual({ roles: ['expert', 'support', 'user'] });
  });

  test('own account and admin accounts are read-only for a non-super admin', async ({ page }) => {
    await signIn(page, ADMIN_PERMISSIONS, ['admin', 'user']);
    await mockUsers(page, [
      user('me', 'مدیر سامانه', ['admin', 'user']),
      user('u3', 'مدیر دیگر', ['admin', 'user']),
    ]);
    await page.goto('/dashboard/manage/users');
    const row = (name: string) => page.getByRole('listitem').filter({ hasText: name });
    await row('مدیر سامانه').getByRole('button', { name: 'ویرایش نقش‌ها' }).click();
    await expect(page.getByText('نقش‌های حساب خودتان را نمی‌توانید تغییر دهید.')).toBeVisible();
    await row('مدیر دیگر').getByRole('button', { name: 'ویرایش نقش‌ها' }).click();
    await expect(
      page.getByText('تغییر نقش‌های این حساب فقط با دسترسی مدیر ارشد ممکن است.'),
    ).toBeVisible();
  });

  test('search and role filter reach the API; no results show an empty state', async ({ page }) => {
    await signIn(page, ADMIN_PERMISSIONS, ['admin', 'user']);
    const queries: Record<string, string>[] = [];
    await mockUsers(page, [], (url) => queries.push(Object.fromEntries(url.searchParams)));
    await page.goto('/dashboard/manage/users');
    await page.getByLabel(/جست‌وجو/).fill('۰۹۱۲');
    await page.getByLabel('نقش').selectOption('editor');
    await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
    await expect(page.getByText('کاربری یافت نشد')).toBeVisible();
    expect(queries.at(-1)).toMatchObject({ q: '۰۹۱۲', role: 'editor', page: '1' });
  });

  test('a server refusal is shown to the operator', async ({ page }) => {
    await signIn(page, ADMIN_PERMISSIONS, ['super_admin', 'user']);
    await mockUsers(page, [user('u4', 'کاربر نمونه', ['user'])]);
    await page.route('**/api/v1/users/u4/roles', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'برای این تغییر نقش، دسترسی مدیر ارشد لازم است.',
            requestId: 't',
          },
        }),
      }),
    );
    await page.goto('/dashboard/manage/users');
    await editButton(page).click();
    await page.getByRole('checkbox', { name: 'مدیر', exact: true }).check();
    await page.getByRole('button', { name: 'ذخیره نقش‌ها' }).click();
    await expect(page.getByText('برای این تغییر نقش، دسترسی مدیر ارشد لازم است.')).toBeVisible();
  });

  test('viewers without users:manage-roles get no role editor', async ({ page }) => {
    await signIn(page, ['users:read'], ['user']);
    await mockUsers(page, [user('u5', 'کاربر نمونه', ['user'])]);
    await page.goto('/dashboard/manage/users');
    await expect(page.getByText('کاربر نمونه')).toBeVisible();
    await expect(editButton(page)).toHaveCount(0);
  });

  test('users without users:read see neither the menu item nor the page', async ({ page }) => {
    await signIn(page, ['cms:write'], ['editor', 'user']);
    await page.goto('/dashboard/manage/users');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'مدیریت کاربران' })).toHaveCount(0);
  });
});
