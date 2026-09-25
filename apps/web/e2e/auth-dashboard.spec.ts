import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown, meta: Record<string, unknown> = {}) =>
  JSON.stringify({ data, meta: { requestId: 't', ...meta } });

const me = (permissions: string[] = [], roles = ['user']) => ({
  id: 'u1',
  email: 'maryam@example.com',
  mobile: null,
  fullName: 'مریم احمدی',
  roles,
  permissions,
  createdAt: '2026-09-01T10:00:00Z',
});

const request = {
  id: 'r1',
  trackingCode: 'RA-7K3M9QPD',
  type: 'FEASIBILITY',
  status: 'IN_REVIEW',
  fullName: 'مریم احمدی',
  mobile: '09121234567',
  email: null,
  subject: null,
  message: 'طرح فرآوری سنگ آهن',
  details: { sector: 'معدنی', stage: 'ایده اولیه' },
  createdAt: '2026-09-20T10:00:00Z',
  updatedAt: '2026-09-21T10:00:00Z',
};

async function signIn(page: Page, user = me()) {
  await page.context().addCookies([
    {
      name: 'ra_session',
      value: '1',
      url: page.context().pages()[0]?.url() || 'http://127.0.0.1:3100',
    },
  ]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: envelope(user) }),
  );
}

test.describe('authentication pages', () => {
  test('private pages redirect to login with a safe next path', async ({ page }) => {
    await page.goto('/dashboard/requests');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Frequests$/);
    await expect(page.getByRole('heading', { level: 1, name: 'ورود به حساب' })).toBeVisible();
  });

  test('login success sets the session and goes to the requested page', async ({
    page,
    baseURL,
  }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'set-cookie': 'ra_session=1; Path=/' },
        body: envelope({ user: me() }),
      }),
    );
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: envelope(me()) }),
    );
    await page.route('**/api/v1/service-requests/mine**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope([request], { total: 1, page: 1, pageSize: 10 }),
      }),
    );

    await page.goto(`${baseURL}/login?next=%2Fdashboard%2Frequests`);
    await page.getByLabel(/ایمیل/).fill('maryam@example.com');
    await page.getByLabel(/رمز عبور/).fill('secret123');
    await page.getByRole('button', { name: 'ورود' }).click();
    await expect(page).toHaveURL(/\/dashboard\/requests$/);
    await expect(page.getByText('RA-۷K۳M۹QPD')).toBeVisible();
  });

  test('login rejects an open-redirect next parameter', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'set-cookie': 'ra_session=1; Path=/' },
        body: envelope({ user: me() }),
      }),
    );
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: envelope(me()) }),
    );
    await page.route('**/api/v1/service-requests/mine**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: envelope([]) }),
    );
    await page.goto('/login?next=%2F%2Fevil.example');
    await page.getByLabel(/ایمیل/).fill('maryam@example.com');
    await page.getByLabel(/رمز عبور/).fill('secret123');
    await page.getByRole('button', { name: 'ورود' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/dashboard$/);
  });

  test('wrong credentials show the API message', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'ایمیل یا رمز عبور نادرست است.',
            requestId: 't',
          },
        }),
      }),
    );
    await page.goto('/login');
    await page.getByLabel(/ایمیل/).fill('maryam@example.com');
    await page.getByLabel(/رمز عبور/).fill('wrong');
    await page.getByRole('button', { name: 'ورود' }).click();
    await expect(page.getByText('ایمیل یا رمز عبور نادرست است.')).toBeVisible();
  });

  test('registration validates the password policy on the client', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel(/نام و نام خانوادگی/).fill('مریم احمدی');
    await page.getByLabel(/^ایمیل/).fill('maryam@example.com');
    await page.getByLabel(/رمز عبور/).fill('12345678');
    await page.getByRole('button', { name: 'ایجاد حساب کاربری' }).click();
    await expect(page.getByText('رمز عبور باید حداقل یک حرف داشته باشد.')).toBeVisible();
  });
});

test.describe('dashboard', () => {
  test('shows the user, their requests and hides staff tools', async ({ page }) => {
    await page.goto('/');
    await signIn(page);
    await page.route('**/api/v1/service-requests/mine**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope([request], { total: 1 }),
      }),
    );
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /خوش آمدید، مریم احمدی/ })).toBeVisible();
    await expect(page.getByText('در حال بررسی')).toBeVisible();
    await expect(page.getByRole('link', { name: 'مدیریت درخواست‌ها' })).toHaveCount(0);
  });

  test('empty request list shows a call to action', async ({ page }) => {
    await page.goto('/');
    await signIn(page);
    await page.route('**/api/v1/service-requests/mine**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope([], { total: 0 }),
      }),
    );
    await page.goto('/dashboard/requests');
    await expect(page.getByText('هنوز درخواستی ثبت نشده است')).toBeVisible();
  });

  test('an expired session that cannot be refreshed returns to login', async ({ page }) => {
    await page.goto('/');
    await page
      .context()
      .addCookies([{ name: 'ra_session', value: '1', url: 'http://127.0.0.1:3100' }]);
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'x', requestId: 't' } }),
      }),
    );
    await page.goto('/dashboard/profile');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fprofile$/);
  });

  test('support staff can change a request status', async ({ page }) => {
    await page.goto('/');
    await signIn(page, me(['requests:read-all', 'requests:manage'], ['user', 'support']));
    let patched: unknown;
    await page.route('**/api/v1/service-requests/r1/status', async (route) => {
      patched = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({ ...request, status: 'RESPONDED', events: [] }),
      });
    });
    await page.route('**/api/v1/service-requests/r1', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({
          ...request,
          events: [
            { fromStatus: null, toStatus: 'NEW', note: null, createdAt: '2026-09-20T10:00:00Z' },
          ],
        }),
      }),
    );
    await page.goto('/dashboard/manage/requests/r1');
    await expect(page.getByRole('link', { name: 'مدیریت درخواست‌ها' })).toBeVisible();
    await page.getByLabel(/وضعیت جدید/).selectOption('RESPONDED');
    await page.getByLabel(/یادداشت داخلی/).fill('با متقاضی تماس گرفته شد.');
    await page.getByRole('button', { name: 'ثبت وضعیت' }).click();
    await expect(page.getByText('وضعیت به‌روز شد.')).toBeVisible();
    expect(patched).toEqual({ status: 'RESPONDED', note: 'با متقاضی تماس گرفته شد.' });
  });
});
