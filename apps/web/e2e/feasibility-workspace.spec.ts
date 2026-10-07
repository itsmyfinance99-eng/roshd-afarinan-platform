import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * The workspace of a feasibility project (ST-35.10): staff assign and release its experts, and
 * the staff and the assigned experts reach the financial model of the study and write internal
 * notes for each other.
 */

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total } });
const json = (route: Route, data: unknown, status = 200, total = 1) =>
  route.fulfill({ status, contentType: 'application/json', body: envelope(data, total) });
const fail = (route: Route, status: number, message: string, details: object[] = []) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'ERROR', message, details, requestId: 't' } }),
  });

async function signIn(page: Page, permissions: string[]) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    json(route, {
      id: 'u1',
      email: 'user@example.com',
      mobile: null,
      fullName: 'مریم احمدی',
      roles: ['user'],
      permissions,
      emailVerifiedAt: '2026-09-01T00:00:00Z',
      createdAt: '2026-09-01T00:00:00Z',
    }),
  );
}

const ACCESS = {
  transitions: [],
  edit: false,
  remove: false,
  assignExperts: false,
  releaseExperts: false,
  createModel: false,
  addNote: false,
};

const project = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  code: 'FP-7K3M9QPD',
  title: 'کارخانه فرآوری سنگ آهن',
  sector: 'معدنی',
  location: 'یزد',
  summary: 'فرآوری سالانه صد هزار تن سنگ آهن',
  status: 'IN_PROGRESS',
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-06T08:00:00Z',
  sourceRequest: null,
  attachments: [],
  costEstimate: null,
  applicant: { id: 'u2', fullName: 'رضا کریمی' },
  experts: [],
  financialModel: null,
  events: [
    {
      fromStatus: 'CONTRACT_PENDING',
      toStatus: 'IN_PROGRESS',
      actor: 'staff',
      note: null,
      createdAt: '2026-10-06T08:00:00Z',
      by: { id: 'u1', fullName: 'مریم احمدی' },
    },
  ],
  access: ACCESS,
  ...over,
});

