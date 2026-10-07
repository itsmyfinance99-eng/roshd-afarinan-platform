import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * The pipeline of the feasibility projects for the staff (ST-35.15): the projects of every status
 * with the age of the stage, the filters by sector and expert, the list behind the numbers and
 * the CSV export.
 */

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total } });
const json = (route: Route, data: unknown, total = 1, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: envelope(data, total) });

async function signIn(page: Page, permissions: string[]) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    json(route, {
      id: 'u1',
      email: 'officer@example.com',
      mobile: null,
      fullName: 'مریم احمدی',
      roles: ['user', 'feasibility_officer'],
      permissions,
      emailVerifiedAt: '2026-09-01T00:00:00Z',
      createdAt: '2026-09-01T00:00:00Z',
    }),
  );
}

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical' || v.id === 'heading-order')
    .map((v) => ({ rule: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  expect(blocking, `axe violations on ${page.url()}`).toEqual([]);
}

const STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'INITIAL_REVIEW',
  'NEEDS_MORE_INFO',
  'COST_ESTIMATED',
  'CONTRACT_PENDING',
  'IN_PROGRESS',
  'EXPERT_REVIEW',
  'CLIENT_REVIEW',
  'DELIVERED',
  'ARCHIVED',
];
const ASOF = '2026-10-08T08:00:00Z';
const filled: Record<string, object> = {
  SUBMITTED: { count: 1, oldestSince: '2026-10-08T02:00:00Z', longestDays: 0, averageDays: 0 },
  IN_PROGRESS: { count: 2, oldestSince: '2026-09-28T08:00:00Z', longestDays: 10, averageDays: 6.5 },
};
const pipeline = (over: object = {}) => ({
  total: 3,
  asOf: ASOF,
  stages: STATUSES.map((status) => ({
    status,
    count: 0,
    oldestSince: null,
    longestDays: null,
    averageDays: null,
    ...filled[status],
  })),
  experts: [{ id: '0199c2a4-7b1e-7c3a-9d2f-3b5a6c7d8e9f', fullName: 'سارا رضایی' }],
  ...over,
});
const project = (over: object = {}) => ({
  id: 'p1',
  code: 'FP-7K3M9QPD',
  title: 'کارخانه فرآوری سنگ آهن',
  sector: 'معدنی',
  location: 'یزد',
  status: 'IN_PROGRESS',
  statusSince: '2026-09-28T08:00:00Z',
  createdAt: '2026-09-01T08:00:00Z',
  updatedAt: '2026-10-02T08:00:00Z',
  applicant: { id: 'u2', fullName: 'رضا کریمی' },
  ...over,
});

const MANAGE = ['feasibility:manage'];

test.describe('the pipeline of feasibility projects', () => {
  test('shows every stage with its age and narrows by sector, expert and status', async ({
    page,
  }) => {
    await signIn(page, MANAGE);
    const summaries: URLSearchParams[] = [];
    const lists: URLSearchParams[] = [];
    await page.route('**/api/v1/feasibility-projects/pipeline*', (route) => {
      summaries.push(new URL(route.request().url()).searchParams);
      return json(route, pipeline());
    });
    await page.route('**/api/v1/feasibility-projects?*', (route) => {
      const params = new URL(route.request().url()).searchParams;
      lists.push(params);
      return params.get('queue') === 'review'
        ? json(route, [], 0)
        : json(
            route,
            [
              project(),
              project({ id: 'p2', code: 'FP-2B4D6F8H', statusSince: '2026-10-08T02:00:00Z' }),
            ],
            2,
          );
    });

    await page.goto('/dashboard/manage/feasibility');
    await page.getByRole('button', { name: 'خط لوله' }).click();

    const table = page.getByRole('table', { name: 'تعداد پروژه‌ها و مدت ماندن آن‌ها در هر وضعیت' });
    await expect(table.getByRole('row')).toHaveCount(12);
    await expect(table.getByRole('row', { name: /در حال انجام/ }).getByRole('cell')).toHaveText([
      '۲',
      '۱۰ روز',
      '۶٫۵ روز',
    ]);
    // Less than a day is said; a status without a project has no age at all.
    await expect(table.getByRole('row', { name: /ارسال‌شده/ }).getByRole('cell')).toHaveText([
      '۱',
      'کمتر از یک روز',
      'کمتر از یک روز',
    ]);
    await expect(table.getByRole('row', { name: /تحویل‌شده/ }).getByRole('cell')).toHaveText([
      '۰',
      '—',
      '—',
    ]);
    await expect(page.getByText(/^۳ پروژه/)).toBeVisible();

    // The projects behind the numbers: the longest waiting first, each with its age.
    await expect.poll(() => lists.at(-1)?.get('sort')).toBe('waiting');
    expect(lists.at(-1)?.get('scope')).toBe('all');
    await expect(page.getByRole('link', { name: /FP-7K3M9QPD/ })).toContainText(
      '۱۰ روز در این مرحله',
    );
    await expect(page.getByRole('link', { name: /FP-2B4D6F8H/ })).toContainText(
      'کمتر از یک روز در این مرحله',
    );
    await audit(page);

    await page.getByLabel('حوزه طرح').selectOption('معدنی');
    await page.getByLabel('کارشناس').selectOption({ label: 'سارا رضایی' });
    await expect
      .poll(() => Object.fromEntries(summaries.at(-1) ?? []))
      .toEqual({ sector: 'معدنی', expertId: '0199c2a4-7b1e-7c3a-9d2f-3b5a6c7d8e9f' });
    await expect
      .poll(() => lists.at(-1)?.get('expertId'))
      .toBe('0199c2a4-7b1e-7c3a-9d2f-3b5a6c7d8e9f');
    expect(lists.at(-1)?.get('sector')).toBe('معدنی');

    // A status narrows the list, not the table of the stages.
    await table.getByRole('button', { name: 'در حال انجام' }).click();
    await expect(table.getByRole('button', { name: 'در حال انجام' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('heading', { name: 'پروژه‌های «در حال انجام»' })).toBeVisible();
    await expect.poll(() => lists.at(-1)?.get('status')).toBe('IN_PROGRESS');
    expect(summaries.at(-1)?.get('status')).toBeNull();
    await page.getByRole('button', { name: 'همه وضعیت‌ها' }).click();
    await expect.poll(() => lists.at(-1)?.get('status')).toBeNull();

    await page.getByLabel('کارشناس').selectOption('none');
    await expect.poll(() => summaries.at(-1)?.get('expertId')).toBe('none');
  });

  test('exports the filtered projects as a CSV file and shows a refusal', async ({ page }) => {
    await signIn(page, MANAGE);
    await page.route('**/api/v1/feasibility-projects/pipeline*', (route) =>
      json(route, pipeline()),
    );
    await page.route('**/api/v1/feasibility-projects?*', (route) => json(route, [project()], 1));
    let exportUrl: URL | undefined;
    let refuse = false;
    await page.route('**/api/v1/feasibility-projects/export*', async (route) => {
      exportUrl = new URL(route.request().url());
      if (refuse) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'BAD_REQUEST',
              message: 'تعداد پروژه‌ها بیش از ۱۰٬۰۰۰ است؛ فیلترها را محدودتر کنید.',
              requestId: 't',
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="feasibility-projects-20261008-1130.csv"',
          'X-Export-Rows': '2',
        },
        body: '﻿کد پروژه\r\n',
      });
    });

    await page.goto('/dashboard/manage/feasibility');
    await page.getByRole('button', { name: 'خط لوله' }).click();
    await page.getByLabel('حوزه طرح').selectOption('صنعتی');
    await page.getByRole('table').getByRole('button', { name: 'در حال انجام' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'خروجی Excel (CSV)' }).click();
    expect((await download).suggestedFilename()).toBe('feasibility-projects-20261008-1130.csv');
    await expect(page.getByText('فایل خروجی با ۲ ردیف آماده شد.')).toBeVisible();
    expect(Object.fromEntries(exportUrl?.searchParams ?? [])).toEqual({
      sector: 'صنعتی',
      status: 'IN_PROGRESS',
    });

    refuse = true;
    await page.getByRole('button', { name: 'خروجی Excel (CSV)' }).click();
    await expect(page.getByText(/فیلترها را محدودتر کنید/)).toBeVisible();
    await expect(page.getByText('فایل خروجی با ۲ ردیف آماده شد.')).toHaveCount(0);
  });

  test('shows an empty pipeline and a failed one', async ({ page }) => {
    await signIn(page, MANAGE);
    let broken = false;
    await page.route('**/api/v1/feasibility-projects/pipeline*', (route) =>
      broken
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'خطای داخلی', requestId: 't' },
            }),
          })
        : json(
            route,
            pipeline({
              total: 0,
              experts: [],
              stages: STATUSES.map((status) => ({
                status,
                count: 0,
                oldestSince: null,
                longestDays: null,
                averageDays: null,
              })),
            }),
          ),
    );
    await page.route('**/api/v1/feasibility-projects?*', (route) => json(route, [], 0));

    await page.goto('/dashboard/manage/feasibility');
    await page.getByRole('button', { name: 'خط لوله' }).click();
    await expect(page.getByText(/^۰ پروژه/)).toBeVisible();
    await expect(page.getByText('با این فیلترها پروژه‌ای در خط لوله نیست.')).toBeVisible();
    await expect(page.getByLabel('کارشناس').getByRole('option')).toHaveText([
      'همه کارشناسان',
      'بدون کارشناس',
    ]);

    broken = true;
    await page.getByLabel('حوزه طرح').selectOption('انرژی');
    await expect(page.getByRole('button', { name: 'تلاش دوباره' })).toBeVisible();
    broken = false;
    await page.getByRole('button', { name: 'تلاش دوباره' }).click();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('keeps the chosen expert in the filter when the pipeline fails, and holds the filters during an export', async ({
    page,
  }) => {
    await signIn(page, MANAGE);
    const expert = '0199c2a4-7b1e-7c3a-9d2f-3b5a6c7d8e9f';
    let broken = false;
    await page.route('**/api/v1/feasibility-projects/pipeline*', (route) =>
      broken
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'خطای داخلی', requestId: 't' },
            }),
          })
        : json(route, pipeline()),
    );
    await page.route('**/api/v1/feasibility-projects?*', (route) => json(route, [project()], 1));
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v1/feasibility-projects/export*', async (route) => {
      await held;
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="feasibility-projects-20261008-1130.csv"',
          'X-Export-Rows': '1',
        },
        body: 'کد پروژه\r\n',
      });
    });

    await page.goto('/dashboard/manage/feasibility');
    await page.getByRole('button', { name: 'خط لوله' }).click();
    // The moment the ages are counted to is said with its time, in Iran time.
    await expect(page.getByText(/محاسبه‌شده در ۱۴۰۵\/۰۷\/۱۶.*۱۱:۳۰/)).toBeVisible();
    await expect(
      page.getByText('برای دیدن پروژه‌های یک وضعیت، نام آن را در جدول انتخاب کنید.'),
    ).toBeVisible();

    broken = true;
    await page.getByLabel('کارشناس').selectOption({ label: 'سارا رضایی' });
    await expect(page.getByRole('button', { name: 'تلاش دوباره' })).toBeVisible();
    // The filter still says who the list and the export are narrowed by.
    await expect(page.getByLabel('کارشناس')).toHaveValue(expert);
    await expect(page.getByLabel('کارشناس').locator('option:checked')).toHaveText('سارا رضایی');
    broken = false;
    await page.getByRole('button', { name: 'تلاش دوباره' }).click();
    await expect(page.getByRole('table')).toBeVisible();

    // While a file is prepared its filters stand.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'خروجی Excel (CSV)' }).click();
    await expect(page.getByRole('button', { name: 'در حال آماده‌سازی…' })).toBeDisabled();
    await expect(page.getByLabel('حوزه طرح')).toBeDisabled();
    await expect(page.getByLabel('کارشناس')).toBeDisabled();
    await expect(
      page.getByRole('table').getByRole('button', { name: 'در حال انجام' }),
    ).toBeDisabled();
    release();
    await download;
    await expect(page.getByText('فایل خروجی با ۱ ردیف آماده شد.')).toBeVisible();
    await expect(page.getByLabel('حوزه طرح')).toBeEnabled();
  });

  test('an expert without the staff right is not offered the pipeline', async ({ page }) => {
    await signIn(page, ['feasibility:work']);
    let asked = false;
    await page.route('**/api/v1/feasibility-projects/pipeline*', (route) => {
      asked = true;
      return json(route, pipeline());
    });
    await page.route('**/api/v1/feasibility-projects?*', (route) => json(route, [], 0));
    await page.goto('/dashboard/manage/feasibility');
    await expect(page.getByText('پروژه‌ای یافت نشد')).toBeVisible();
    await expect(page.getByRole('button', { name: 'خط لوله' })).toHaveCount(0);
    expect(asked).toBe(false);
  });
});
