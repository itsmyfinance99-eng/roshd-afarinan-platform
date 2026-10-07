import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * The contract step of a feasibility study (ST-35.09): the applicant and the staff hand in copies
 * of the signed contract, and the staff confirm one, which starts the work.
 */

const envelope = (data: unknown) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total: 1 } });
const json = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: envelope(data) });
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

const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');

const event = (toStatus: string, over: object = {}) => ({
  fromStatus: null,
  toStatus,
  actor: 'applicant',
  note: null,
  createdAt: '2026-10-01T08:00:00Z',
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
  costEstimate: {
    amountRials: '2500000000',
    scope: 'مطالعه بازار، فنی و مالی طرح',
    durationDays: 45,
    createdAt: '2026-10-03T08:00:00Z',
  },
  events: [event('DRAFT'), event('SUBMITTED', { fromStatus: 'DRAFT' })],
  access: { transitions, edit: false, remove: false, assignExperts: false, releaseExperts: false },
  ...over,
});

const copy = (version: number, over: object = {}) => ({
  id: `c${version}`,
  version,
  originalName: `قرارداد-${version}.pdf`,
  mimeType: 'application/pdf',
  size: 2048,
  uploadedAt: '2026-10-05T08:00:00Z',
  uploadedAs: 'applicant',
  confirmedAt: null,
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

const STAFF = { applicant: { id: 'u2', fullName: 'رضا کریمی' }, experts: [] };

test.describe('the contract of a feasibility study', () => {
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
    await page.route('**/api/v1/feasibility-projects/p1/questionnaire', (route) =>
      fail(route, 404, 'پرسشنامه‌ای برای این پروژه نیست.'),
    );
  });

  test('is handed in by the applicant, each copy a new version', async ({ page }) => {
    await signIn(page, []);
    let files: object[] = [];
    let refuse = true;
    let uploads = 0;
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project('CONTRACT_PENDING', [])),
    );
    await page.route('**/api/v1/feasibility-projects/p1/contract', (route) => {
      if (route.request().method() === 'GET') {
        return json(route, { files, access: { upload: true, confirm: false } });
      }
      uploads += 1;
      if (refuse) return fail(route, 415, 'محتوای فایل با نوع آن نمی‌خواند.');
      files = [copy(files.length + 1), ...files];
      return json(route, { files, access: { upload: true, confirm: false } }, 201);
    });

    await page.goto('/dashboard/feasibility/p1');
    await expect(page.getByText(/در انتظار قرارداد است/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'قرارداد', exact: true })).toBeVisible();
    await expect(page.getByText('هنوز نسخه‌ای از قرارداد بارگذاری نشده است.')).toBeVisible();
    await audit(page);

    const input = page.locator('section[aria-labelledby="contract-title"] input[type="file"]');
    // A file of a type that is not taken is refused in the browser, and nothing is sent.
    await input.setInputFiles({
      name: 'قرارداد.exe',
      mimeType: 'application/x-msdownload',
      buffer: PDF,
    });
    await expect(page.getByText(/نوع فایل مجاز نیست\. فرمت‌های مجاز/)).toBeVisible();
    expect(uploads).toBe(0);

    // A refusal of the API is shown and the way to hand in stays.
    await input.setInputFiles({ name: 'قرارداد.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByText('محتوای فایل با نوع آن نمی‌خواند.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'بارگذاری قرارداد امضاشده' })).toBeEnabled();

    refuse = false;
    await input.setInputFiles({ name: 'قرارداد.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByText('قرارداد-1.pdf')).toBeVisible();
    await expect(page.getByText('نسخه ۱', { exact: true })).toBeVisible();
    await expect(page.getByText('بارگذاری متقاضی', { exact: true })).toBeVisible();
    // The applicant hands in and reads; the confirmation is not theirs.
    await expect(page.getByRole('button', { name: /تأیید نسخه/ })).toHaveCount(0);
    await expect(page.getByLabel('پیام برای متقاضی (اختیاری)')).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'بارگذاری نسخه تازه قرارداد' })).toBeEnabled();
    await input.setInputFiles({ name: 'قرارداد.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(page.getByText('نسخه ۲', { exact: true })).toBeVisible();
    await expect(page.getByText('قرارداد-1.pdf')).toBeVisible();
    await audit(page);
  });

  test('is confirmed by staff after a confirmation, which starts the work', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    let current = project('CONTRACT_PENDING', ['IN_PROGRESS', 'ARCHIVED'], STAFF);
    let contract: object = {
      files: [
        copy(2, { uploadedBy: { id: 'u2', fullName: 'رضا کریمی' }, confirmedBy: null }),
        copy(1, {
          uploadedAs: 'staff',
          uploadedBy: { id: 'u1', fullName: 'مریم احمدی' },
          confirmedBy: null,
        }),
      ],
      access: { upload: true, confirm: true },
    };
    const sent: { url: string; body: object }[] = [];
    let refuse = true;
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, current));
    await page.route('**/api/v1/feasibility-projects/p1/contract', (route) =>
      json(route, contract),
    );
    await page.route('**/api/v1/feasibility-projects/p1/contract/*/confirm', (route) => {
      sent.push({
        url: new URL(route.request().url()).pathname,
        body: route.request().postDataJSON() as object,
      });
      if (refuse) {
        return fail(route, 409, 'وضعیت پروژه هم‌زمان تغییر کرده است. دوباره تلاش کنید.');
      }
      current = project('IN_PROGRESS', ['EXPERT_REVIEW'], STAFF);
      contract = {
        files: [
          copy(2, {
            uploadedBy: { id: 'u2', fullName: 'رضا کریمی' },
            confirmedAt: '2026-10-06T08:00:00Z',
            confirmedBy: { id: 'u1', fullName: 'مریم احمدی' },
          }),
          copy(1, { uploadedAs: 'staff', uploadedBy: { id: 'u1', fullName: 'مریم احمدی' } }),
        ],
        access: { upload: false, confirm: false },
      };
      return json(route, current);
    });

    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByRole('heading', { name: 'قرارداد', exact: true })).toBeVisible();
    await expect(page.getByText('بارگذاری متقاضی', { exact: true })).toBeVisible();
    await expect(page.getByText('بارگذاری کارشناسان', { exact: true })).toBeVisible();
    await expect(page.getByText(/رضا کریمی/).first()).toBeVisible();
    await audit(page);

    await page.getByLabel('پیام برای متقاضی (اختیاری)').fill('قرارداد دریافت شد.');
    const confirm = page.getByRole('button', { name: 'تأیید نسخه ۲ و شروع کار' });
    // Without the confirmation nothing goes out.
    let asked = '';
    page.once('dialog', (dialog) => {
      asked = dialog.message();
      void dialog.dismiss();
    });
    await confirm.click();
    expect(asked).toContain('قرارداد-2.pdf');
    expect(asked).toContain('در حال انجام');
    await expect(confirm).toBeEnabled();
    expect(sent).toHaveLength(0);

    // A refusal is shown and the confirmation stays open.
    page.once('dialog', (dialog) => void dialog.accept());
    await confirm.click();
    await expect(page.getByText(/هم‌زمان تغییر کرده است/)).toBeVisible();
    await expect(confirm).toBeEnabled();

    refuse = false;
    page.once('dialog', (dialog) => void dialog.accept());
    await confirm.click();
    await expect(
      page.getByText('قرارداد تأیید شد و پروژه وارد مرحله «در حال انجام» شد.'),
    ).toBeVisible();
    // The copy that was chosen, with the message for the applicant.
    expect(sent).toHaveLength(2);
    expect(sent.at(-1)).toEqual({
      url: '/api/v1/feasibility-projects/p1/contract/c2/confirm',
      body: { note: 'قرارداد دریافت شد.' },
    });
    // The confirmed copy is marked; nothing more is handed in or confirmed.
    await expect(page.getByText('تأییدشده', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /تأیید نسخه/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /بارگذاری/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'دریافت قرارداد-2.pdf' })).toBeVisible();
    await audit(page);
  });

  test('is not shown to an expert, and not asked for before the contract step', async ({
    page,
  }) => {
    let asked = 0;
    await page.route('**/api/v1/feasibility-projects/p1/contract', (route) => {
      asked += 1;
      return fail(route, 403, 'قرارداد پروژه را فقط متقاضی و کارکنان می‌بینند.');
    });
    await signIn(page, ['feasibility:work']);
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project('IN_PROGRESS', ['EXPERT_REVIEW'], { ...STAFF, costEstimate: null })),
    );
    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByRole('link', { name: /پرسشنامه و پاسخ‌های متقاضی/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'قرارداد', exact: true })).toHaveCount(0);
    expect(asked).toBe(0);
  });

  test('speaks to staff as the applicant on a project of their own', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    // The API gives the owner no `applicant`: there they are the applicant and nothing else.
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project('CONTRACT_PENDING', [], { experts: [] })),
    );
    await page.route('**/api/v1/feasibility-projects/p1/contract', (route) =>
      json(route, { files: [copy(1)], access: { upload: true, confirm: false } }),
    );
    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByText(/پس از تأیید کارشناسان، کار مطالعه آغاز می‌شود/)).toBeVisible();
    await expect(page.getByText(/با تأیید یک نسخه، پروژه وارد مرحله/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /تأیید نسخه/ })).toHaveCount(0);
  });

  test('stays readable for the applicant once the work has started', async ({ page }) => {
    await signIn(page, []);
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project('IN_PROGRESS', [])),
    );
    await page.route('**/api/v1/feasibility-projects/p1/contract', (route) =>
      json(route, {
        files: [copy(1, { confirmedAt: '2026-10-06T08:00:00Z' })],
        access: { upload: false, confirm: false },
      }),
    );
    let linked = '';
    await page.route('**/api/v1/feasibility-projects/p1/contract/c1/download-url', (route) => {
      linked = route.request().method();
      return fail(route, 404, 'این فایل دیگر در دسترس نیست.');
    });
    await page.goto('/dashboard/feasibility/p1');
    await expect(page.getByText('قرارداد تأیید شده و مطالعه در حال انجام است.')).toBeVisible();
    await expect(page.getByText('تأییدشده', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /بارگذاری/ })).toHaveCount(0);
    // A link that cannot be made is said, not swallowed.
    await page.getByRole('button', { name: 'دریافت قرارداد-1.pdf' }).click();
    await expect(page.getByText('این فایل دیگر در دسترس نیست.')).toBeVisible();
    expect(linked).toBe('POST');
  });

  test('fits a phone without scrolling sideways', async ({ page }) => {
    await signIn(page, []);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project('CONTRACT_PENDING', [])),
    );
    await page.route('**/api/v1/feasibility-projects/p1/contract', (route) =>
      json(route, {
        files: [copy(2), copy(1, { uploadedAs: 'staff' })],
        access: { upload: true, confirm: false },
      }),
    );
    await page.goto('/dashboard/feasibility/p1');
    await expect(page.getByRole('button', { name: 'بارگذاری نسخه تازه قرارداد' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