const NARGES = { id: 'e1', fullName: 'نرگس کارشناس' };
const SARA = { id: 'e2', fullName: 'سارا مدل‌ساز' };

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical' || v.id === 'heading-order')
    .map((v) => ({ rule: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  expect(blocking, `axe violations on ${page.url()}`).toEqual([]);
}

test.describe('the workspace of a feasibility project', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) =>
      json(route, []),
    );
    await page.route('**/api/v1/feasibility-projects/p1/documents', (route) =>
      json(route, { slots: [], access: { upload: false } }),
    );
    await page.route('**/api/v1/feasibility-projects/p1/contract', (route) =>
      json(route, { files: [], access: { upload: false, confirm: false } }),
    );
  });

  test('lets staff assign and release the experts of a project', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    let experts: { expert: typeof NARGES; since: string }[] = [];
    let refuse = true;
    const sent: unknown[] = [];
    const released: string[] = [];
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) =>
      json(route, [], 200, 0),
    );
    await page.route('**/api/v1/feasibility-projects/experts', (route) =>
      json(route, [NARGES, SARA]),
    );
    const current = () =>
      project({
        experts,
        access: { ...ACCESS, assignExperts: true, releaseExperts: true, addNote: true },
      });
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, current()));
    await page.route('**/api/v1/feasibility-projects/p1/experts', (route) => {
      sent.push(route.request().postDataJSON());
      if (refuse) {
        return fail(route, 400, 'اطلاعات واردشده معتبر نیست.', [
          { path: 'expertId', message: 'این کاربر مجوز کار روی پروژه‌های امکان‌سنجی را ندارد.' },
        ]);
      }
      experts = [{ expert: NARGES, since: '2026-10-06T09:00:00Z' }];
      return json(route, current());
    });
    await page.route('**/api/v1/feasibility-projects/p1/experts/e1', (route) => {
      released.push(route.request().method());
      experts = [];
      return json(route, current());
    });

    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByText('هنوز کارشناسی به این پروژه سپرده نشده است.')).toBeVisible();
    const pick = page.getByLabel('سپردن به کارشناس');
    await expect(pick.getByRole('option')).toHaveText([
      'انتخاب کنید…',
      'نرگس کارشناس',
      'سارا مدل‌ساز',
    ]);
    await audit(page);

    // Nothing is sent without a choice.
    const assign = page.getByRole('button', { name: 'سپردن پروژه' });
    await assign.click();
    await expect(pick).toHaveAttribute('aria-invalid', 'true');
    await expect(pick).toBeFocused();
    expect(sent).toEqual([]);

    // What the API refuses is said at the field, and the choice stays.
    await pick.selectOption('e1');
    await assign.click();
    await expect(
      page.getByText('این کاربر مجوز کار روی پروژه‌های امکان‌سنجی را ندارد.'),
    ).toBeVisible();
    await expect(pick).toHaveValue('e1');

    refuse = false;
    await assign.click();
    await expect(page.getByText('پروژه به کارشناس سپرده شد و به او اطلاع داده شد.')).toBeVisible();
    expect(sent).toEqual([{ expertId: 'e1' }, { expertId: 'e1' }]);
    const list = page.locator('section[aria-labelledby="experts-title"] ul');
    await expect(list.getByText('نرگس کارشناس')).toBeVisible();
    // Who works on the project is not offered again.
    await expect(pick.getByRole('option')).toHaveText(['انتخاب کنید…', 'سارا مدل‌ساز']);

    // Ending an assignment is confirmed first, in words that say what the expert loses.
    const end = page.getByRole('button', { name: 'پایان کار نرگس کارشناس روی پروژه' });
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('دیگر به پروژه، مدارک و مدل مالی آن دسترسی نخواهد داشت');
      void dialog.dismiss();
    });
    await end.click();
    expect(released).toEqual([]);
    page.once('dialog', (dialog) => void dialog.accept());
    await end.click();
    await expect(page.getByText('کار نرگس کارشناس روی این پروژه پایان یافت.')).toBeVisible();
    expect(released).toEqual(['DELETE']);
    await expect(page.getByText('هنوز کارشناسی به این پروژه سپرده نشده است.')).toBeVisible();
    await audit(page);
  });

  test('makes the financial model of the study and leads to its editor', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    let model: { id: string } | null = null;
    let refuse = true;
    let made = 0;
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) =>
      json(route, [], 200, 0),
    );
    const current = () =>
      project({ financialModel: model, access: { ...ACCESS, createModel: model === null } });
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, current()));
    await page.route('**/api/v1/feasibility-projects/p1/financial-model', (route) => {
      made += 1;
      if (refuse) return fail(route, 503, 'سرویس در دسترس نیست.');
      model = { id: 'm1' };
      return json(route, current(), 201);
    });

    await page.goto('/dashboard/manage/feasibility/p1');
    const section = page.locator('section[aria-labelledby="model-title"]');
    await expect(section.getByText(/این پروژه هنوز مدل مالی ندارد/)).toBeVisible();
    const create = section.getByRole('button', { name: 'ساخت مدل مالی' });
    await create.click();
    await expect(section.getByText('سرویس در دسترس نیست.')).toBeVisible();

    refuse = false;
    await create.click();
    await expect(section.getByText('مدل مالی مطالعه ساخته شد.')).toBeVisible();
    expect(made).toBe(2);
    await expect(section.getByRole('link', { name: /ورودی‌های مدل مالی/ })).toHaveAttribute(
      'href',
      '/dashboard/models/m1',
    );
    await expect(section.getByRole('link', { name: /اجراهای محاسبه/ })).toHaveAttribute(
      'href',
      '/dashboard/models/m1/runs',
    );
    await expect(create).toHaveCount(0);
    await audit(page);
  });

  test('keeps internal notes for the staff and the experts', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    let notes: object[] = [];
    let refuse = true;
    const sent: unknown[] = [];
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project({ access: { ...ACCESS, addNote: true } })),
    );
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) =>
      json(route, notes, 200, notes.length),
    );
    await page.route('**/api/v1/feasibility-projects/p1/notes', (route) => {
      const body = route.request().postDataJSON() as { body: string };
      sent.push(body);
      if (refuse)
        return fail(route, 409, 'حداکثر تعداد یادداشت‌های داخلی این پروژه نوشته شده است.');
      const note = {
        id: `n${notes.length + 1}`,
        body: body.body,
        createdAt: '2026-10-06T10:00:00Z',
        author: { id: 'u1', fullName: 'مریم احمدی' },
      };
      notes = [note, ...notes];
      return json(route, note, 201);
    });

    await page.goto('/dashboard/manage/feasibility/p1');
    const section = page.locator('section[aria-labelledby="notes-title"]');
    await expect(section.getByText('هنوز یادداشتی برای این پروژه نوشته نشده است.')).toBeVisible();
    await expect(section.getByText(/متقاضی آن‌ها را نمی‌بیند/)).toBeVisible();

    // An empty note is not sent.
    const field = section.getByLabel('یادداشت تازه');
    const save = section.getByRole('button', { name: 'ثبت یادداشت' });
    await field.fill('   ');
    await save.click();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toBeFocused();
    expect(sent).toEqual([]);

    // A refusal keeps what was written.
    await field.fill('مدارک ثبتی ناقص است.\nبا متقاضی تماس گرفته شد.');
    await save.click();
    await expect(section.getByText(/حداکثر تعداد یادداشت‌های داخلی/)).toBeVisible();
    await expect(field).toHaveValue(/مدارک ثبتی ناقص است/);

    refuse = false;
    await save.click();
    await expect(section.getByText('یادداشت ثبت شد.')).toBeVisible();
    await expect(field).toHaveValue('');
    expect(sent.at(-1)).toEqual({ body: 'مدارک ثبتی ناقص است.\nبا متقاضی تماس گرفته شد.' });
    const item = section.getByRole('listitem');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('مریم احمدی');
    await expect(item).toContainText('با متقاضی تماس گرفته شد.');
    await audit(page);
  });

  test('gives an assigned expert the workspace without the rights of the staff', async ({
    page,
  }) => {
    await signIn(page, ['feasibility:work']);
    let candidates = 0;
    await page.route('**/api/v1/feasibility-projects/experts', (route) => {
      candidates += 1;
      return fail(route, 403, 'اجازه دسترسی ندارید.');
    });
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) =>
      json(route, [
        {
          id: 'n1',
          body: 'نرخ تنزیل را از دفتر بپرسید.',
          createdAt: '2026-10-06T10:00:00Z',
          author: { id: 'u9', fullName: 'علی مسئول' },
        },
        { id: 'n0', body: 'یادداشت قدیمی', createdAt: '2026-10-05T10:00:00Z', author: null },
      ]),
    );
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(
        route,
        project({
          experts: [
            { expert: { id: 'u1', fullName: 'مریم احمدی' }, since: '2026-10-06T09:00:00Z' },
          ],
          financialModel: { id: 'm1' },
          access: { ...ACCESS, transitions: ['EXPERT_REVIEW'], addNote: true },
        }),
      ),
    );

    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByRole('link', { name: /پرسشنامه و پاسخ‌های متقاضی/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'مدارک پروژه' })).toBeVisible();
    await expect(page.getByRole('link', { name: /ورودی‌های مدل مالی/ })).toBeVisible();
    const experts = page.locator('section[aria-labelledby="experts-title"]');
    await expect(experts.getByText('مریم احمدی')).toBeVisible();
    // The experts are the staff's to change.
    await expect(experts.getByRole('button')).toHaveCount(0);
    await expect(page.getByLabel('سپردن به کارشناس')).toHaveCount(0);
    expect(candidates).toBe(0);
    // The contract is not an expert's to read.
    await expect(page.getByRole('heading', { name: 'قرارداد', exact: true })).toHaveCount(0);

    const notes = page.locator('section[aria-labelledby="notes-title"]');
    await expect(notes.getByText('نرخ تنزیل را از دفتر بپرسید.')).toBeVisible();
    await expect(notes.getByText(/علی مسئول/)).toBeVisible();
    await expect(notes.getByText(/کاربر حذف‌شده/)).toBeVisible();
    await expect(notes.getByLabel('یادداشت تازه')).toBeVisible();
    await audit(page);
  });

  test('shows staff nothing of the workspace on a project of their own', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    let asked = 0;
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) => {
      asked += 1;
      return fail(route, 403, 'یادداشت‌های داخلی پروژه را فقط کارشناسان و کارکنان می‌بینند.');
    });
    await page.route('**/api/v1/feasibility-projects/p1', (route) => {
      const {
        applicant: _applicant,
        experts: _experts,
        financialModel: _model,
        ...own
      } = project();
      return json(route, own);
    });

    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByText('خود شما')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'یادداشت‌های داخلی' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'مدل مالی مطالعه' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'کارشناسان پروژه' })).toHaveCount(0);
    expect(asked).toBe(0);
  });

  test('says when the notes of a project cannot be read, and reads them again', async ({
    page,
  }) => {
    await signIn(page, ['feasibility:manage']);
    let broken = true;
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, project()));
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) =>
      broken ? fail(route, 500, 'خطای داخلی سرور.') : json(route, [], 200, 0),
    );

    await page.goto('/dashboard/manage/feasibility/p1');
    const section = page.locator('section[aria-labelledby="notes-title"]');
    await expect(section.getByText('خطای داخلی سرور.')).toBeVisible();
    // A project that takes no note (archived) has no form for one.
    await expect(section.getByLabel('یادداشت تازه')).toHaveCount(0);
    broken = false;
    await section.getByRole('button', { name: 'تلاش دوباره' }).click();
    await expect(section.getByText('هنوز یادداشتی برای این پروژه نوشته نشده است.')).toBeVisible();
  });

  test('leads from the model of a project back to the project', async ({ page }) => {
    await signIn(page, ['feasibility:work']);
    const methods: string[] = [];
    await page.route('**/api/v1/financial-models/m1', (route) => {
      methods.push(route.request().method());
      return json(route, {
        id: 'm1',
        title: 'مدل مالی کارخانه فرآوری سنگ آهن',
        version: 1,
        schemaVersion: 1,
        createdAt: '2026-10-06T09:00:00Z',
        updatedAt: '2026-10-06T09:00:00Z',
        inputs: {},
        projectId: 'p1',
        assignee: null,
        // The project of this model is archived.
        access: { edit: false, approve: false, assign: false, remove: false },
      });
    });

    await page.goto('/dashboard/models/m1');
    await expect(page.getByRole('link', { name: /بازگشت به پروژه/ })).toHaveAttribute(
      'href',
      '/dashboard/manage/feasibility/p1',
    );
    await expect(page.getByRole('link', { name: /بازگشت به فهرست/ })).toHaveCount(0);
    await expect(page.getByText(/پروژه این مدل بایگانی شده است/)).toBeVisible();
    // Nothing of a closed model is sent: no save of a change, and no run to store.
    await expect(page.getByText(/این مدل فقط خواندنی است/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'ثبت اجرای محاسبه' })).toHaveCount(0);
    await page.getByLabel('عنوان مدل').fill('عنوانی دیگر برای مدل');
    await page.waitForTimeout(2500);
    expect(methods).toEqual(['GET']);
    await expect(page.getByText(/در جای دیگری تغییر کرده است/)).toHaveCount(0);
  });

  test('fits a phone without scrolling sideways', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.route('**/api/v1/feasibility-projects/experts', (route) =>
      json(route, [NARGES, SARA]),
    );
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) =>
      json(route, [
        {
          id: 'n1',
          body: 'یادداشتی بلند درباره وضعیت مدارک و هماهنگی‌های انجام‌شده با متقاضی پروژه',
          createdAt: '2026-10-06T10:00:00Z',
          author: { id: 'u9', fullName: 'علی مسئول' },
        },
      ]),
    );
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(
        route,
        project({
          experts: [{ expert: NARGES, since: '2026-10-06T09:00:00Z' }],
          financialModel: { id: 'm1' },
          access: { ...ACCESS, assignExperts: true, releaseExperts: true, addNote: true },
        }),
      ),
    );
    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByRole('button', { name: 'ثبت یادداشت' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
