import { expect, type Page, test } from '@playwright/test';

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total } });
const json = (data: unknown, total = 1) => ({
  status: 200,
  contentType: 'application/json',
  body: envelope(data, total),
});

async function signIn(page: Page, permissions: string[], roles: string[]) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill(
      json({
        id: 'u1',
        email: 'staff@example.com',
        mobile: null,
        fullName: 'سرپرست پشتیبانی',
        roles,
        permissions,
        createdAt: '2026-09-01T00:00:00Z',
      }),
    ),
  );
}

const staff = [
  { id: 'u1', fullName: 'سرپرست پشتیبانی' },
  { id: 'u2', fullName: 'نرگس کارشناس' },
];

const request = (assignee: { id: string; fullName: string } | null) => ({
  id: 'r1',
  trackingCode: 'RA-7K3M9QPD',
  type: 'FEASIBILITY',
  status: 'NEW',
  fullName: 'مریم احمدی',
  mobile: '09121234567',
  email: null,
  subject: null,
  message: 'طرح فرآوری سنگ آهن',
  details: {},
  createdAt: '2026-09-20T10:00:00Z',
  updatedAt: '2026-09-21T10:00:00Z',
  assignee,
  attachments: [],
  events: [{ fromStatus: null, toStatus: 'NEW', note: null, createdAt: '2026-09-20T10:00:00Z' }],
});

const ticket = (assignee: { id: string; fullName: string } | null) => ({
  id: 't1',
  code: 'TK-7K3M9Q',
  subject: 'پیگیری درخواست',
  category: 'REQUEST',
  priority: 'NORMAL',
  status: 'OPEN',
  lastMessageAt: '2026-09-25T10:00:00Z',
  createdAt: '2026-09-25T09:00:00Z',
  assignee,
  messages: [
    {
      id: 'm1',
      fromStaff: false,
      internal: false,
      body: 'وضعیت درخواست من چیست؟',
      createdAt: '2026-09-25T09:00:00Z',
      authorName: null,
    },
  ],
  attachments: [],
});

test.describe('assignment', () => {
  test('a support lead assigns a request to an expert', async ({ page }) => {
    await signIn(page, ['requests:read-all', 'requests:manage'], ['user', 'support']);
    let current: (typeof staff)[number] | null = null;
    let sent: unknown;
    await page.route('**/api/v1/service-requests/r1', (route) =>
      route.fulfill(json(request(current))),
    );
    await page.route('**/api/v1/service-requests/assignees', (route) =>
      route.fulfill(json(staff, staff.length)),
    );
    await page.route('**/api/v1/service-requests/r1/assignee', async (route) => {
      sent = route.request().postDataJSON();
      current = staff[1] ?? null;
      await route.fulfill(json(request(current)));
    });

    await page.goto('/dashboard/manage/requests/r1');
    const submit = page.getByRole('button', { name: 'ثبت ارجاع' });
    await expect(submit).toBeDisabled();
    await page.getByLabel('کارشناس').selectOption({ label: 'نرگس کارشناس' });
    await submit.click();
    await expect(page.getByText('ارجاع ثبت شد.')).toBeVisible();
    expect(sent).toEqual({ assigneeId: 'u2' });
    await expect(page.getByLabel('کارشناس')).toHaveValue('u2');
  });

  test('the "assigned to me" filter narrows the request queue', async ({ page }) => {
    await signIn(page, ['requests:read-all'], ['user', 'expert']);
    const queries: URLSearchParams[] = [];
    await page.route('**/api/v1/service-requests?*', (route) => {
      const params = new URL(route.request().url()).searchParams;
      queries.push(params);
      const mine = params.get('assignee') === 'me';
      return route.fulfill(json(mine ? [request(staff[0] ?? null)] : [], mine ? 1 : 0));
    });

    await page.goto('/dashboard/manage/requests');
    await page.getByRole('button', { name: 'ارجاع‌شده به من' }).click();
    await expect(page.getByText(/کارشناس: سرپرست پشتیبانی/)).toBeVisible();
    expect(queries.at(-1)?.get('assignee')).toBe('me');
    expect(queries.at(-1)?.get('page')).toBe('1');
  });

  test('staff without the manage permission see the assignee read-only', async ({ page }) => {
    await signIn(page, ['requests:read-all'], ['user', 'expert']);
    await page.route('**/api/v1/service-requests/r1', (route) =>
      route.fulfill(json(request(staff[1] ?? null))),
    );
    await page.goto('/dashboard/manage/requests/r1');
    await expect(page.getByText('نرگس کارشناس')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ثبت ارجاع' })).toHaveCount(0);
  });

  test('unassigning a ticket shows API errors', async ({ page }) => {
    await signIn(page, ['tickets:read-all', 'tickets:reply'], ['user', 'support']);
    let sent: unknown;
    await page.route('**/api/v1/tickets/t1', (route) =>
      route.fulfill(json(ticket(staff[1] ?? null))),
    );
    await page.route('**/api/v1/tickets/assignees', (route) =>
      route.fulfill(json(staff, staff.length)),
    );
    await page.route('**/api/v1/tickets/t1/assignee', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'CONFLICT',
            message: 'کارشناس این تیکت هم‌زمان تغییر کرده است. دوباره تلاش کنید.',
            details: [],
          },
          meta: { requestId: 't' },
        }),
      });
    });

    await page.goto('/dashboard/manage/tickets/t1');
    await expect(page.getByLabel('کارشناس')).toHaveValue('u2');
    await page.getByLabel('کارشناس').selectOption({ label: 'بدون ارجاع' });
    await page.getByRole('button', { name: 'ثبت ارجاع' }).click();
    await expect(page.getByText('کارشناس این تیکت هم‌زمان تغییر کرده است.')).toBeVisible();
    expect(sent).toEqual({ assigneeId: null });
  });
});
