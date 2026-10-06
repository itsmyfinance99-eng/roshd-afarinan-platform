import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * Feasibility projects of the applicant (ST-35.02): the list, a new draft, the project page with
 * its timeline, changing and submitting the draft, and the conversion of a Phase 1 request into
 * a project by staff.
 */

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 10, total } });
const json = (route: Route, data: unknown, total = 1, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: envelope(data, total) });
const fail = (route: Route, status: number, message: string, details: object[] = []) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'ERROR', message, details, requestId: 't' } }),
  });

async function signIn(page: Page, permissions: string[] = [], roles: string[] = ['user']) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    json(route, {
      id: 'u1',
      email: 'user@example.com',
      mobile: null,
      fullName: 'مریم احمدی',
      roles,
      permissions,
      emailVerifiedAt: '2026-09-01T00:00:00Z',
      createdAt: '2026-09-01T00:00:00Z',
    }),
  );
}

const access = (over: object = {}) => ({
  transitions: ['SUBMITTED'],
  edit: true,
  remove: true,
  assignExperts: false,
  releaseExperts: false,
  ...over,
});

const project = (over: object = {}) => ({
  id: 'p1',
  code: 'FP-7K3M9QPD',
  title: 'کارخانه فرآوری سنگ آهن',
  sector: 'معدنی',
  location: 'یزد',
  summary: 'فرآوری سالانه صد هزار تن سنگ آهن',
  status: 'DRAFT',
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-02T08:00:00Z',
  sourceRequest: null,
  attachments: [],
  events: [
    {
      fromStatus: null,
      toStatus: 'DRAFT',
      actor: 'applicant',
      note: null,
      createdAt: '2026-10-01T08:00:00Z',
    },
  ],
  access: access(),
  ...over,
});

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical' || v.id === 'heading-order')
    .map((v) => ({ rule: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  expect(blocking, `axe violations on ${page.url()}`).toEqual([]);
}

test.describe('feasibility projects of the applicant', () => {
  test('lists the projects, empty at first, and reports a failure with a retry', async ({
    page,
  }) => {
    await signIn(page);
    let mode: 'error' | 'empty' | 'full' = 'error';
    await page.route('**/api/v1/feasibility-projects?*', (route) =>
      mode === 'error'
        ? fail(route, 500, 'خطای سرور')
        : mode === 'empty'
          ? json(route, [], 0)
          : json(
              route,
              [project(), project({ id: 'p2', code: 'FP-2B4D6F8H', status: 'SUBMITTED' })],
              2,
            ),
    );

    await page.goto('/dashboard/feasibility');
    await expect(page.getByText('خطای سرور')).toBeVisible();
    mode = 'empty';
    await page.getByRole('button', { name: 'تلاش دوباره' }).click();
    await expect(page.getByText('هنوز پروژه‌ای ندارید')).toBeVisible();
    await expect(page.getByRole('link', { name: /ساخت اولین پروژه/ })).toHaveAttribute(
      'href',
      '/dashboard/feasibility/new',
    );

    mode = 'full';
    await page.reload();
    await expect(page.getByRole('link', { name: /FP-7K3M9QPD/ })).toHaveAttribute(
      'href',
      '/dashboard/feasibility/p1',
    );
    await expect(page.getByText('ارسال‌شده', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'منوی داشبورد' }).getByRole('link', {
        name: 'پروژه‌های امکان‌سنجی',
        exact: true,
      }),
    ).toHaveAttribute('aria-current', 'page');
    // The staff entry is for staff and experts only.
    await expect(page.getByRole('link', { name: 'مدیریت امکان‌سنجی' })).toHaveCount(0);
    await audit(page);
  });

  test('starts a draft, with the errors of the form next to their fields', async ({ page }) => {
    await signIn(page);
    let sent: unknown;
    await page.route('**/api/v1/feasibility-projects', async (route) => {
      sent = route.request().postDataJSON();
      await json(route, project({ id: 'p9' }), 1, 201);
    });
    await page.route('**/api/v1/feasibility-projects/p9', (route) =>
      json(route, project({ id: 'p9' })),
    );

    await page.goto('/dashboard/feasibility/new');
    await page.getByRole('button', { name: 'ذخیره پیش‌نویس' }).click();
    await expect(page.getByLabel('عنوان طرح')).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toBeUndefined();
    await audit(page);

    await page.getByLabel('عنوان طرح').fill('کارخانه فرآوری سنگ آهن');
    await page.getByLabel('حوزه طرح').selectOption('معدنی');
    await page.getByLabel('شرح طرح').fill('فرآوری سالانه صد هزار تن سنگ آهن');
    await page.getByRole('button', { name: 'ذخیره پیش‌نویس' }).click();
    await expect(page).toHaveURL(/\/dashboard\/feasibility\/p9$/);
    // An empty place is left out; the applicant can add it later.
    expect(sent).toEqual({
      title: 'کارخانه فرآوری سنگ آهن',
      sector: 'معدنی',
      summary: 'فرآوری سالانه صد هزار تن سنگ آهن',
    });
  });

  test('changes a draft and submits it for review', async ({ page }) => {
    await signIn(page);
    let current = project();
    const calls: { method: string; url: string; body: unknown }[] = [];
    await page.route('**/api/v1/feasibility-projects/p1', async (route) => {
      const request = route.request();
      if (request.method() === 'PATCH') {
        calls.push({ method: 'PATCH', url: request.url(), body: request.postDataJSON() });
        current = project({ title: 'کارخانه کنسانتره', location: null });
      }
      await json(route, current);
    });
    let refuse = true;
    await page.route('**/api/v1/feasibility-projects/p1/transitions', async (route) => {
      calls.push({
        method: 'POST',
        url: route.request().url(),
        body: route.request().postDataJSON(),
      });
      if (refuse) {
        refuse = false;
        await fail(route, 400, 'ورودی نامعتبر است.', [
          { path: 'summary', message: 'پیش از ارسال، شرح طرح را بنویسید.' },
        ]);
        return;
      }
      current = project({
        title: 'کارخانه کنسانتره',
        location: null,
        status: 'SUBMITTED',
        access: access({ transitions: [], edit: false, remove: false }),
        events: [
          ...current.events,
          {
            fromStatus: 'DRAFT',
            toStatus: 'SUBMITTED',
            actor: 'applicant',
            note: 'لطفاً بررسی کنید',
            createdAt: '2026-10-03T08:00:00Z',
          },
        ],
      });
      await json(route, current);
    });

    await page.goto('/dashboard/feasibility/p1');
    await expect(page.getByText('این پروژه هنوز پیش‌نویس است.', { exact: false })).toBeVisible();
    await expect(page.getByText('FP-7K3M9QPD')).toBeVisible();
    await audit(page);

    await page.getByRole('button', { name: 'ویرایش مشخصات' }).click();
    await page.getByLabel('عنوان طرح').fill('کارخانه کنسانتره');
    await page.getByLabel('محل اجرا').fill('');
    await page.getByRole('button', { name: 'ذخیره تغییرات' }).click();
    await expect(page.getByText('مشخصات پروژه ذخیره شد.')).toBeVisible();
    expect(calls[0]?.body).toEqual({
      title: 'کارخانه کنسانتره',
      sector: 'معدنی',
      location: null,
      summary: 'فرآوری سالانه صد هزار تن سنگ آهن',
    });
    await expect(page.getByText('کارخانه کنسانتره')).toBeVisible();

    // What the server still misses is said; the project stays a draft.
    await page.getByLabel('پیام برای بررسی‌کنندگان (اختیاری)').fill('لطفاً بررسی کنید');
    await page.getByRole('button', { name: 'ارسال برای بررسی' }).click();
    await expect(page.getByText('پیش از ارسال، شرح طرح را بنویسید.')).toBeVisible();

    await page.getByRole('button', { name: 'ارسال برای بررسی' }).click();
    await expect(page.getByText('پروژه برای بررسی ارسال شد.')).toBeVisible();
    expect(calls.at(-1)?.body).toEqual({ to: 'SUBMITTED', note: 'لطفاً بررسی کنید' });
    await expect(page.getByText('لطفاً بررسی کنید')).toBeVisible();
    await expect(page.getByText('پروژه ارسال شده و در انتظار بررسی اولیه است.')).toBeVisible();
    // Nothing is left to do for the applicant until the review answers.
    await expect(page.getByRole('button', { name: 'ویرایش مشخصات' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'حذف پیش‌نویس' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'ارسال برای بررسی' })).toHaveCount(0);
  });

  test('deletes a draft after a confirmation', async ({ page }) => {
    await signIn(page);
    let deleted = 0;
    await page.route('**/api/v1/feasibility-projects/p1', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleted += 1;
        await json(route, null);
        return;
      }
      await json(route, project());
    });
    await page.route('**/api/v1/feasibility-projects?*', (route) => json(route, [], 0));

    await page.goto('/dashboard/feasibility/p1');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: 'حذف پیش‌نویس' }).click();
    expect(deleted).toBe(0);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'حذف پیش‌نویس' }).click();
    await expect(page).toHaveURL(/\/dashboard\/feasibility$/);
    expect(deleted).toBe(1);
  });

  test('shows a project made from a request with what it took over', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(
        route,
        project({
          status: 'NEEDS_MORE_INFO',
          sourceRequest: { id: 'r1', trackingCode: 'RA-7K3M9QPD' },
          attachments: [
            {
              id: 'f1',
              originalName: 'plan.pdf',
              mimeType: 'application/pdf',
              size: 2048,
              createdAt: '2026-09-20T10:00:00Z',
            },
          ],
          access: access({ remove: false }),
          events: [
            {
              fromStatus: null,
              toStatus: 'DRAFT',
              actor: 'staff',
              note: 'از درخواست RA-7K3M9QPD ساخته شد.',
              createdAt: '2026-10-01T08:00:00Z',
            },
            {
              fromStatus: 'INITIAL_REVIEW',
              toStatus: 'NEEDS_MORE_INFO',
              actor: 'staff',
              note: 'ظرفیت اسمی را بنویسید.',
              createdAt: '2026-10-04T08:00:00Z',
            },
          ],
        }),
      ),
    );

    await page.goto('/dashboard/feasibility/p1');
    await expect(page.getByRole('link', { name: 'RA-7K3M9QPD' })).toHaveAttribute(
      'href',
      '/dashboard/requests/r1',
    );
    await expect(page.getByText('plan.pdf')).toBeVisible();
    await expect(page.getByText('ظرفیت اسمی را بنویسید.')).toBeVisible();
    // The applicant reads in which capacity somebody acted, never who it was.
    await expect(page.getByText('کارکنان', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'ارسال دوباره' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'حذف پیش‌نویس' })).toHaveCount(0);
    await audit(page);
  });

  test('says so when the project does not exist for the caller', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/v1/feasibility-projects/nope', (route) =>
      fail(route, 404, 'یافت نشد'),
    );
    await page.goto('/dashboard/feasibility/nope');
    await expect(page.getByText('موردی با این مشخصات یافت نشد.')).toBeVisible();
  });
});

