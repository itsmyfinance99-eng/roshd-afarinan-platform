import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * The review cycle of a feasibility study (ST-35.11): the experts send the study to their
 * review and on to the applicant, either side sends it back to the work, and every party writes
 * comments in threads on the parts of the study.
 */

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 10, total } });
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
  transitions: [] as string[],
  edit: false,
  remove: false,
  assignExperts: false,
  releaseExperts: false,
  createModel: false,
  addNote: false,
  comment: false,
};

const STARTED = {
  fromStatus: 'CONTRACT_PENDING',
  toStatus: 'IN_PROGRESS',
  actor: 'staff',
  note: null,
  createdAt: '2026-10-06T08:00:00Z',
};

const project = (status: string, access: Partial<typeof ACCESS>, over: object = {}) => ({
  id: 'p1',
  code: 'FP-7K3M9QPD',
  title: 'کارخانه فرآوری سنگ آهن',
  sector: 'معدنی',
  location: 'یزد',
  summary: 'فرآوری سالانه صد هزار تن سنگ آهن',
  status,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-06T08:00:00Z',
  sourceRequest: null,
  attachments: [],
  costEstimate: null,
  events: [STARTED],
  access: { ...ACCESS, ...access },
  ...over,
});

/** What the staff and the experts get beside what the applicant gets. */
const STAFF = {
  applicant: { id: 'u2', fullName: 'رضا کریمی' },
  experts: [],
  financialModel: null,
  events: [{ ...STARTED, by: { id: 'u9', fullName: 'نرگس کارشناس' } }],
};

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorAs: string;
  mine: boolean;
  by?: { id: string; fullName: string } | null;
}

