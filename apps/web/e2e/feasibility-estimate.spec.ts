import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * The cost estimate of a feasibility study (ST-35.08): the staff enter the amount, what it covers
 * and how long it takes; the applicant reads it and accepts or declines it.
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

const ESTIMATE = {
  amountRials: '2500000000',
  scope: 'مطالعه بازار، فنی و مالی طرح',
  durationDays: 45,
  createdAt: '2026-10-03T08:00:00Z',
};

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
  costEstimate: null,
  events: [event('DRAFT'), event('SUBMITTED', { fromStatus: 'DRAFT' })],
  access: { transitions, edit: false, remove: false, assignExperts: false, releaseExperts: false },
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

test.describe('the cost estimate of a feasibility study', () => {
  test.beforeEach(async ({ page }) => {
    // The workspace of the staff and the experts (ST-35.10) asks for these on the staff page.
    await page.route('**/api/v1/feasibility-projects/p1/notes?*', (route) => json(route, []));
    await page.route('**/api/v1/feasibility-projects/experts', (route) => json(route, []));
    await page.route('**/api/v1/feasibility-projects/p1/documents', (route) =>
      json(route, { slots: [], access: { upload: false } }),
    );
    await page.route('**/api/v1/feasibility-projects/p1/contract', (route) =>
      json(route, { files: [], access: { upload: false, confirm: false } }),
    );
    await page.route('**/api/v1/feasibility-projects/p1/questionnaire', (route) =>
      fail(route, 404, 'پرسشنامه‌ای برای این پروژه نیست.'),
    );
  });

  test('is entered by staff: checked, confirmed and sent to the applicant', async ({ page }) => {
    await signIn(page, ['feasibility:manage']);
    const staff = { applicant: { id: 'u2', fullName: 'رضا کریمی' }, experts: [] };
    let current = project(
      'INITIAL_REVIEW',
      ['NEEDS_MORE_INFO', 'COST_ESTIMATED', 'ARCHIVED'],
      staff,
    );
    const sent: object[] = [];
    let refuse = true;
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, current));
    await page.route('**/api/v1/feasibility-projects/p1/cost-estimate', (route) => {
      sent.push(route.request().postDataJSON() as object);
      if (refuse) {
        return fail(route, 400, 'اطلاعات واردشده معتبر نیست.', [
          { path: 'scope', message: 'شرح کار را کامل‌تر بنویسید.' },
        ]);
      }
      current = project('COST_ESTIMATED', ['ARCHIVED'], { ...staff, costEstimate: ESTIMATE });
      return json(route, current);
    });

    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByRole('heading', { name: 'ثبت برآورد هزینه' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'برآورد هزینه و مدت مطالعه' })).toHaveCount(0);
    await audit(page);

    // An empty form is refused next to its fields, and nothing is sent.
    const submit = page.getByRole('button', { name: 'ثبت برآورد و ارسال برای متقاضی' });
    await submit.click();
    await expect(page.getByText('مبلغ باید عددی صحیح به ریال باشد.')).toBeVisible();
    await expect(page.getByText('مدت را به روز و با عدد صحیح بنویسید.')).toBeVisible();
    await expect(page.getByLabel('مبلغ برآورد (ریال)')).toBeFocused();
    expect(sent).toHaveLength(0);

    // The amount is read back in words of the page before it is sent; Persian digits are taken.
    await page.getByLabel('مبلغ برآورد (ریال)').fill('۲۵۰۰۰۰۰۰۰۰');
    await expect(page.getByText('۲٬۵۰۰٬۰۰۰٬۰۰۰ ریال', { exact: true })).toBeVisible();
    await page.getByLabel('مدت انجام (روز)').fill('۴۵');
    await page.getByLabel('شرح کار').fill('مطالعه بازار، فنی و مالی طرح');
    await page.getByLabel('پیام برای متقاضی (اختیاری)').fill('برآورد بر پایه پرسشنامه است.');

    // Without the confirmation nothing goes out.
    let asked = '';
    page.once('dialog', (dialog) => {
      asked = dialog.message();
      void dialog.dismiss();
    });
    await submit.click();
    expect(asked).toContain('۲٬۵۰۰٬۰۰۰٬۰۰۰ ریال');
    await expect(submit).toBeEnabled();
    expect(sent).toHaveLength(0);

    // A refusal of the API is shown at its field and the form keeps what was typed.
    page.once('dialog', (dialog) => void dialog.accept());
    await submit.click();
    await expect(page.getByText('شرح کار را کامل‌تر بنویسید.')).toBeVisible();
    await expect(page.getByLabel('شرح کار')).toBeFocused();
    await expect(page.getByLabel('مبلغ برآورد (ریال)')).toHaveValue('۲۵۰۰۰۰۰۰۰۰');

    refuse = false;
    page.once('dialog', (dialog) => void dialog.accept());
    await submit.click();
    await expect(page.getByText('برآورد ثبت شد و برای تصمیم متقاضی فرستاده شد.')).toBeVisible();
    // Whole rials as digits, a number of days, and only what was confirmed.
    expect(sent).toHaveLength(2);
    expect(sent.at(-1)).toEqual({
      amountRials: '2500000000',
      scope: 'مطالعه بازار، فنی و مالی طرح',
      durationDays: 45,
      note: 'برآورد بر پایه پرسشنامه است.',
    });
    // The estimate is on the project now and cannot be entered again.
    await expect(page.getByRole('heading', { name: 'برآورد هزینه و مدت مطالعه' })).toBeVisible();
    await expect(page.getByText('۲٬۵۰۰٬۰۰۰٬۰۰۰ ریال', { exact: true })).toBeVisible();
    await expect(page.getByText('۴۵ روز', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ثبت برآورد هزینه' })).toHaveCount(0);
    await audit(page);
  });

  test('is not offered to an expert, who does not read the price either', async ({ page }) => {
    await signIn(page, ['feasibility:work']);
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(
        route,
        project('COST_ESTIMATED', [], {
          applicant: { id: 'u2', fullName: 'رضا کریمی' },
          experts: [],
        }),
      ),
    );
    await page.goto('/dashboard/manage/feasibility/p1');
    await expect(page.getByRole('link', { name: /پرسشنامه و پاسخ‌های متقاضی/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ثبت برآورد هزینه' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'برآورد هزینه و مدت مطالعه' })).toHaveCount(0);
  });

  test('is accepted by the applicant after a confirmation', async ({ page }) => {
    await signIn(page, []);
    let current = project('COST_ESTIMATED', ['CONTRACT_PENDING', 'ARCHIVED'], {
      costEstimate: ESTIMATE,
    });
    const sent: object[] = [];
    let refuse = true;
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, current));
    await page.route('**/api/v1/feasibility-projects/p1/transitions', (route) => {
      sent.push(route.request().postDataJSON() as object);
      if (refuse) {
        return fail(route, 409, 'وضعیت پروژه هم‌زمان تغییر کرده است. دوباره تلاش کنید.');
      }
      current = project('CONTRACT_PENDING', [], { costEstimate: ESTIMATE });
      return json(route, current);
    });

    await page.goto('/dashboard/feasibility/p1');
    await expect(page.getByText(/برآورد هزینه و مدت مطالعه آماده است/)).toBeVisible();
    await expect(page.getByText('۲٬۵۰۰٬۰۰۰٬۰۰۰ ریال', { exact: true })).toBeVisible();
    await expect(page.getByText('۴۵ روز', { exact: true })).toBeVisible();
    await expect(page.getByText('مطالعه بازار، فنی و مالی طرح', { exact: true })).toBeVisible();
    await audit(page);

    const accept = page.getByRole('button', { name: 'پذیرش برآورد' });
    page.once('dialog', (dialog) => void dialog.dismiss());
    await accept.click();
    await expect(accept).toBeEnabled();
    expect(sent).toHaveLength(0);

    // A refusal is shown and the decision stays open.
    page.once('dialog', (dialog) => void dialog.accept());
    await accept.click();
    await expect(page.getByText(/هم‌زمان تغییر کرده است/)).toBeVisible();

    refuse = false;
    page.once('dialog', (dialog) => void dialog.accept());
    await accept.click();
    await expect(page.getByText('برآورد را پذیرفتید. پروژه وارد مرحله قرارداد شد.')).toBeVisible();
    expect(sent).toEqual([{ to: 'CONTRACT_PENDING' }, { to: 'CONTRACT_PENDING' }]);
    // The accepted estimate stays on the page; the decision is no longer offered.
    await expect(page.getByText(/در انتظار قرارداد است/)).toBeVisible();
    await expect(page.getByText('۲٬۵۰۰٬۰۰۰٬۰۰۰ ریال', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'پذیرش برآورد' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'رد برآورد' })).toHaveCount(0);
  });

  test('is declined by the applicant with a message, which archives the project', async ({
    page,
  }) => {
    await signIn(page, []);
    let current = project('COST_ESTIMATED', ['CONTRACT_PENDING', 'ARCHIVED'], {
      costEstimate: ESTIMATE,
    });
    const sent: object[] = [];
    await page.route('**/api/v1/feasibility-projects/p1', (route) => json(route, current));
    await page.route('**/api/v1/feasibility-projects/p1/transitions', (route) => {
      sent.push(route.request().postDataJSON() as object);
      current = project('ARCHIVED', [], { costEstimate: ESTIMATE });
      return json(route, current);
    });

    await page.goto('/dashboard/feasibility/p1');
    await page.getByLabel('پیام برای کارشناسان (اختیاری)').fill('مبلغ برای ما زیاد است.');
    let asked = '';
    page.once('dialog', (dialog) => {
      asked = dialog.message();
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'رد برآورد' }).click();
    expect(asked).toContain('بایگانی');
    await expect(page.getByText('برآورد را رد کردید و پروژه بایگانی شد.')).toBeVisible();
    expect(sent).toEqual([{ to: 'ARCHIVED', note: 'مبلغ برای ما زیاد است.' }]);
    await expect(page.getByRole('button', { name: 'پذیرش برآورد' })).toHaveCount(0);
  });

  test('offers only to decline when the project carries no estimate', async ({ page }) => {
    await signIn(page, []);
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(route, project('COST_ESTIMATED', ['CONTRACT_PENDING', 'ARCHIVED'])),
    );
    await page.goto('/dashboard/feasibility/p1');
    await expect(page.getByRole('button', { name: 'رد برآورد' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'پذیرش برآورد' })).toHaveCount(0);
  });

  test('fits a phone without scrolling sideways', async ({ page }) => {
    await signIn(page, []);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.route('**/api/v1/feasibility-projects/p1', (route) =>
      json(
        route,
        project('COST_ESTIMATED', ['CONTRACT_PENDING', 'ARCHIVED'], { costEstimate: ESTIMATE }),
      ),
    );
    await page.goto('/dashboard/feasibility/p1');
    await expect(page.getByRole('button', { name: 'پذیرش برآورد' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