test.describe('feasibility projects for staff', () => {
  const request = {
    id: 'r1',
    trackingCode: 'RA-7K3M9QPD',
    type: 'FEASIBILITY',
    status: 'IN_REVIEW',
    fullName: 'مریم احمدی',
    mobile: '09121234567',
    email: null,
    subject: null,
    message: 'طرح فرآوری سنگ آهن با ظرفیت صد هزار تن',
    details: { sector: 'معدنی', stage: 'ایده اولیه' },
    createdAt: '2026-09-20T10:00:00Z',
    updatedAt: '2026-09-21T10:00:00Z',
    assignee: null,
    attachments: [],
    events: [{ fromStatus: null, toStatus: 'NEW', note: null, createdAt: '2026-09-20T10:00:00Z' }],
  };

  test('turns a feasibility request into a project', async ({ page }) => {
    await signIn(page, ['requests:read-all', 'feasibility:manage'], ['user', 'admin']);
    await page.route('**/api/v1/service-requests/r1', (route) => json(route, request));
    let converted = false;
    let attempts = 0;
    let sent: unknown;
    await page.route('**/api/v1/feasibility-projects?*', (route) =>
      converted
        ? json(route, [project({ applicant: { id: 'u2', fullName: 'مریم احمدی' } })])
        : json(route, [], 0),
    );
    await page.route('**/api/v1/feasibility-projects/from-request', async (route) => {
      attempts += 1;
      sent = route.request().postDataJSON();
      if (attempts === 1) {
        await fail(route, 409, 'این درخواست بدون حساب کاربری ثبت شده است.');
        return;
      }
      converted = true;
      await json(route, project(), 1, 201);
    });

    await page.goto('/dashboard/manage/requests/r1');
    const convert = page.getByRole('button', { name: 'تبدیل به پروژه' });
    await convert.click();
    await expect(page.getByLabel('عنوان پروژه')).toHaveAttribute('aria-invalid', 'true');
    expect(attempts).toBe(0);

    await page.getByLabel('عنوان پروژه').fill('کارخانه فرآوری سنگ آهن');
    await convert.click();
    await expect(page.getByText('این درخواست بدون حساب کاربری ثبت شده است.')).toBeVisible();
    await audit(page);

    await convert.click();
    await expect(page.getByRole('link', { name: 'FP-7K3M9QPD' })).toHaveAttribute(
      'href',
      '/dashboard/manage/feasibility/p1',
    );
    expect(sent).toEqual({ requestId: 'r1', title: 'کارخانه فرآوری سنگ آهن' });
    await expect(convert).toHaveCount(0);
  });

  test('offers the conversion only to feasibility staff and only for feasibility requests', async ({
    page,
  }) => {
    await signIn(page, ['requests:read-all', 'requests:manage'], ['user', 'support']);
    await page.route('**/api/v1/service-requests/assignees', (route) => json(route, [], 0));
    await page.route('**/api/v1/service-requests/r1', (route) => json(route, request));
    await page.goto('/dashboard/manage/requests/r1');
    await expect(page.getByRole('heading', { name: 'تغییر وضعیت' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'تبدیل به پروژه' })).toHaveCount(0);
  });

  test('tells the requester that the request went on as a project', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/v1/service-requests/r1', (route) => json(route, request));
    const queries: URLSearchParams[] = [];
    await page.route('**/api/v1/feasibility-projects?*', (route) => {
      queries.push(new URL(route.request().url()).searchParams);
      return json(route, [project()]);
    });
    await page.goto('/dashboard/requests/r1');
    await expect(page.getByRole('link', { name: /رفتن به پروژه/ })).toHaveAttribute(
      'href',
      '/dashboard/feasibility/p1',
    );
    expect(queries[0]?.get('sourceRequestId')).toBe('r1');
    expect(queries[0]?.get('scope')).toBeNull();
  });

  test('lists every project for staff and the assigned ones for an expert', async ({ page }) => {
    await signIn(page, ['feasibility:manage', 'feasibility:work'], ['user', 'admin']);
    const queries: URLSearchParams[] = [];
    await page.route('**/api/v1/feasibility-projects?*', (route) => {
      const params = new URL(route.request().url()).searchParams;
      queries.push(params);
      return params.get('scope') === 'assigned'
        ? json(route, [], 0)
        : json(route, [project({ applicant: { id: 'u2', fullName: 'رضا کریمی' } })]);
    });
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(
        route,
        project({
          status: 'SUBMITTED',
          applicant: { id: 'u2', fullName: 'رضا کریمی' },
          experts: [
            { expert: { id: 'u3', fullName: 'نرگس کارشناس' }, since: '2026-10-02T08:00:00Z' },
          ],
          access: access({ transitions: ['INITIAL_REVIEW'], edit: false, remove: false }),
          events: [
            {
              fromStatus: null,
              toStatus: 'DRAFT',
              actor: 'applicant',
              note: null,
              createdAt: '2026-10-01T08:00:00Z',
              by: { id: 'u2', fullName: 'رضا کریمی' },
            },
          ],
        }),
      ),
    );

    await page.goto('/dashboard/manage/feasibility');
    await expect(page.getByText(/متقاضی: رضا کریمی/)).toBeVisible();
    expect(queries[0]?.get('scope')).toBe('all');
    await audit(page);

    await page.getByLabel('وضعیت').selectOption('SUBMITTED');
    await expect.poll(() => queries.at(-1)?.get('status')).toBe('SUBMITTED');
    await page.getByRole('button', { name: 'سپرده‌شده به من' }).click();
    await expect(page.getByText('پروژه‌ای یافت نشد')).toBeVisible();
    expect(queries.at(-1)?.get('scope')).toBe('assigned');

    await page.getByRole('button', { name: 'همه پروژه‌ها' }).click();
    await page.getByRole('link', { name: /FP-7K3M9QPD/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/manage\/feasibility\/p1$/);
    await expect(page.getByText('نرگس کارشناس')).toBeVisible();
    // Staff read who acted, and the page changes nothing about the project.
    await expect(page.getByText('متقاضی · رضا کریمی')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ویرایش مشخصات' })).toHaveCount(0);
    await audit(page);
  });

  test('refuses the staff pages to a user without the rights', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/manage/feasibility');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
  });
});