interface Thread {
  id: string;
  section: string;
  shared: boolean;
  createdAt: string;
  handledAt: string | null;
  handledBy?: { id: string; fullName: string } | null;
  comments: Comment[];
  access: { reply: boolean; handle: boolean; reopen: boolean };
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

test.describe('the review cycle of a feasibility study', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/feasibility-projects/p1/documents', (route) =>
      json(route, { slots: [], access: { upload: false } }),
    );
    await page.route('**/api/v1/feasibility-projects/p1/contract', (route) =>
      json(route, { files: [], access: { upload: false, confirm: false } }),
    );
    await page.route('**/api/v1/feasibility-projects/p1/questionnaire', (route) =>
      fail(route, 404, 'پرسشنامه‌ای برای این پروژه نیست.'),
    );
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) =>
      json(route, [], 200, 0),
    );
    await page.route('**/api/v1/feasibility-projects/experts', (route) => json(route, []));
  });

  test('takes the study to the review of the experts, to the applicant and back', async ({
    page,
  }) => {
    await signIn(page, ['feasibility:work']);
    let current = project('IN_PROGRESS', { transitions: ['EXPERT_REVIEW'] }, STAFF);
    let refuse = true;
    const sent: unknown[] = [];
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) =>
      json(route, [], 200, 0),
    );
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, current));
    await page.route('**/api/v1/feasibility-projects/p1/transitions', (route) => {
      const body = route.request().postDataJSON() as { to: string };
      sent.push(body);
      if (refuse) return fail(route, 409, 'وضعیت پروژه هم‌زمان تغییر کرده است. دوباره تلاش کنید.');
      current =
        body.to === 'EXPERT_REVIEW'
          ? project('EXPERT_REVIEW', { transitions: ['IN_PROGRESS', 'CLIENT_REVIEW'] }, STAFF)
          : body.to === 'CLIENT_REVIEW'
            ? project('CLIENT_REVIEW', {}, STAFF)
            : project('IN_PROGRESS', { transitions: ['EXPERT_REVIEW'] }, STAFF);
      return json(route, current);
    });

    await page.goto('/dashboard/manage/feasibility/p1');
    const cycle = page.getByRole('form', { name: 'چرخه بازبینی' });
    await expect(cycle.getByRole('button')).toHaveText(['ارسال برای بازبینی کارشناس']);
    await expect(cycle.getByText(/متقاضی، کارشناسان و کارکنان پروژه این یادداشت را/)).toBeVisible();
    await audit(page);

    // What the API refuses is said, and the note stays.
    const note = cycle.getByLabel('یادداشت این گام (اختیاری)');
    await note.fill('پیش‌نویس کامل شد.');
    await cycle.getByRole('button', { name: 'ارسال برای بازبینی کارشناس' }).click();
    await expect(cycle.getByText(/هم‌زمان تغییر کرده است/)).toBeVisible();
    await expect(note).toHaveValue('پیش‌نویس کامل شد.');

    refuse = false;
    await cycle.getByRole('button', { name: 'ارسال برای بازبینی کارشناس' }).click();
    await expect(cycle.getByText('مطالعه برای بازبینی کارشناس فرستاده شد.')).toBeVisible();
    await expect(note).toHaveValue('');
    await expect(cycle.getByRole('button')).toHaveText([
      'ارسال برای بازبینی متقاضی',
      'برگرداندن به انجام کار',
    ]);

    // Back to the work, and to the review again.
    await cycle.getByRole('button', { name: 'برگرداندن به انجام کار' }).click();
    await expect(cycle.getByText('مطالعه به مرحله انجام برگشت.')).toBeVisible();
    await cycle.getByRole('button', { name: 'ارسال برای بازبینی کارشناس' }).click();

    // Sending the study to the applicant is confirmed first.
    const toClient = cycle.getByRole('button', { name: 'ارسال برای بازبینی متقاضی' });
    page.once('dialog', (dialog) => void dialog.dismiss());
    await toClient.click();
    expect(sent).toHaveLength(4);
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe('مطالعه برای بازبینی متقاضی فرستاده شود؟');
      void dialog.accept();
    });
    await toClient.click();
    // The expert has no further step; what was done is still said.
    await expect(page.getByText('مطالعه برای بازبینی متقاضی فرستاده شد.')).toBeVisible();
    await expect(page.getByRole('form', { name: 'چرخه بازبینی' })).toHaveCount(0);
    expect(sent).toEqual([
      { to: 'EXPERT_REVIEW', note: 'پیش‌نویس کامل شد.' },
      { to: 'EXPERT_REVIEW', note: 'پیش‌نویس کامل شد.' },
      { to: 'IN_PROGRESS' },
      { to: 'EXPERT_REVIEW' },
      { to: 'CLIENT_REVIEW' },
    ]);
  });

  test('lets the staff write, share, answer and handle review comments', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    const ME = { id: 'u1', fullName: 'مریم احمدی' };
    let threads: Thread[] = [
      {
        id: 't1',
        section: 'market',
        shared: true,
        createdAt: '2026-10-07T08:00:00Z',
        handledAt: null,
        handledBy: null,
        comments: [
          {
            id: 'c1',
            body: 'رقم فروش سال دوم کم است.',
            createdAt: '2026-10-07T08:00:00Z',
            authorAs: 'applicant',
            mine: false,
            by: { id: 'u2', fullName: 'رضا کریمی' },
          },
        ],
        access: { reply: true, handle: true, reopen: false },
      },
    ];
    const queries: string[] = [];
    const started: unknown[] = [];
    const answered: unknown[] = [];
    const states: unknown[] = [];
    let refuse = true;
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project('EXPERT_REVIEW', { comment: true, addNote: true }, STAFF)),
    );
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) => {
      const url = new URL(route.request().url());
      queries.push(url.search);
      const state = url.searchParams.get('state');
      const section = url.searchParams.get('section');
      const rows = threads.filter(
        (thread) =>
          (!section || thread.section === section) &&
          (!state || (state === 'handled') === (thread.handledAt !== null)),
      );
      return json(route, rows, 200, rows.length);
    });
    await page.route('**/api/v1/feasibility-projects/p1/review-threads', (route) => {
      const body = route.request().postDataJSON() as { section: string; body: string };
      started.push(body);
      if (refuse) {
        return fail(route, 400, 'اطلاعات واردشده معتبر نیست.', [
          { path: 'body', message: 'حداکثر ۴۰۰۰ نویسه مجاز است.' },
        ]);
      }
      const thread: Thread = {
        id: 't2',
        section: body.section,
        shared: false,
        createdAt: '2026-10-07T09:00:00Z',
        handledAt: null,
        handledBy: null,
        comments: [
          {
            id: 'c2',
            body: body.body,
            createdAt: '2026-10-07T09:00:00Z',
            authorAs: 'staff',
            mine: true,
            by: ME,
          },
        ],
        access: { reply: true, handle: true, reopen: false },
      };
      threads = [thread, ...threads];
      return json(route, thread, 201);
    });
    await page.route('**/api/v1/feasibility-projects/p1/review-threads/t1/comments', (route) => {
      const body = route.request().postDataJSON() as { body: string };
      answered.push(body);
      threads = threads.map((thread) =>
        thread.id === 't1'
          ? {
              ...thread,
              comments: [
                ...thread.comments,
                {
                  id: 'c3',
                  body: body.body,
                  createdAt: '2026-10-07T10:00:00Z',
                  authorAs: 'staff',
                  mine: true,
                  by: ME,
                },
              ],
            }
          : thread,
      );
      return json(
        route,
        threads.find((thread) => thread.id === 't1'),
        201,
      );
    });
    await page.route('**/api/v1/feasibility-projects/p1/review-threads/t1/handled', (route) => {
      const body = route.request().postDataJSON() as { handled: boolean };
      states.push([route.request().method(), body]);
      threads = threads.map((thread) =>
        thread.id === 't1'
          ? {
              ...thread,
              handledAt: body.handled ? '2026-10-07T11:00:00Z' : null,
              handledBy: body.handled ? ME : null,
              access: { reply: true, handle: !body.handled, reopen: body.handled },
            }
          : thread,
      );
      return json(
        route,
        threads.find((thread) => thread.id === 't1'),
      );
    });

    await page.goto('/dashboard/manage/feasibility/p1');
    const section = page.locator('section[aria-labelledby="threads-title"]');
    const first = section.getByRole('article', { name: 'تحلیل بازار و بازاریابی' });
    await expect(first.getByText('متقاضی · رضا کریمی')).toBeVisible();
    await expect(first.getByText('باز', { exact: true })).toBeVisible();
    await expect(first.getByText('مشترک با متقاضی')).toBeVisible();
    await audit(page);

    // Nothing is sent without a text.
    const form = section.getByRole('form', { name: 'نظر تازه' });
    const text = form.getByLabel('متن نظر');
    await form.getByRole('button', { name: 'ثبت نظر' }).click();
    await expect(text).toHaveAttribute('aria-invalid', 'true');
    await expect(text).toBeFocused();
    expect(started).toEqual([]);

    // What the API refuses is said at the field, and the text stays.
    await form.getByLabel('بخش مطالعه').selectOption('financial');
    await text.fill('نرخ تنزیل منبع ندارد.');
    await form.getByRole('button', { name: 'ثبت نظر' }).click();
    await expect(form.getByText('حداکثر ۴۰۰۰ نویسه مجاز است.')).toBeVisible();
    await expect(text).toHaveValue('نرخ تنزیل منبع ندارد.');

    refuse = false;
    await form.getByRole('button', { name: 'ثبت نظر' }).click();
    await expect(form.getByText('نظر ثبت شد.')).toBeVisible();
    await expect(text).toHaveValue('');
    // Not shared unless the box is ticked.
    expect(started.at(-1)).toEqual({
      section: 'financial',
      body: 'نرخ تنزیل منبع ندارد.',
      shared: false,
    });
    const mine = section.getByRole('article', { name: 'تحلیل مالی و ارزیابی سرمایه‌گذاری' });
    await expect(mine.getByText('داخلی')).toBeVisible();
    await expect(mine.getByText('کارکنان · مریم احمدی')).toBeVisible();

    // An answer, then the handled state and back.
    await first.getByLabel('پاسخ به نظر «تحلیل بازار و بازاریابی»').fill('اصلاح شد.');
    await first.getByRole('button', { name: 'ثبت پاسخ' }).click();
    await expect(first.getByText('اصلاح شد.')).toBeVisible();
    expect(answered).toEqual([{ body: 'اصلاح شد.' }]);
    await first.getByRole('button', { name: 'رسیدگی شد' }).click();
    await expect(first.getByText('رسیدگی‌شده')).toBeVisible();
    await expect(first.getByText(/رسیدگی: مریم احمدی/)).toBeVisible();
    await first.getByRole('button', { name: 'باز کردن دوباره' }).click();
    await expect(first.getByRole('button', { name: 'رسیدگی شد' })).toBeVisible();
    expect(states).toEqual([
      ['PUT', { handled: true }],
      ['PUT', { handled: false }],
    ]);

    // The filters ask the API, and an empty answer says why it is empty.
    await section.getByLabel('وضعیت رسیدگی').selectOption('handled');
    await expect(section.getByText('نظری با این بخش و وضعیت پیدا نشد.')).toBeVisible();
    await section.getByLabel('وضعیت رسیدگی').selectOption('');
    await section.getByLabel('بخش', { exact: true }).selectOption('market');
    await expect(section.getByRole('article')).toHaveCount(1);
    expect(queries.at(-1)).toBe('?page=1&pageSize=10&section=market');
    await audit(page);
  });

  test('lets the applicant comment on the study and send it back', async ({ page }) => {
    await signIn(page, []);
    let current = project('CLIENT_REVIEW', {
      transitions: ['IN_PROGRESS', 'DELIVERED'],
      comment: true,
    });
    let threads: Thread[] = [
      {
        id: 't1',
        section: 'general',
        shared: true,
        createdAt: '2026-10-07T08:00:00Z',
        handledAt: '2026-10-07T09:00:00Z',
        comments: [
          {
            id: 'c1',
            body: 'نام شرکت را اصلاح کنید.',
            createdAt: '2026-10-07T08:00:00Z',
            authorAs: 'applicant',
            mine: true,
          },
          {
            id: 'c2',
            body: 'اصلاح شد.',
            createdAt: '2026-10-07T08:30:00Z',
            authorAs: 'expert',
            mine: false,
          },
        ],
        access: { reply: true, handle: false, reopen: true },
      },
    ];
    const started: unknown[] = [];
    const states: unknown[] = [];
    const sent: unknown[] = [];
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, current));
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) =>
      json(route, threads, 200, threads.length),
    );
    await page.route('**/api/v1/feasibility-projects/p1/review-threads', (route) => {
      const body = route.request().postDataJSON() as { section: string; body: string };
      started.push(body);
      const thread: Thread = {
        id: 't2',
        section: body.section,
        shared: true,
        createdAt: '2026-10-07T10:00:00Z',
        handledAt: null,
        comments: [
          {
            id: 'c3',
            body: body.body,
            createdAt: '2026-10-07T10:00:00Z',
            authorAs: 'applicant',
            mine: true,
          },
        ],
        access: { reply: true, handle: false, reopen: false },
      };
      threads = [thread, ...threads];
      return json(route, thread, 201);
    });
    await page.route('**/api/v1/feasibility-projects/p1/review-threads/t1/handled', (route) => {
      states.push(route.request().postDataJSON());
      threads = threads.map((thread) =>
        thread.id === 't1'
          ? { ...thread, handledAt: null, access: { reply: true, handle: false, reopen: false } }
          : thread,
      );
      return json(
        route,
        threads.find((thread) => thread.id === 't1'),
      );
    });
    await page.route('**/api/v1/feasibility-projects/p1/transitions', (route) => {
      sent.push(route.request().postDataJSON());
      current = project('IN_PROGRESS', {});
      threads = threads.map((thread) => ({
        ...thread,
        access: { ...thread.access, reopen: false },
      }));
      return json(route, current);
    });

    await page.goto('/dashboard/feasibility/p1');
    await expect(page.getByText(/مطالعه در مرحله بازبینی شما است/)).toBeVisible();
    const section = page.locator('section[aria-labelledby="threads-title"]');
    const old = section.getByRole('article', { name: 'کل مطالعه' });
    // The applicant reads who wrote in which capacity, not the names, and shares nothing.
    await expect(old.getByText(/^شما ·/)).toBeVisible();
    await expect(old.getByText(/^کارشناس ·/)).toBeVisible();
    await expect(old.getByText('رسیدگی‌شده')).toBeVisible();
    await expect(old.getByText('مشترک با متقاضی')).toHaveCount(0);
    await expect(old.getByRole('button', { name: 'رسیدگی شد' })).toHaveCount(0);
    const form = section.getByRole('form', { name: 'نظر تازه' });
    await expect(form.getByRole('checkbox')).toHaveCount(0);
    await audit(page);

    await form.getByLabel('بخش مطالعه').selectOption('location');
    await form.getByLabel('متن نظر').fill('ساختگاه تغییر کرده است.');
    await form.getByRole('button', { name: 'ثبت نظر' }).click();
    await expect(form.getByText('نظر ثبت شد.')).toBeVisible();
    expect(started).toEqual([{ section: 'location', body: 'ساختگاه تغییر کرده است.' }]);
    await expect(
      section.getByRole('article', { name: 'مکان، ساختگاه و محیط زیست' }).getByText('باز', {
        exact: true,
      }),
    ).toBeVisible();

    // A comment of their own that was not dealt with is opened again.
    await old.getByRole('button', { name: 'باز کردن دوباره' }).click();
    await expect(old.getByText('باز', { exact: true })).toBeVisible();
    expect(states).toEqual([{ handled: false }]);

    // The study goes back to the work; the delivery is not offered here.
    const cycle = page.getByRole('form', { name: 'بازبینی مطالعه' });
    await expect(cycle.getByRole('button')).toHaveText(['درخواست اصلاح مطالعه']);
    await cycle.getByLabel('یادداشت این گام (اختیاری)').fill('ساختگاه را اصلاح کنید.');
    await cycle.getByRole('button', { name: 'درخواست اصلاح مطالعه' }).click();
    await expect(page.getByText('مطالعه برای اصلاح برگردانده شد.')).toBeVisible();
    expect(sent).toEqual([{ to: 'IN_PROGRESS', note: 'ساختگاه را اصلاح کنید.' }]);
    // Back at work the threads stay, and no new one is started.
    await expect(section.getByRole('article')).toHaveCount(2);
    await expect(section.getByRole('form', { name: 'نظر تازه' })).toHaveCount(0);
    await audit(page);
  });

  test('lets the staff deliver the approved report and file the study away', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    let current = project('CLIENT_REVIEW', { transitions: ['IN_PROGRESS', 'DELIVERED'] }, STAFF);
    let approved = false;
    const sent: unknown[] = [];
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) =>
      json(route, [], 200, 0),
    );
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, current));
    await page.route('**/api/v1/feasibility-projects/p1/transitions', (route) => {
      const body = route.request().postDataJSON() as { to: string };
      sent.push(body);
      if (body.to === 'DELIVERED' && !approved) {
        return fail(
          route,
          409,
          'گزارش پس از تأیید مسئول امکان‌سنجی و تأیید نهایی مدیر تحویل می‌شود.',
        );
      }
      current =
        body.to === 'DELIVERED'
          ? project('DELIVERED', { transitions: ['ARCHIVED'] }, STAFF)
          : project('ARCHIVED', {}, STAFF);
      return json(route, current);
    });

    await page.goto('/dashboard/manage/feasibility/p1');
    const cycle = page.getByRole('form', { name: 'چرخه بازبینی و تحویل' });
    await expect(cycle.getByRole('button')).toHaveText([
      'برگرداندن به انجام کار',
      'تحویل گزارش نهایی به متقاضی',
    ]);

    // Without both approvals the API refuses, and the page says why.
    page.once('dialog', (dialog) => void dialog.accept());
    await cycle.getByRole('button', { name: 'تحویل گزارش نهایی به متقاضی' }).click();
    await expect(cycle.getByText(/تأیید نهایی مدیر تحویل می‌شود/)).toBeVisible();

    approved = true;
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('گزارش نهایی به متقاضی تحویل شود؟');
      void dialog.accept();
    });
    await cycle.getByRole('button', { name: 'تحویل گزارش نهایی به متقاضی' }).click();
    // The cycle has no further step; what was done is still said.
    await expect(page.getByText('گزارش نهایی به متقاضی تحویل شد.')).toBeVisible();
    await expect(page.getByRole('form', { name: 'چرخه بازبینی و تحویل' })).toHaveCount(0);
    // The delivered study is filed away with the step the page had before: one button, not two.
    await expect(page.getByRole('button', { name: 'بایگانی پروژه' })).toHaveCount(1);
    await audit(page);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'بایگانی پروژه' }).click();
    await expect
      .poll(() => sent)
      .toEqual([{ to: 'DELIVERED' }, { to: 'DELIVERED' }, { to: 'ARCHIVED' }]);
    await expect(page.getByRole('button', { name: 'بایگانی پروژه' })).toHaveCount(0);
  });

  test('does not offer the delivery to the applicant', async ({ page }) => {
    await signIn(page, []);
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) =>
      json(route, [], 200, 0),
    );
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project('CLIENT_REVIEW', { transitions: ['IN_PROGRESS', 'DELIVERED'] })),
    );
    await page.goto('/dashboard/feasibility/p1');
    const cycle = page.getByRole('form', { name: 'بازبینی مطالعه' });
    await expect(cycle.getByRole('button')).toHaveText(['درخواست اصلاح مطالعه']);
  });
});
