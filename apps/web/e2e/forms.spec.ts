import { expect, test } from '@playwright/test';

test.describe('service request forms (API mocked)', () => {
  test('feasibility wizard validates each step, submits with CSRF header and shows the tracking code', async ({
    page,
  }) => {
    let sent: { body: Record<string, unknown>; headers: Record<string, string> } | undefined;
    await page.route('**/api/v1/service-requests', async (route) => {
      sent = {
        body: route.request().postDataJSON() as Record<string, unknown>,
        headers: route.request().headers(),
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { id: 'x', trackingCode: 'RA-7K3M9QPD', type: 'FEASIBILITY', status: 'NEW' },
          meta: { requestId: 'test' },
        }),
      });
    });

    await page.goto('/feasibility/request');
    const next = page.getByRole('button', { name: 'مرحله بعد' });

    // Step 1: contact details are validated before moving on.
    await next.click();
    await expect(page.getByLabel(/نام و نام خانوادگی/)).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel(/نام و نام خانوادگی/).fill('علی رضایی');
    await page.getByLabel(/شماره موبایل/).fill('۰۹۱۲۱۲۳۴۵۶۷');
    await next.click();

    // Step 2: sector and stage are required.
    await expect(page.getByRole('heading', { name: 'مشخصات طرح' })).toBeVisible();
    await next.click();
    await expect(page.getByLabel(/حوزه طرح/)).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toBeUndefined();
    await page.getByLabel(/حوزه طرح/).selectOption('معدنی');
    await page.getByLabel(/مرحله فعلی/).selectOption('ایده اولیه');
    await next.click();

    // Step 3: description, a review of the answers, then submit.
    await page.getByRole('button', { name: 'ثبت درخواست امکان‌سنجی' }).click();
    await expect(page.getByText('لطفاً موارد مشخص‌شده را تکمیل کنید.')).toBeVisible();
    await page
      .getByLabel(/شرح کوتاه طرح/)
      .fill('طرح فرآوری سنگ آهن با ظرفیت اولیه کوچک در استان یزد');
    await expect(page.getByText('علی رضایی')).toBeVisible();
    await page.getByRole('button', { name: 'ثبت درخواست امکان‌سنجی' }).click();

    await expect(page.getByTestId('tracking-code')).toHaveText('RA-۷K۳M۹QPD');
    expect(sent?.headers['x-requested-with']).toBe('XMLHttpRequest');
    expect(sent?.body).toMatchObject({
      type: 'FEASIBILITY',
      mobile: '09121234567',
      sector: 'معدنی',
      stage: 'ایده اولیه',
    });
    expect(sent?.body).not.toHaveProperty('email');
  });

  test('server-side validation errors are shown on the matching field', async ({ page }) => {
    await page.route('**/api/v1/service-requests', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'اطلاعات ارسالی معتبر نیست.',
            details: [{ path: 'message', message: 'متن پیام بیش از حد کوتاه است.' }],
            requestId: 't',
          },
        }),
      }),
    );
    await page.goto('/contact');
    await page.getByLabel(/نام و نام خانوادگی/).fill('مریم احمدی');
    await page.getByLabel(/شماره موبایل/).fill('09121234567');
    await page.getByLabel(/متن پیام/).fill('سلام، لطفاً تماس بگیرید.');
    await page.getByRole('button', { name: 'ارسال پیام' }).click();
    await expect(page.getByText('متن پیام بیش از حد کوتاه است.')).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'اطلاعات ارسالی معتبر نیست.' }),
    ).toBeVisible();
  });

  test('rate limiting and network failures show friendly errors', async ({ page }) => {
    await page.route('**/api/v1/service-requests', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'x', requestId: 't' } }),
      }),
    );
    await page.goto('/research/request');
    await page.getByLabel(/نام و نام خانوادگی/).fill('مریم احمدی');
    await page.getByLabel(/شماره موبایل/).fill('09121234567');
    await page.getByLabel(/موضوع پژوهش/).fill('تحلیل بازار کاشی');
    await page
      .getByLabel(/شرح نیاز پژوهشی/)
      .fill('نیاز به بررسی عرضه و تقاضای کاشی در استان یزد داریم.');
    await page.getByRole('button', { name: 'ثبت سفارش پژوهش' }).click();
    await expect(page.getByText(/چند دقیقه بعد دوباره تلاش کنید/)).toBeVisible();
  });

  test('consulting form preselects the service from the query string', async ({ page }) => {
    await page.goto('/consulting/request?service=financing');
    await expect(page.getByLabel(/نوع خدمت/)).toHaveValue('financing');
  });

  test('tracking shows the status, or a not-found message', async ({ page }) => {
    await page.route('**/api/v1/service-requests/track**', (route) => {
      const url = new URL(route.request().url());
      return url.searchParams.get('code') === 'RA-7K3M9QPD'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                trackingCode: 'RA-7K3M9QPD',
                type: 'FEASIBILITY',
                status: 'IN_REVIEW',
                createdAt: '2026-09-20T10:00:00Z',
                updatedAt: '2026-09-21T10:00:00Z',
              },
              meta: { requestId: 't' },
            }),
          })
        : route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'x', requestId: 't' } }),
          });
    });

    await page.goto('/track');
    await page.getByLabel('کد پیگیری').fill('ra-7k3m9qpd');
    await page.getByLabel('شماره موبایل ثبت‌شده').fill('09121234567');
    await page.getByRole('button', { name: 'پیگیری' }).click();
    await expect(page.getByTestId('track-status')).toHaveText('در حال بررسی');

    await page.getByLabel('کد پیگیری').fill('RA-00000000');
    await page.getByRole('button', { name: 'پیگیری' }).click();
    await expect(page.getByText('درخواستی با این کد و شماره موبایل یافت نشد.')).toBeVisible();
  });
});
