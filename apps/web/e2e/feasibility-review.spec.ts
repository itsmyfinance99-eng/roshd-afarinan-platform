import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * The intake review of feasibility projects (ST-35.07): the review queue of the staff, the steps
 * of the review with a note for the applicant, and the questionnaire with the applicant's
 * answers as staff and experts read it.
 */

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total } });
const json = (route: Route, data: unknown, total = 1, status = 200) =>
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

const event = (toStatus: string, over: object = {}) => ({
  fromStatus: null,
  toStatus,
  actor: 'applicant',
  note: null,
  createdAt: '2026-10-01T08:00:00Z',
  by: { id: 'u2', fullName: 'رضا کریمی' },
  ...over,
});

const project = (status: string, transitions: string[], over: object = {}) => ({
  id: 'p1',
  code: 'FP-7K3M9QPD',
  title: 'کارخانه فرآوری سنگ آهن',
  sector: 'معدنی',
  location: 'یزد',
  summary: 'فرآوری سالانه صد هزار تن سنگ آهن',
  status,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-02T08:00:00Z',
  sourceRequest: null,
  attachments: [],
  applicant: { id: 'u2', fullName: 'رضا کریمی' },
  experts: [],
  events: [event('DRAFT'), event('SUBMITTED', { fromStatus: 'DRAFT' })],
  access: { transitions, edit: false, remove: false, assignExperts: true, releaseExperts: true },
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

const MANAGE = ['feasibility:manage'];

test.describe('the intake review of feasibility projects', () => {
  test.beforeEach(async ({ page }) => {
    // The workspace of the staff and the experts (ST-35.10) asks for these on the staff page.
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) => json(route, []));
    await page.route('**/api/v1/feasibility-projects/experts', (route) => json(route, []));
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

  test('opens on the review queue and narrows it by status', async ({ page }) => {
    await signIn(page, MANAGE);
    const queries: URLSearchParams[] = [];
    await page.route('**/api/v1/feasibility-projects?*', (route) => {
      const params = new URL(route.request().url()).searchParams;
      queries.push(params);
      return params.get('queue') === 'review'
        ? json(route, [project('SUBMITTED', ['INITIAL_REVIEW'])])
        : json(route, [], 0);
    });

    await page.goto('/dashboard/manage/feasibility');
    await expect(page.getByRole('link', { name: /FP-7K3M9QPD/ })).toBeVisible();
    expect(queries[0]?.get('scope')).toBe('all');
    expect(queries[0]?.get('queue')).toBe('review');
    await expect(page.getByRole('button', { name: 'صف بررسی' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The queue knows the statuses of the intake only.
    await expect(page.getByLabel('وضعیت').getByRole('option')).toHaveText([
      'همه وضعیت‌ها',
      'ارسال‌شده',
      'بررسی اولیه',
    ]);
    await page.getByLabel('وضعیت').selectOption('INITIAL_REVIEW');
    await expect.poll(() => queries.at(-1)?.get('status')).toBe('INITIAL_REVIEW');
    expect(queries.at(-1)?.get('queue')).toBe('review');
    await audit(page);

    // The other view is the whole list, and a status of the queue does not follow there.
    await page.getByRole('button', { name: 'همه پروژه‌ها' }).click();
    await expect(page.getByText('پروژه‌ای یافت نشد')).toBeVisible();
    expect(queries.at(-1)?.get('queue')).toBeNull();
    expect(queries.at(-1)?.get('status')).toBeNull();
    await page.getByRole('button', { name: 'صف بررسی' }).click();
    await expect(page.getByRole('link', { name: /FP-7K3M9QPD/ })).toBeVisible();
  });

  test('takes the steps of the review, the explained ones only with a note', async ({ page }) => {
    await signIn(page, MANAGE);
    let current = project('SUBMITTED', ['INITIAL_REVIEW']);
    const sent: { to: string; note?: string }[] = [];
    let refuse = false;
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, current));
    await page.route('**/api/v1/feasibility-projects/p1/transitions', (route) => {
      const body = route.request().postDataJSON() as { to: string; note?: string };
      sent.push(body);
      if (refuse) {
        return fail(route, 409, 'وضعیت پروژه هم‌زمان تغییر کرده است. دوباره تلاش کنید.');
      }
      current =
        body.to === 'INITIAL_REVIEW'
          ? project('INITIAL_REVIEW', ['NEEDS_MORE_INFO', 'COST_ESTIMATED', 'ARCHIVED'])
          : project(body.to, body.to === 'NEEDS_MORE_INFO' ? ['ARCHIVED'] : [], {
              events: [
                event('DRAFT'),
                event('SUBMITTED', { fromStatus: 'DRAFT' }),
                event(body.to, {
                  fromStatus: 'INITIAL_REVIEW',
                  actor: 'staff',
                  note: body.note,
                  by: { id: 'u1', fullName: 'مریم احمدی' },
                }),
              ],
            });
      return json(route, current);
    });

    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByRole('heading', { name: 'بررسی اولیه' })).toBeVisible();
    // Only the step that is the caller's now is offered.
    await expect(page.getByRole('button', { name: 'درخواست اطلاعات تکمیلی' })).toHaveCount(0);
    await audit(page);
    await page.getByRole('button', { name: 'شروع بررسی اولیه' }).click();
    await expect(page.getByText('بررسی اولیه شروع شد.')).toBeVisible();
    expect(sent).toEqual([{ to: 'INITIAL_REVIEW' }]);
    // The step to the cost estimate has a form of its own next to these (ST-35.08).
    await expect(page.getByRole('heading', { name: 'ثبت برآورد هزینه' })).toBeVisible();

    // Asking for more without saying what is caught before anything is sent.
    await page.getByRole('button', { name: 'درخواست اطلاعات تکمیلی' }).click();
    await expect(page.getByText('بنویسید چه اطلاعات یا مدرکی لازم است.')).toBeVisible();
    await expect(page.getByLabel('یادداشت برای متقاضی')).toBeFocused();
    expect(sent).toHaveLength(1);

    // A refusal of the API is shown and the note is kept for another try.
    await page.getByLabel('یادداشت برای متقاضی').fill('جواز تأسیس را بارگذاری کنید.');
    refuse = true;
    await page.getByRole('button', { name: 'درخواست اطلاعات تکمیلی' }).click();
    await expect(page.getByText(/هم‌زمان تغییر کرده است/)).toBeVisible();
    await expect(page.getByLabel('یادداشت برای متقاضی')).toHaveValue(
      'جواز تأسیس را بارگذاری کنید.',
    );
    refuse = false;
    await page.getByRole('button', { name: 'درخواست اطلاعات تکمیلی' }).click();
    await expect(page.getByText('از متقاضی اطلاعات تکمیلی خواسته شد.')).toBeVisible();
    expect(sent.at(-1)).toEqual({ to: 'NEEDS_MORE_INFO', note: 'جواز تأسیس را بارگذاری کنید.' });
    // The note is on the timeline, with who wrote it.
    await expect(page.getByText('جواز تأسیس را بارگذاری کنید.')).toBeVisible();
    await expect(page.getByLabel('یادداشت برای متقاضی')).toHaveValue('');

    // Archiving asks for its reason and for a confirmation.
    await page.getByRole('button', { name: 'بایگانی پروژه' }).click();
    await expect(page.getByText('دلیل بایگانی را برای متقاضی بنویسید.')).toBeVisible();
    await page.getByLabel('یادداشت برای متقاضی').fill('طرح در حوزه فعالیت ما نیست.');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: 'بایگانی پروژه' }).click();
    expect(sent.at(-1)?.to).toBe('NEEDS_MORE_INFO');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'بایگانی پروژه' }).click();
    await expect(page.getByText('پروژه بایگانی شد.')).toBeVisible();
    expect(sent.at(-1)).toEqual({ to: 'ARCHIVED', note: 'طرح در حوزه فعالیت ما نیست.' });
    // Nothing went out for the steps without a note or for the dismissed confirmation.
    expect(sent.map((body) => body.to)).toEqual([
      'INITIAL_REVIEW',
      'NEEDS_MORE_INFO',
      'NEEDS_MORE_INFO',
      'ARCHIVED',
    ]);
    // Nothing is left to do with an archived project.
    await expect(page.getByLabel('یادداشت برای متقاضی')).toHaveCount(0);
  });

  test('shows staff the answers of the applicant, to read and to add to', async ({ page }) => {
    await signIn(page, MANAGE);
    const added: unknown[] = [];
    const base = '**/api/v1/feasibility-projects/p1/questionnaire';
    let current = {
      template: { id: 't1', title: 'پرسشنامه عمومی طرح توجیهی', version: 2, isDemo: true },
      definition: {
        sections: [
          {
            key: 'plan',
            title: 'مشخصات طرح',
            questions: [
              { key: 'product', type: 'text', label: 'محصول اصلی', required: true },
              {
                key: 'company_type',
                type: 'single_choice',
                label: 'نوع شرکت',
                options: [
                  { value: 'private', label: 'سهامی خاص' },
                  { value: 'public', label: 'سهامی عام' },
                ],
              },
            ],
          },
        ],
        documents: [],
      },
      items: [
        {
          id: 'i1',
          key: 'item_note',
          kind: 'NOTE',
          origin: 'applicant',
          createdAt: '2026-10-02T08:00:00Z',
          removable: false,
          text: 'زمین طرح در اختیار شرکت است.',
          addedBy: { id: 'u2', fullName: 'رضا کریمی' },
        },
      ] as object[],
      answers: { product: 'کنسانتره سنگ آهن', company_type: 'private' },
      answeredAt: '2026-10-02T08:00:00Z',
      missingDocuments: [],
      access: { start: false, answer: false, addItems: true },
    };
    await page.route(base, (route) => json(route, current));
    await page.route(`${base}/items`, (route) => {
      const body = route.request().postDataJSON() as { kind: string; document?: { label: string } };
      added.push(body);
      current = {
        ...current,
        items: [
          ...current.items,
          {
            id: 'i2',
            key: 'item_doc',
            kind: 'DOCUMENT',
            origin: 'staff',
            createdAt: '2026-10-03T08:00:00Z',
            removable: true,
            document: { key: 'item_doc', label: body.document?.label },
            addedBy: { id: 'u1', fullName: 'مریم احمدی' },
          },
        ],
      };
      return json(route, current, 1, 201);
    });

    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project('INITIAL_REVIEW', ['NEEDS_MORE_INFO', 'ARCHIVED'])),
    );
    await page.goto('/dashboard/manage/feasibility/p1');
    await page.getByRole('link', { name: /پرسشنامه و پاسخ‌های متقاضی/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/manage\/feasibility\/p1\/questionnaire$/);

    // The answers are read, in the words of a reader, and cannot be changed.
    await expect(
      page.getByText('پاسخ‌های متقاضی را می‌خوانید؛ فقط متقاضی آن‌ها را تغییر می‌دهد.'),
    ).toBeVisible();
    await expect(page.getByLabel('محصول اصلی')).toHaveValue('کنسانتره سنگ آهن');
    await expect(page.getByLabel('محصول اصلی')).toBeDisabled();
    await expect(page.getByLabel('سهامی خاص')).toBeChecked();
    await expect(page.getByRole('button', { name: 'بررسی کامل بودن پرسشنامه' })).toHaveCount(0);
    await audit(page);

    // Staff add what the review needs; what the applicant added is named as theirs.
    await page.getByRole('button', { name: /۲\. موارد اختصاصی و مدارک/ }).click();
    await expect(page.getByText('افزوده متقاضی')).toBeVisible();
    await expect(page.getByText('افزوده شما')).toHaveCount(0);
    await expect(page.getByText(/متقاضی از آن باخبر می‌شود/)).toBeVisible();
    await page.getByLabel('نوع مورد').selectOption('DOCUMENT');
    await page.getByLabel('عنوان مدرک').fill('استعلام شرکت برق');
    await page.getByRole('button', { name: 'افزودن', exact: true }).click();
    await expect(page.getByText('استعلام شرکت برق')).toBeVisible();
    expect(added).toEqual([{ kind: 'DOCUMENT', document: { label: 'استعلام شرکت برق' } }]);
    await expect(page.getByText('افزوده کارشناسان')).toBeVisible();
    await expect(page.getByRole('link', { name: /بازگشت به پروژه/ })).toHaveAttribute(
      'href',
      '/dashboard/manage/feasibility/p1',
    );
  });

  test('gives an assigned expert the project to read and no step of the review', async ({
    page,
  }) => {
    await signIn(page, ['feasibility:work']);
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(
        route,
        project('INITIAL_REVIEW', [], {
          access: {
            transitions: [],
            edit: false,
            remove: false,
            assignExperts: false,
            releaseExperts: false,
          },
        }),
      ),
    );
    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByRole('link', { name: /پرسشنامه و پاسخ‌های متقاضی/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'بررسی اولیه', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('یادداشت برای متقاضی')).toHaveCount(0);
  });

  test('is closed to a user without the rights', async ({ page }) => {
    await signIn(page, []);
    await page.goto('/dashboard/manage/feasibility/p1/questionnaire');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
  });
});
