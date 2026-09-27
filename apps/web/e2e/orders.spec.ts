import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total } });
const json = (data: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: envelope(data),
});

const ATTEMPT = '0199a000-0000-7000-8000-0000000000aa';

const order = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 'o1',
  code: 'OR-7K3M9QPD',
  status,
  totalRials: '25000000',
  paidAt: status === 'PAID' ? '2026-09-26T08:00:00Z' : null,
  createdAt: '2026-09-26T07:00:00Z',
  items: [
    {
      id: 'i1',
      kind: 'COURSE',
      referenceSlug: 'feasibility-basics',
      title: 'مبانی امکان‌سنجی طرح‌های صنعتی',
      unitPriceRials: '25000000',
      quantity: 1,
    },
  ],
  attempts: [],
  ...extra,
});

async function signIn(page: Page, permissions: string[] = []) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill(
      json({
        id: 'me',
        email: 'buyer@example.com',
        mobile: null,
        fullName: 'خریدار',
        roles: permissions.length ? ['finance'] : ['user'],
        permissions,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    ),
  );
  await page.route('**/api/v1/payments/status', (route) =>
    route.fulfill(json({ enabled: true, testMode: true })),
  );
}

test.describe('course orders and payment', () => {
  test('visitors are asked to sign in before buying; free courses have no buy button', async ({
    page,
  }) => {
    await page.goto('/training/feasibility-basics');
    await expect(page.getByRole('link', { name: 'ورود برای خرید آنلاین' })).toHaveAttribute(
      'href',
      '/login?next=%2Ftraining%2Ffeasibility-basics',
    );
    await page.goto('/training/economics-for-managers');
    await expect(page.getByText(/خرید/)).toHaveCount(0);
  });

  test('a signed-in user orders a course and is sent to the (test) gateway', async ({ page }) => {
    await signIn(page);
    let posted: unknown;
    await page.route('**/api/v1/orders', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill(json(order('PENDING_PAYMENT'), 201));
    });
    await page.route('**/api/v1/orders/o1', (route) =>
      route.fulfill(json(order('PENDING_PAYMENT'))),
    );
    await page.route('**/api/v1/orders/o1/pay', (route) =>
      route.fulfill(
        json({
          attemptId: ATTEMPT,
          redirectUrl: `/mock-gateway/MOCK-ABCDEF0123456789?callback=${encodeURIComponent(
            `http://127.0.0.1:3100/api/v1/payments/callback/${ATTEMPT}`,
          )}`,
        }),
      ),
    );

    await page.goto('/training/feasibility-basics');
    await page.getByRole('button', { name: 'خرید و پرداخت آنلاین' }).click();
    await expect(page).toHaveURL(/\/dashboard\/orders\/o1$/);
    expect(posted).toEqual({ items: [{ kind: 'COURSE', slug: 'feasibility-basics' }] });
    await expect(page.getByText('۲۵٬۰۰۰٬۰۰۰ ریال').first()).toBeVisible();
    await expect(page.getByText(/درگاه آزمایشی فعال است/)).toBeVisible();

    await page.getByRole('button', { name: 'پرداخت آنلاین' }).click();
    await expect(page).toHaveURL(/\/mock-gateway\/MOCK-ABCDEF0123456789/);
    await expect(page.getByRole('link', { name: 'پرداخت موفق' })).toHaveAttribute(
      'href',
      `/api/v1/payments/callback/${ATTEMPT}?status=OK`,
    );
  });

  test('the order page trusts the API status, not the return hint', async ({ page }) => {
    await signIn(page);
    let status = 'PENDING_PAYMENT';
    await page.route('**/api/v1/orders/o1', (route) => route.fulfill(json(order(status))));
    await page.goto('/dashboard/orders/o1?payment=paid');
    await expect(page.getByText(/نتیجه پرداخت هنوز تأیید نشده است/)).toBeVisible();
    await expect(page.getByText(/پرداخت این سفارش تأیید شده است/)).toHaveCount(0);

    await page.goto('/dashboard/orders/o1?payment=failed');
    await expect(page.getByText(/پرداخت انجام نشد یا تأیید نشد/)).toBeVisible();

    status = 'PAID';
    await page.goto('/dashboard/orders/o1?payment=paid');
    await expect(page.getByText(/پرداخت این سفارش تأیید شده است/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'پرداخت آنلاین' })).toHaveCount(0);
  });

  test('a pending order can be cancelled; my orders lists it', async ({ page }) => {
    await signIn(page);
    let status = 'PENDING_PAYMENT';
    await page.route('**/api/v1/orders/o1', (route) => route.fulfill(json(order(status))));
    await page.route('**/api/v1/orders/o1/cancel', async (route) => {
      status = 'CANCELLED';
      await route.fulfill(json(order(status)));
    });
    await page.route('**/api/v1/orders/mine?*', (route) => route.fulfill(json([order(status)])));
    await page.goto('/dashboard/orders/o1');
    await page.getByRole('button', { name: 'لغو سفارش' }).click();
    await expect(page.getByText('لغوشده').first()).toBeVisible();

    await page.goto('/dashboard/orders');
    await expect(page.getByRole('link', { name: 'سفارش‌های من' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('OR-۷K۳M۹QPD', { exact: false })).toBeVisible();
  });

  // ST-27.01: before this, `orders:read-all` had no page at all.
  test('finance browses every order, searches by code and opens a read-only detail', async ({
    page,
  }) => {
    await signIn(page, ['orders:read-all']);
    const staffOrder = {
      ...order('PAID'),
      customer: { id: 'u1', fullName: 'مریم رضایی', email: 'maryam@example.com' },
      attempts: [
        {
          id: 'a1',
          status: 'VERIFIED',
          amountRials: '25000000',
          trackingCode: 'TRK-99',
          cardMask: '6104-****-****-1234',
          failureReason: null,
          createdAt: '2026-09-26T07:30:00Z',
        },
      ],
    };
    const queries: string[] = [];
    await page.route('**/api/v1/orders?*', (route) => {
      const q = new URL(route.request().url()).searchParams;
      queries.push(q.toString());
      void route.fulfill(json(q.get('q') === 'ZZZZ' ? [] : [staffOrder]));
    });
    await page.route('**/api/v1/orders/o1', (route) => route.fulfill(json(staffOrder)));

    await page.goto('/dashboard/manage/orders');
    await expect(page.getByRole('link', { name: 'سفارش‌ها و پرداخت‌ها' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('مریم رضایی')).toBeVisible();

    await page.getByLabel('کد سفارش').fill('ZZZZ');
    await page.getByRole('button', { name: 'جست‌وجو' }).click();
    await expect(page.getByText('سفارشی با این فیلترها یافت نشد')).toBeVisible();
    expect(queries.some((q) => q.includes('q=ZZZZ'))).toBe(true);

    await page.goto('/dashboard/manage/orders/o1');
    await expect(page.getByText('maryam@example.com')).toBeVisible();
    await expect(page.getByText('TRK-99')).toBeVisible();
    // Staff read; they never pay or cancel on someone's behalf.
    await expect(page.getByRole('button', { name: 'لغو سفارش' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'پرداخت آنلاین' })).toHaveCount(0);
  });

  test('a user without the finance permission is refused the orders desk', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/manage/orders');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'سفارش‌ها و پرداخت‌ها' })).toHaveCount(0);
  });

  test('the mock gateway refuses foreign callbacks', async ({ page }) => {
    const res = await page.goto(
      `/mock-gateway/MOCK-ABCDEF0123456789?callback=${encodeURIComponent('https://evil.example/steal')}`,
    );
    expect(res?.status()).toBe(404);
  });
});
