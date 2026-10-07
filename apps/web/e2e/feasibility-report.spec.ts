import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * The report of a feasibility study (ST-35.12): the staff arrange report templates, the staff
 * and the assigned experts write the draft and issue versions, and the applicant reads the
 * newest version.
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

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical' || v.id === 'heading-order')
    .map((v) => ({ rule: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  expect(blocking, `axe violations on ${page.url()}`).toEqual([]);
}

const ACCESS = {
  transitions: [],
  edit: false,
  remove: false,
  assignExperts: false,
  releaseExperts: false,
  createModel: false,
  addNote: false,
  comment: false,
  report: true,
};

const project = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  code: 'FP-7K3M9QPD',
  title: 'کارخانه فرآوری سنگ آهن',
  sector: 'معدنی',
  location: 'یزد',
  summary: null,
  status: 'IN_PROGRESS',
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-06T08:00:00Z',
  sourceRequest: null,
  attachments: [],
  costEstimate: null,
  applicant: { id: 'u2', fullName: 'رضا کریمی' },
  experts: [],
  financialModel: { id: 'm1' },
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

const RUN = {
  id: 'r1',
  number: 3,
  modelVersion: 7,
  engineVersion: '0.7.0',
  inputHash: 'abc',
  createdAt: '2026-10-05T08:00:00Z',
  approvedAt: '2026-10-05T10:00:00Z',
};

const chapter = (key: string, kind: string, title: string, over: object = {}) => ({
  key,
  kind,
  title,
  guidance: null,
  body: '',
  answerKeys: [],
  version: 1,
  updatedAt: '2026-10-06T08:00:00Z',
  updatedBy: null,
  ...over,
});

const QUESTIONS = [
  { key: 'capacity', label: 'ظرفیت سالانه', type: 'number', answered: true },
  { key: 'land', label: 'وضعیت زمین', type: 'single_choice', answered: false },
];
const TEMPLATES = [{ id: 't1', name: 'قالب صنایع معدنی' }];

const version = (over: Record<string, unknown> = {}) => ({
  number: 2,
  issuedAt: '2026-10-07T09:00:00Z',
  contentHash: 'f'.repeat(64),
  project: {
    code: 'FP-7K3M9QPD',
    title: 'کارخانه فرآوری سنگ آهن',
    sector: 'معدنی',
    location: 'یزد',
  },
  run: { ...RUN, id: undefined },
  chapters: [
    {
      key: 'market',
      kind: 'text',
      title: 'تحلیل بازار و بازاریابی',
      body: '## اندازه بازار\n\nبازار داخلی **رو به رشد** است.',
      answers: [
        {
          key: 'capacity',
          label: 'ظرفیت سالانه',
          value: { kind: 'number', value: '100000', unit: 'تن' },
        },
        { key: 'land', label: 'وضعیت زمین', value: { kind: 'none' } },
        {
          key: 'products',
          label: 'محصولات',
          value: {
            kind: 'table',
            columns: ['نام', 'از تاریخ'],
            rows: [
              [
                { kind: 'text', text: 'کنسانتره' },
                { kind: 'date', value: '2027-03-21' },
              ],
            ],
          },
        },
      ],
    },
    {
      key: 'financial',
      kind: 'financial',
      title: 'تحلیل مالی و ارزیابی سرمایه‌گذاری',
      body: '',
      answers: [],
      parts: [
        {
          id: 'summary',
          title: 'خلاصه و شاخص‌ها',
          blocks: [
            {
              kind: 'pairs',
              title: 'شاخص‌های کل سرمایه',
              rows: [{ label: 'خالص ارزش فعلی', value: { text: '۳۳۰٫۸' } }],
            },
            { kind: 'list', title: 'هشدارهای محاسبه', items: ['کسری نقدی در سال نخست'] },
          ],
        },
        {
          id: 'income',
          title: 'سود و زیان',
          blocks: [
            {
              kind: 'table',
              title: 'صورت سود و زیان',
              note: 'مبلغ‌ها به میلیون IRR',
              columns: [
                { label: '۱۴۰۶/۱۲', group: 'ساخت' },
                { label: '۱۴۰۷/۱۲', group: 'تولید' },
              ],
              sections: [
                {
                  rows: [
                    {
                      label: 'درآمد فروش',
                      strong: true,
                      values: [{ text: '۰' }, { text: '۱٬۰۰۰' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  note: 'اصلاح فصل بازار',
  issuedBy: { id: 'u1', fullName: 'مریم احمدی' },
  ...over,
});

test.describe('the report of a feasibility project', () => {
  test('lets an expert start the report, choose the run, write a chapter and issue a version', async ({
    page,
  }) => {
    await signIn(page, ['feasibility:work']);
    let report: Record<string, unknown> | null = null;
    let versions: object[] = [];
    let saves = 0;
    const sent: Record<string, unknown[]> = {
      start: [],
      template: [],
      run: [],
      chapter: [],
      issue: [],
    };
    const draft = () => ({
      report,
      runs: [RUN],
      questions: QUESTIONS,
      templates: TEMPLATES,
      access: { edit: true, issue: report !== null },
    });
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, project()));
    await page.route('**/api/v1/feasibility-projects/p1/report', (route) => {
      if (route.request().method() === 'POST') {
        sent.start!.push(route.request().postDataJSON());
        report = {
          template: TEMPLATES[0],
          run: null,
          chapters: [
            chapter('market', 'text', 'تحلیل بازار و بازاریابی', {
              guidance: 'اندازه بازار و رقبا را بنویسید.',
            }),
            chapter('financial', 'financial', 'تحلیل مالی و ارزیابی سرمایه‌گذاری'),
          ],
          excluded: [],
          createdAt: '2026-10-06T08:00:00Z',
          updatedAt: '2026-10-06T08:00:00Z',
        };
        return json(route, draft(), 201);
      }
      return json(route, draft());
    });
    await page.route('**/api/v1/feasibility-projects/p1/report/template', (route) => {
      sent.template!.push(route.request().postDataJSON());
      report = { ...report, template: null };
      return json(route, draft());
    });
    await page.route('**/api/v1/feasibility-projects/p1/report/run', (route) => {
      sent.run!.push(route.request().postDataJSON());
      report = { ...report, run: RUN };
      return json(route, draft());
    });
    await page.route('**/api/v1/feasibility-projects/p1/report/chapters/market', (route) => {
      const body = route.request().postDataJSON() as { version: number; body: string };
      sent.chapter!.push(body);
      saves += 1;
      if (saves === 1) {
        // A colleague saved the chapter a moment earlier: it is at version 2 now.
        report = {
          ...report,
          chapters: [
            chapter('market', 'text', 'تحلیل بازار و بازاریابی', {
              body: 'متن همکار',
              version: 2,
              updatedBy: { id: 'u9', fullName: 'نرگس کارشناس' },
            }),
            chapter('financial', 'financial', 'تحلیل مالی و ارزیابی سرمایه‌گذاری'),
          ],
        };
        return fail(route, 409, 'این فصل پس از بازشدن در ویرایشگر شما تغییر کرده است.');
      }
      return json(
        route,
        chapter('market', 'text', 'تحلیل بازار و بازاریابی', {
          body: body.body,
          answerKeys: ['capacity'],
          version: body.version + 1,
          updatedBy: { id: 'u1', fullName: 'مریم احمدی' },
        }),
      );
    });
    await page.route('**/api/v1/feasibility-projects/p1/report/versions', (route) => {
      if (route.request().method() !== 'POST') return json(route, versions);
      sent.issue!.push(route.request().postDataJSON());
      if (sent.issue!.length === 1) {
        return fail(route, 400, 'گزارش برای صدور کامل نیست.', [
          { path: 'runId', message: 'اجرای تأییدشده‌ای را انتخاب کنید.' },
        ]);
      }
      const issued = {
        number: 1,
        contentHash: 'a'.repeat(64),
        createdAt: '2026-10-07T09:00:00Z',
        note: 'نسخه نخست',
        issuedBy: { id: 'u1', fullName: 'مریم احمدی' },
      };
      versions = [issued];
      return json(route, issued, 201);
    });

    // The project page of the staff and the experts leads to the report.
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) =>
      json(route, [], 200, 0),
    );
    await page.route('**/api/v1/feasibility-projects/p1/documents', (route) =>
      json(route, { slots: [], access: { upload: false } }),
    );
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) =>
      json(route, [], 200, 0),
    );
    await page.goto('/dashboard/manage/feasibility/p1');
    await page.getByRole('link', { name: 'گزارش مطالعه: پیش‌نویس و نسخه‌ها ‹' }).click();
    await expect(page).toHaveURL(/\/dashboard\/manage\/feasibility\/p1\/report$/);

    // Start with a template.
    await expect(page.getByText('هنوز نسخه‌ای از این گزارش صادر نشده است.')).toBeVisible();
    await page.getByLabel('قالب گزارش').selectOption('t1');
    await page.getByRole('button', { name: 'شروع گزارش' }).click();
    await expect(page.getByText('قالب کنونی: قالب صنایع معدنی')).toBeVisible();
    expect(sent.start).toEqual([{ templateId: 't1' }]);
    await expect(page.getByText('اجرای کنونی: انتخاب نشده است')).toBeVisible();
    await audit(page);

    // Issuing an incomplete draft says what is missing.
    await page.getByRole('button', { name: 'صدور نسخه تازه' }).click();
    await expect(page.getByText('گزارش برای صدور کامل نیست.')).toBeVisible();
    await expect(page.getByText('اجرای تأییدشده‌ای را انتخاب کنید.')).toBeVisible();

    // The run: only the approved ones are offered.
    await page.getByLabel('اجرای تأییدشده').selectOption('r1');
    await page.getByRole('button', { name: 'ثبت اجرا' }).click();
    await expect(page.getByText(/اجرای کنونی: اجرای شماره ۳/)).toBeVisible();
    expect(sent.run).toEqual([{ runId: 'r1' }]);
    await expect(page.getByText('اجرای محاسبه گزارش ثبت شد.')).toBeVisible();

    // A chapter: text and quoted answers. A colleague saved it meanwhile: the save is refused,
    // nothing is issued over unsaved text, and the newer text is loaded before writing on.
    await expect(page.getByText('اندازه بازار و رقبا را بنویسید.')).toBeVisible();
    const market = page.getByRole('form', { name: /تحلیل بازار و بازاریابی/ });
    const save = market.getByRole('button', { name: 'ذخیره فصل' });
    const text = page.getByLabel('متن فصل «تحلیل بازار و بازاریابی»', { exact: true });
    const quote = async () => {
      await market.getByText(/پاسخ‌های منتخب پرسشنامه/).click();
      await market.getByLabel('ظرفیت سالانه', { exact: true }).check();
    };
    await expect(save).toBeDisabled();
    await text.fill('بازار رو به رشد است.');
    await quote();
    await expect(page.getByText('تغییر ذخیره‌نشده دارد.')).toBeVisible();
    await save.click();
    await expect(page.getByText(/همکار دیگری این فصل را ذخیره کرده است/)).toBeVisible();
    // With unsaved text nothing is issued, no other structure is taken, and a link of the
    // dashboard asks before it leaves the page.
    const unsaved =
      /نخست فصل‌هایی را که تغییر ذخیره‌نشده دارند ذخیره کنید: «تحلیل بازار و بازاریابی»/;
    await page.getByRole('button', { name: 'صدور نسخه تازه' }).click();
    await expect(page.getByRole('form', { name: 'صدور نسخه' }).getByText(unsaved)).toBeVisible();
    await page.getByLabel('گرفتن فصل‌ها از قالب', { exact: true }).selectOption('');
    await page.getByRole('button', { name: 'اعمال قالب' }).click();
    await expect(
      page.getByRole('region', { name: 'ساختار گزارش' }).getByText(unsaved),
    ).toBeVisible();
    expect(sent.template).toEqual([]);
    const asked: string[] = [];
    page.once('dialog', (dialog) => {
      asked.push(dialog.message());
      void dialog.dismiss();
    });
    await page.getByRole('link', { name: 'بازگشت به پروژه ‹' }).click();
    expect(asked).toEqual([expect.stringContaining('تغییر ذخیره‌نشده')]);
    await expect(page).toHaveURL(/\/report$/);
    await page.getByRole('button', { name: 'کنار گذاشتن متن من و بارگذاری نسخه تازه' }).click();
    await expect(text).toHaveValue('متن همکار');
    await expect(page.getByText(/آخرین ذخیره: نرگس کارشناس/)).toBeVisible();
    await expect(save).toBeDisabled();
    await text.fill('بازار رو به رشد است.');
    await market.getByLabel('ظرفیت سالانه', { exact: true }).check();
    await save.click();
    await expect(page.getByText('فصل ذخیره شد.')).toBeVisible();
    await expect(page.getByText(/آخرین ذخیره: مریم احمدی/)).toBeVisible();
    expect(sent.chapter).toEqual([
      { version: 1, body: 'بازار رو به رشد است.', answerKeys: ['capacity'] },
      { version: 2, body: 'بازار رو به رشد است.', answerKeys: ['capacity'] },
    ]);
    await expect(save).toBeDisabled();
    // Everything is saved: now the structure can be changed, and the message stays.
    await page.getByRole('button', { name: 'اعمال قالب' }).click();
    await expect(page.getByText('ساختار گزارش به‌روز شد.')).toBeVisible();
    await expect(page.getByText('قالب کنونی: ساختار استاندارد')).toBeVisible();
    expect(sent.template).toEqual([{ templateId: null }]);
    // The preview opens beside the editor, so that the forms stay as they are.
    await expect(page.getByRole('link', { name: /پیش‌نمایش گزارش و کمبودهای آن/ })).toHaveAttribute(
      'target',
      '_blank',
    );

    // Issue: the version joins the list.
    await page.getByLabel('یادداشت این نسخه (اختیاری)').fill('نسخه نخست');
    await page.getByRole('button', { name: 'صدور نسخه تازه' }).click();
    await expect(page.getByText('نسخه ۱ گزارش صادر شد.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'نسخه ۱ ‹' })).toHaveAttribute(
      'href',
      '/dashboard/manage/feasibility/p1/report/versions/1',
    );
    expect(sent.issue).toEqual([{ note: '' }, { note: 'نسخه نخست' }]);
    await audit(page);
  });

  test('shows a version with its text, quoted answers and schedules, and its review threads', async ({
    page,
  }) => {
    await signIn(page, ['feasibility:manage']);
    const asked: string[] = [];
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project({ status: 'EXPERT_REVIEW', access: { ...ACCESS, comment: true } })),
    );
    await page.route('**/api/v1/feasibility-projects/p1/report/versions/2?*', (route) => {
      asked.push(new URL(route.request().url()).searchParams.get('unit') ?? '');
      return json(route, version());
    });
    const threads: string[] = [];
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) => {
      threads.push(new URL(route.request().url()).searchParams.get('section') ?? '');
      return json(route, [], 200, 0);
    });

    await page.goto('/dashboard/manage/feasibility/p1/report/versions/2');
    await expect(page.getByRole('heading', { name: '۱. تحلیل بازار و بازاریابی' })).toBeVisible();

    // The PDF of the version: the server writes it and answers with a signed address.
    let fileStatus = 503;
    let fileUrl = 'https://example.org/api/v1/files/f1/content?exp=1&sig=s';
    const fileAsked: string[] = [];
    await page.route('**/api/v1/feasibility-projects/p1/report/versions/2/file', (route) => {
      fileAsked.push(route.request().method());
      return fileStatus === 200
        ? json(route, {
            number: 2,
            fileName: 'feasibility-report-FS-1-v2.pdf',
            size: 1234,
            sha256: 'ab'.repeat(32),
            createdAt: '2026-10-07T09:00:00Z',
            url: fileUrl,
            expiresAt: '2026-10-07T09:05:00Z',
          })
        : route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'SERVICE_UNAVAILABLE', message: 'فایل‌های زیادی در صف ساخت است.' },
              meta: { requestId: 't' },
            }),
          });
    });
    await page.route('**/api/v1/files/f1/content?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'content-disposition': 'attachment; filename="report.pdf"' },
        body: '%PDF-1.3',
      }),
    );
    await page.getByRole('button', { name: 'دریافت PDF نسخه ۲' }).click();
    await expect(page.getByText('فایل‌های زیادی در صف ساخت است.')).toBeVisible();
    // An address that is not a file of this site is never followed.
    fileStatus = 200;
    await page.getByRole('button', { name: 'دریافت PDF نسخه ۲' }).click();
    await expect(page.getByText('نشانی دریافت فایل معتبر نیست. دوباره تلاش کنید.')).toBeVisible();
    await expect(page).toHaveURL(/\/report\/versions\/2$/);
    fileUrl = '/api/v1/files/f1/content?exp=1&sig=s';
    const saved = page.waitForEvent('download');
    await page.getByRole('button', { name: 'دریافت PDF نسخه ۲' }).click();
    // The browser saves what the signed address of the answer serves.
    expect((await saved).url()).toContain('/api/v1/files/f1/content?exp=1&sig=s');
    await expect(page.getByText(/فایل PDF نسخه ۲ آماده شد/)).toBeVisible();
    await expect(page.getByText('ab'.repeat(32))).toBeVisible();
    await expect(page.getByText('فایل‌های زیادی در صف ساخت است.')).toHaveCount(0);
    expect(fileAsked).toEqual(['POST', 'POST', 'POST']);
    await expect(page.getByText(/نسخه ۲، صادرشده در/)).toBeVisible();
    await expect(page.getByText('اصلاح فصل بازار')).toBeVisible();
    await expect(page.getByText(/اجرای شماره ۳ مدل مالی/)).toBeVisible();
    // Markdown is rendered, the answers are quoted in Persian digits.
    await expect(page.getByRole('heading', { name: 'اندازه بازار', level: 3 })).toBeVisible();
    await expect(page.getByText('۱۰۰٬۰۰۰ تن')).toBeVisible();
    await expect(page.getByText('پاسخی ثبت نشده است')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'کنسانتره' })).toBeVisible();
    // The schedules of the run: the first part is open, the others open on demand.
    await expect(page.getByText('خالص ارزش فعلی')).toBeVisible();
    await page.getByText('سود و زیان', { exact: true }).click();
    await expect(page.getByRole('rowheader', { name: 'درآمد فروش' })).toBeVisible();
    await audit(page);

    await page.getByLabel('واحد نمایش مبلغ‌ها').selectOption('1000');
    await expect.poll(() => asked).toEqual(['1000000', '1000']);

    // The threads of a chapter open on that chapter.
    await page.getByRole('button', { name: /نظرهای بازبینی این فصل.*تحلیل مالی/ }).click();
    await expect(page.getByLabel('بخش', { exact: true })).toHaveValue('financial');
    await expect(page.getByLabel('بخش', { exact: true })).toBeFocused();
    await expect.poll(() => threads.at(-1)).toBe('financial');
    const again = page.getByRole('button', { name: /نظرهای بازبینی این فصل.*تحلیل مالی/ });
    await again.focus();
    await again.click();
    await expect(page.getByLabel('بخش', { exact: true })).toBeFocused();
  });

  test('shows a closed draft read-only, and says when there is no approved run', async ({
    page,
  }) => {
    await signIn(page, ['feasibility:work']);
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project({ status: 'DELIVERED' })),
    );
    await page.route('**/api/v1/feasibility-projects/p1/report/versions', (route) =>
      json(route, []),
    );
    await page.route('**/api/v1/feasibility-projects/p1/report', (route) =>
      json(route, {
        report: {
          template: null,
          run: null,
          chapters: [
            chapter('market', 'text', 'تحلیل بازار و بازاریابی', { body: 'متن ذخیره‌شده' }),
          ],
          excluded: [{ key: 'location', title: 'مکان، ساختگاه و محیط زیست', hasText: true }],
          createdAt: '2026-10-06T08:00:00Z',
          updatedAt: '2026-10-06T08:00:00Z',
        },
        runs: [],
        questions: [],
        templates: [],
        access: { edit: false, issue: false },
      }),
    );
    await page.goto('/dashboard/manage/feasibility/p1/report');
    await expect(page.getByText(/پیش‌نویس فقط خوانده می‌شود/)).toBeVisible();
    const text = page.getByLabel('متن فصل «تحلیل بازار و بازاریابی»', { exact: true });
    await expect(text).toHaveValue('متن ذخیره‌شده');
    await expect(text).not.toBeEditable();
    await expect(page.getByRole('button', { name: 'ذخیره فصل' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'اعمال قالب' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'صدور نسخه تازه' })).toHaveCount(0);
    await expect(page.getByText('مکان، ساختگاه و محیط زیست (متن دارد)')).toBeVisible();
    await expect(page.getByText(/مدل مالی این پروژه هنوز اجرای تأییدشده‌ای ندارد/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'اجراهای محاسبه ‹' })).toHaveAttribute(
      'href',
      '/dashboard/models/m1/runs',
    );
    await audit(page);
  });

  test('shows the preview of the draft with what is still missing', async ({ page }) => {
    await signIn(page, ['feasibility:work']);
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, project()));
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) =>
      json(route, [], 200, 0),
    );
    await page.route('**/api/v1/feasibility-projects/p1/report/preview?*', (route) =>
      json(
        route,
        version({
          number: null,
          issuedAt: null,
          contentHash: null,
          note: undefined,
          issuedBy: undefined,
          run: null,
          chapters: [version().chapters[0]],
          issues: [{ path: 'runId', message: 'اجرای تأییدشده‌ای را انتخاب کنید.' }],
          omitted: [{ key: 'economic', title: 'تحلیل اقتصادی' }],
        }),
      ),
    );
    await page.goto('/dashboard/manage/feasibility/p1/report/preview');
    await expect(page.getByText('پیش‌نمایش پیش‌نویس (صادر نشده)')).toBeVisible();
    await expect(page.getByText('این پیش‌نویس هنوز قابل صدور نیست:')).toBeVisible();
    await expect(page.getByText('اجرای تأییدشده‌ای را انتخاب کنید.')).toBeVisible();
    await expect(page.getByText(/«تحلیل اقتصادی»/)).toBeVisible();
    // A file belongs to an issued version: the preview has none.
    await expect(page.getByRole('button', { name: /دریافت PDF/ })).toHaveCount(0);
    // Without a run there are no amounts to choose a unit for.
    await expect(page.getByLabel('واحد نمایش مبلغ‌ها')).toHaveCount(0);
    await audit(page);
  });

  test('gives the applicant the newest version, or says that there is none yet', async ({
    page,
  }) => {
    await signIn(page, []);
    let versions: object[] = [];
    const mine = project({
      status: 'CLIENT_REVIEW',
      applicant: undefined,
      experts: undefined,
      financialModel: undefined,
      access: { ...ACCESS, comment: true },
    });
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, mine));
    await page.route('**/api/v1/feasibility-projects/p1/report/versions', (route) =>
      json(route, versions),
    );
    await page.route('**/api/v1/feasibility-projects/p1/report/versions/2?*', (route) =>
      json(route, version({ note: undefined, issuedBy: undefined })),
    );
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) =>
      json(route, [], 200, 0),
    );

    await page.goto('/dashboard/feasibility/p1/report');
    await expect(page.getByText('گزارشی برای خواندن نیست')).toBeVisible();

    versions = [{ number: 2, contentHash: 'f'.repeat(64), createdAt: '2026-10-07T09:00:00Z' }];
    await page.reload();
    await expect(page.getByRole('heading', { name: '۱. تحلیل بازار و بازاریابی' })).toBeVisible();
    // The applicant can take the PDF of the version they read.
    const asked: string[] = [];
    await page.route('**/api/v1/feasibility-projects/p1/report/versions/2/file', (route) => {
      asked.push(route.request().method());
      return json(route, {
        number: 2,
        fileName: 'feasibility-report-FS-1-v2.pdf',
        size: 1234,
        sha256: 'cd'.repeat(32),
        createdAt: '2026-10-07T09:00:00Z',
        url: '/api/v1/files/f2/content?exp=1&sig=s',
        expiresAt: '2026-10-07T09:05:00Z',
      });
    });
    await page.route('**/api/v1/files/f2/content?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'content-disposition': 'attachment; filename="report.pdf"' },
        body: '%PDF-1.3',
      }),
    );
    const mineSaved = page.waitForEvent('download');
    await page.getByRole('button', { name: 'دریافت PDF نسخه ۲' }).click();
    await mineSaved;
    await expect(page.getByText('cd'.repeat(32))).toBeVisible();
    expect(asked).toEqual(['POST']);
    // Nothing of the staff: no note of the version and no name.
    await expect(page.getByText('صادرکننده')).toHaveCount(0);
    await expect(page.getByText('یادداشت این نسخه')).toHaveCount(0);
    // The applicant comments on a chapter from here.
    await page.getByRole('button', { name: /نظرهای بازبینی این فصل.*تحلیل بازار/ }).click();
    await expect(page.getByLabel('بخش', { exact: true })).toHaveValue('market');
    await audit(page);
  });

  test('lets staff write, change and archive report templates', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    let templates: Record<string, unknown>[] = [];
    const sent: unknown[] = [];
    await page.route('**/api/v1/report-templates?*', (route) => json(route, templates));
    await page.route('**/api/v1/report-templates', (route) => {
      const body = route.request().postDataJSON() as { name: string; chapters: object[] };
      sent.push(body);
      templates = [
        {
          id: 't1',
          ...body,
          createdAt: '2026-10-07T09:00:00Z',
          updatedAt: '2026-10-07T09:00:00Z',
          archivedAt: null,
        },
      ];
      return json(route, templates[0], 201);
    });
    await page.route('**/api/v1/report-templates/t1', (route) => {
      const body = route.request().postDataJSON() as { archived?: boolean; name?: string };
      sent.push(body);
      const { archived, ...changes } = body;
      templates = [
        {
          ...templates[0],
          ...changes,
          ...(archived === undefined
            ? {}
            : { archivedAt: archived ? '2026-10-07T10:00:00Z' : null }),
        },
      ];
      return json(route, templates[0]);
    });

    await page.goto('/dashboard/manage/report-templates');
    await expect(page.getByText('قالبی ساخته نشده است')).toBeVisible();
    await page.getByRole('button', { name: 'قالب تازه' }).click();
    await audit(page);

    // A name is needed.
    await page.getByRole('button', { name: 'ذخیره قالب' }).click();
    await expect(page.getByLabel('نام قالب')).toBeFocused();
    await page.getByLabel('نام قالب').fill('قالب کوتاه');

    // Keep two chapters, the financial one first, with a title of our own.
    for (const name of [
      'خلاصه مدیریتی',
      'پیشینه و ایده اصلی طرح',
      'مواد اولیه و ملزومات',
      'مکان، ساختگاه و محیط زیست',
      'مهندسی و فناوری',
      'سازمان و هزینه‌های سربار',
      'نیروی انسانی',
      'برنامه اجرا و بودجه‌بندی',
      'تحلیل اقتصادی',
    ]) {
      await page.getByRole('checkbox', { name, exact: true }).uncheck();
    }
    const up = page.getByRole('button', {
      name: 'بالا بردن فصل «تحلیل مالی و ارزیابی سرمایه‌گذاری»',
    });
    for (let i = 0; i < 9; i++) await up.click();
    await expect(up).toBeDisabled();
    await page.getByLabel('عنوان فصل «تحلیل بازار و بازاریابی» در گزارش').fill('بازار هدف');
    await page
      .getByLabel('راهنمای کارشناس برای فصل «تحلیل بازار و بازاریابی» (اختیاری)')
      .fill('اندازه بازار');
    await page.getByRole('button', { name: 'ذخیره قالب' }).click();
    await expect(page.getByText('قالب ذخیره شد.')).toBeVisible();
    expect(sent).toEqual([
      {
        name: 'قالب کوتاه',
        chapters: [
          { key: 'financial', title: 'تحلیل مالی و ارزیابی سرمایه‌گذاری' },
          { key: 'market', title: 'بازار هدف', guidance: 'اندازه بازار' },
        ],
      },
    ]);
    await expect(page.getByText('۲ فصل')).toBeVisible();

    await page.getByRole('button', { name: 'بایگانی قالب «قالب کوتاه»' }).click();
    await expect(page.getByText('قالب «قالب کوتاه» بایگانی شد.')).toBeVisible();
    await expect(page.getByText('بایگانی‌شده', { exact: true })).toBeVisible();
    expect(sent.at(-1)).toEqual({ archived: true });
    await audit(page);

    // Change it: the form opens with what the template has; a chapter without a title is
    // told by its name, and its field is focused.
    await page.getByRole('button', { name: 'ویرایش قالب «قالب کوتاه»' }).click();
    await expect(page.getByLabel('نام قالب')).toHaveValue('قالب کوتاه');
    const title = page.getByLabel('عنوان فصل «تحلیل بازار و بازاریابی» در گزارش', { exact: true });
    await expect(title).toHaveValue('بازار هدف');
    await title.fill('');
    await page.getByRole('button', { name: 'ذخیره قالب' }).click();
    await expect(page.getByText(/^فصل «تحلیل بازار و بازاریابی»:/)).toBeVisible();
    await expect(title).toBeFocused();
    await title.fill('بازار');
    // The keyboard stays on the row that moves.
    const down = page.getByRole('button', {
      name: 'پایین بردن فصل «تحلیل مالی و ارزیابی سرمایه‌گذاری»',
    });
    await down.focus();
    await page.keyboard.press('Enter');
    await expect(down).toBeFocused();
    await page.getByLabel('نام قالب').fill('قالب کوتاه ۲');
    await page.getByRole('button', { name: 'ذخیره قالب' }).click();
    await expect(page.getByText('قالب ذخیره شد.')).toBeVisible();
    expect(sent.at(-1)).toEqual({
      name: 'قالب کوتاه ۲',
      chapters: [
        { key: 'market', title: 'بازار', guidance: 'اندازه بازار' },
        { key: 'financial', title: 'تحلیل مالی و ارزیابی سرمایه‌گذاری' },
      ],
    });
    await page.getByRole('button', { name: 'فعال‌کردن قالب «قالب کوتاه ۲»' }).click();
    await expect(page.getByText('قالب «قالب کوتاه ۲» دوباره فعال شد.')).toBeVisible();
    expect(sent.at(-1)).toEqual({ archived: false });
  });

  test('lets the officer and then an admin approve a version, or refuse it with a note', async ({
    page,
  }) => {
    await signIn(page, ['feasibility:manage', 'feasibility:approve-report']);
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project({ status: 'CLIENT_REVIEW' })),
    );
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) =>
      json(route, [], 200, 0),
    );
    const officerStep = {
      step: 'officer',
      decision: 'approved',
      at: '2026-10-08T08:00:00Z',
      by: 'مریم احمدی',
      note: null,
    };
    let approval: { state: string; steps: object[] } = { state: 'pending_officer', steps: [] };
    let access = { officer: true, admin: false };
    await page.route('**/api/v1/feasibility-projects/p1/report/versions/2?*', (route) =>
      json(route, version({ approval, access })),
    );
    const sent: unknown[] = [];
    let refuse = true;
    await page.route('**/api/v1/feasibility-projects/p1/report/versions/2/approvals', (route) => {
      const body = route.request().postDataJSON() as { step: string; decision: string };
      sent.push(body);
      if (refuse) return fail(route, 409, 'فقط آخرین نسخه گزارش تأیید یا رد می‌شود.');
      approval =
        body.decision === 'rejected'
          ? { state: 'rejected', steps: [{ ...officerStep, decision: 'rejected', note: 'ناقص' }] }
          : { state: 'pending_admin', steps: [officerStep] };
      access = { officer: false, admin: false };
      return json(route, approval);
    });

    await page.goto('/dashboard/manage/feasibility/p1/report/versions/2');
    const panel = page.getByRole('region', { name: 'تأیید گزارش' });
    await expect(panel.getByText('در انتظار تأیید مسئول امکان‌سنجی')).toBeVisible();
    await expect(panel.getByRole('button')).toHaveText([
      'تأیید این نسخه (مسئول امکان‌سنجی)',
      'رد این نسخه',
    ]);
    await audit(page);

    // A refusal says why, before anything is sent.
    await panel.getByRole('button', { name: 'رد این نسخه' }).click();
    await expect(
      panel.getByText('دلیل رد این نسخه را بنویسید تا پیش‌نویس اصلاح شود.'),
    ).toBeVisible();
    expect(sent).toEqual([]);

    // What the API refuses is said.
    await panel.getByRole('button', { name: 'تأیید این نسخه (مسئول امکان‌سنجی)' }).click();
    await expect(panel.getByText('فقط آخرین نسخه گزارش تأیید یا رد می‌شود.')).toBeVisible();

    refuse = false;
    await panel.getByRole('button', { name: 'تأیید این نسخه (مسئول امکان‌سنجی)' }).click();
    await expect(panel.getByText('تأیید شما ثبت شد.')).toBeVisible();
    await expect(panel.getByText('در انتظار تأیید نهایی مدیر')).toBeVisible();
    await expect(panel.getByText(/تأیید مسئول امکان‌سنجی:/)).toBeVisible();
    await expect(panel.getByText(/مریم احمدی/)).toBeVisible();
    // Whoever gave the first approval has nothing more to decide.
    await expect(panel.getByRole('button')).toHaveCount(0);
    expect(sent).toEqual([
      { step: 'officer', decision: 'approved' },
      { step: 'officer', decision: 'approved' },
    ]);
    await audit(page);

    // The admin's turn: a refusal with its note, after a confirmation.
    approval = { state: 'pending_admin', steps: [officerStep] };
    access = { officer: false, admin: true };
    await page.reload();
    await expect(panel.getByRole('button')).toHaveText([
      'تأیید نهایی این نسخه (مدیر)',
      'رد این نسخه',
    ]);
    await panel.getByLabel('یادداشت (برای رد لازم است)').fill('ارقام فصل مالی بازبینی شود');
    page.once('dialog', (dialog) => void dialog.dismiss());
    await panel.getByRole('button', { name: 'رد این نسخه' }).click();
    expect(sent).toHaveLength(2);
    page.once('dialog', (dialog) => void dialog.accept());
    await panel.getByRole('button', { name: 'رد این نسخه' }).click();
    await expect(panel.getByText('این نسخه رد شد.')).toBeVisible();
    await expect(panel.getByText('رد شده', { exact: true })).toBeVisible();
    expect(sent.at(-1)).toEqual({
      step: 'admin',
      decision: 'rejected',
      note: 'ارقام فصل مالی بازبینی شود',
    });
  });

  test('shows the applicant the approvals of the approved report and no decision to take', async ({
    page,
  }) => {
    await signIn(page, []);
    const mine = project({
      status: 'DELIVERED',
      applicant: undefined,
      experts: undefined,
      financialModel: undefined,
    });
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, mine));
    let approval: { state: string; steps: object[] } = { state: 'pending', steps: [] };
    await page.route('**/api/v1/feasibility-projects/p1/report/versions', (route) =>
      json(route, [
        { number: 2, contentHash: 'f'.repeat(64), createdAt: '2026-10-07T09:00:00Z', approval },
      ]),
    );
    await page.route('**/api/v1/feasibility-projects/p1/report/versions/2?*', (route) =>
      json(route, version({ note: undefined, issuedBy: undefined, approval })),
    );
    await page.route('**/api/v1/feasibility-projects/p1/review-threads?*', (route) =>
      json(route, [], 200, 0),
    );

    await page.goto('/dashboard/feasibility/p1/report');
    const panel = page.getByRole('region', { name: 'تأیید گزارش' });
    await expect(panel.getByText('در انتظار تأیید', { exact: true })).toBeVisible();
    await expect(panel.getByText(/هنوز تأیید نهایی نشده است/)).toBeVisible();
    await expect(panel.getByRole('button')).toHaveCount(0);

    approval = {
      state: 'approved',
      steps: [
        { step: 'officer', decision: 'approved', at: '2026-10-08T08:00:00Z', by: 'سارا احمدی' },
        { step: 'admin', decision: 'approved', at: '2026-10-08T09:00:00Z', by: 'رضا مدیری' },
      ],
    };
    await page.reload();
    await expect(panel.getByText('تأیید نهایی شده')).toBeVisible();
    await expect(panel.getByRole('listitem')).toHaveCount(2);
    await expect(panel.getByText(/تأیید مدیر:/)).toBeVisible();
    await expect(panel.getByText(/رضا مدیری/)).toBeVisible();
    await expect(panel.getByRole('button')).toHaveCount(0);
    await expect(panel.getByLabel('یادداشت (برای رد لازم است)')).toHaveCount(0);
    await audit(page);
  });
});
