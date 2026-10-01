import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown) => JSON.stringify({ data, meta: { requestId: 't' } });
const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');

async function signIn(page: Page, permissions: string[] = []) {
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
        fullName: 'کاربر آزمایشی',
        roles: permissions.length ? ['admin'] : ['user'],
        permissions,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    }),
  );
}

const uploaded = (id: string, name: string) => ({
  id,
  originalName: name,
  mimeType: 'application/pdf',
  size: 2048,
  createdAt: '2026-09-25T10:00:00Z',
});

test.describe('files', () => {
  test('uploads a document on the files page and blocks unsupported types client-side', async ({
    page,
  }) => {
    await signIn(page);
    const files: ReturnType<typeof uploaded>[] = [];
    await page.route('**/api/v1/files/mine**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: envelope(files) }),
    );
    let multipart = '';
    await page.route('**/api/v1/files', async (route) => {
      multipart = route.request().postData() ?? '';
      files.push(uploaded('f1', 'گزارش.pdf'));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: envelope(files[0]),
      });
    });

    await page.goto('/dashboard/files');
    await expect(page.getByText('هنوز فایلی بارگذاری نکرده‌اید')).toBeVisible();

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: 'setup.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ'),
    });
    await expect(page.getByText(/نوع فایل مجاز نیست/)).toBeVisible();

    await input.setInputFiles({ name: 'گزارش.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByText('گزارش.pdf')).toBeVisible();
    expect(multipart).toContain('name="purpose"');
    expect(multipart).toContain('USER_DOCUMENT');
  });

  test('signed-in users attach documents to a feasibility request', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/v1/files', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: envelope(uploaded('a1', 'plan.pdf')),
      }),
    );
    let body: Record<string, unknown> | undefined;
    await page.route('**/api/v1/service-requests', async (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: envelope({
          id: 'r1',
          trackingCode: 'RA-7K3M9QPD',
          type: 'FEASIBILITY',
          status: 'NEW',
        }),
      });
    });

    await page.goto('/feasibility/request');
    const next = page.getByRole('button', { name: 'مرحله بعد' });
    await page.getByLabel(/نام و نام خانوادگی/).fill('علی رضایی');
    await page.getByLabel(/شماره موبایل/).fill('09121234567');
    await next.click();
    await page.getByLabel(/حوزه طرح/).selectOption('صنعتی');
    await page.getByLabel(/مرحله فعلی/).selectOption('مطالعه فنی');
    await next.click();
    // Attachments are part of the last step, beside the description.
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByText('plan.pdf')).toBeVisible();
    await page
      .getByLabel(/شرح کوتاه طرح/)
      .fill('طرح تولید قطعات صنعتی با ظرفیت متوسط در استان یزد');
    await page.getByRole('button', { name: 'ثبت درخواست امکان‌سنجی' }).click();

    await expect(page.getByTestId('tracking-code')).toBeVisible();
    expect(body?.attachmentIds).toEqual(['a1']);
  });

  // ST-27.02: `files:read-all` had neither an endpoint nor a page before.
  test('staff browse every file, filter by owner, download and delete', async ({ page }) => {
    await signIn(page, ['files:read-all']);
    const staffFile = (extra: Record<string, unknown> = {}) => ({
      ...uploaded('f1', 'evidence.pdf'),
      purpose: 'SERVICE_REQUEST_ATTACHMENT',
      entityType: 'service_request',
      entityId: 'r1',
      checksum: 'abc',
      status: 'ACTIVE',
      deletedAt: null,
      owner: { id: 'u9', fullName: 'مریم رضایی', email: 'maryam@example.com' },
      ...extra,
    });
    const queries: string[] = [];
    let deleted = false;
    await page.route('**/api/v1/files?*', (route) => {
      const q = new URL(route.request().url()).searchParams;
      queries.push(q.toString());
      const rows = deleted || q.get('owner') === 'nobody' ? [] : [staffFile()];
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope(rows),
      });
    });
    await page.route('**/api/v1/files/f1/download-url', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope({ url: '/api/v1/files/f1/content?exp=1&sig=x', expiresAt: null }),
      }),
    );
    await page.route('**/api/v1/files/f1', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: envelope(null) });
        return;
      }
      await route.fallback();
    });

    await page.goto('/dashboard/manage/files');
    await expect(page.getByRole('link', { name: 'فایل‌های کاربران' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('maryam@example.com')).toBeVisible();
    await expect(page.getByText(/پیوست‌شده/)).toBeVisible();
    // The list asks for active files unless the other chip is chosen.
    expect(queries[0]).toContain('status=ACTIVE');

    await page.getByLabel('مالک').fill('nobody');
    await page.getByRole('button', { name: 'جست‌وجو' }).click();
    await expect(page.getByText('فایلی با این فیلترها یافت نشد.')).toBeVisible();
    expect(queries.some((q) => q.includes('owner=nobody'))).toBe(true);

    await page.getByRole('button', { name: 'حذف جست‌وجو' }).click();
    await expect(page.getByText('evidence.pdf')).toBeVisible();

    // Deleting an attached file warns first, because the record loses its attachment.
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('پیوست');
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'حذف evidence.pdf' }).click();
    await expect(page.getByText('فایلی با این فیلترها یافت نشد.')).toBeVisible();
  });

  test('a user without files:read-all is refused the file browser', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/manage/files');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'فایل‌های کاربران' })).toHaveCount(0);
  });

  test('guests are invited to sign in before attaching', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByRole('link', { name: 'وارد حساب کاربری شوید' })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });
});
