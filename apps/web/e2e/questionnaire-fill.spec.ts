import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * The questionnaire of a project for its applicant (ST-35.05): starting it, the form in steps
 * with its progress, saving on its own, errors next to their fields, table answers and numbers
 * with a unit, the project's own items, and the locked state after the submission.
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

async function signIn(page: Page) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    json(route, {
      id: 'u1',
      email: 'user@example.com',
      mobile: null,
      fullName: 'مریم احمدی',
      roles: ['user'],
      permissions: [],
      emailVerifiedAt: '2026-09-01T00:00:00Z',
      createdAt: '2026-09-01T00:00:00Z',
    }),
  );
}

const definition = {
  sections: [
    {
      key: 'plan',
      title: 'مشخصات طرح',
      description: 'محصول و ظرفیت طرح.',
      questions: [
        { key: 'product', type: 'text', label: 'محصول اصلی', required: true },
        {
          key: 'capacity',
          type: 'number',
          label: 'ظرفیت اسمی',
          required: true,
          units: ['تن', 'مترمکعب'],
          min: '0',
        },
        {
          key: 'goals',
          type: 'multiple_choice',
          label: 'ضرورت اجرای طرح',
          options: [
            { value: 'export', label: 'هدف صادراتی' },
            { value: 'substitution', label: 'جایگزینی واردات' },
          ],
        },
      ],
    },
    {
      key: 'applicant',
      title: 'متقاضی',
      questions: [
        {
          key: 'company_type',
          type: 'single_choice',
          label: 'نوع شرکت',
          required: true,
          options: [
            { value: 'private', label: 'سهامی خاص' },
            { value: 'public', label: 'سهامی عام' },
          ],
        },
        {
          key: 'shareholders',
          type: 'table',
          label: 'سهامداران',
          columns: [
            { key: 'name', type: 'text', label: 'نام سهامدار', required: true },
            { key: 'percent', type: 'number', label: 'درصد سهم', unit: 'درصد', max: '100' },
          ],
        },
      ],
    },
  ],
  documents: [{ key: 'license', label: 'جواز تأسیس', required: true }],
};

const questionnaire = (over: object = {}) => ({
  template: { id: 't1', title: 'پرسشنامه عمومی طرح توجیهی', version: 2, isDemo: true },
  definition,
  items: [] as object[],
  answers: {} as Record<string, unknown>,
  answeredAt: null,
  access: { start: false, answer: true, addItems: true },
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

const base = '**/api/v1/feasibility-projects/p1/questionnaire';

test.describe('the questionnaire of a project for its applicant', () => {
  test('is started, then filled in step by step and saved on its own', async ({ page }) => {
    await signIn(page);
    let current = questionnaire({
      template: null,
      definition: null,
      access: { start: true, answer: true, addItems: true },
    });
    const saves: Record<string, unknown>[] = [];
    await page.route(base, (route) => json(route, current));
    await page.route(`${base}/start`, (route) => {
      current = questionnaire();
      return json(route, current);
    });
    await page.route(`${base}/answers`, (route) => {
      const { answers } = route.request().postDataJSON() as { answers: Record<string, unknown> };
      saves.push(answers);
      const merged: Record<string, unknown> = { ...current.answers, ...answers };
      for (const [key, value] of Object.entries(merged)) if (value === null) delete merged[key];
      current = { ...current, answers: merged };
      return json(route, current);
    });

    await page.goto('/dashboard/feasibility/p1/questionnaire');
    await page.getByRole('button', { name: 'شروع پرسشنامه' }).click();
    await expect(page.getByRole('heading', { name: 'مشخصات طرح' })).toBeVisible();
    await expect(page.getByText('نمونه نمایشی')).toBeVisible();
    await expect(page.getByText('۰ از ۵ سؤال پاسخ داده شده')).toBeVisible();
    await expect(page.getByText('۳ سؤال الزامی مانده است')).toBeVisible();
    await expect(page.getByText('پاسخ‌ها خودکار ذخیره می‌شوند.')).toBeVisible();
    await audit(page);

    // Typing saves by itself a moment later; a number goes with the unit that is chosen.
    await page.getByLabel('محصول اصلی').fill('کنسانتره سنگ آهن');
    await page.getByLabel(/^ظرفیت اسمی/).fill('250000');
    await page.getByLabel('واحد ظرفیت اسمی').selectOption('مترمکعب');
    await page.getByLabel('هدف صادراتی').check();
    await expect
      .poll(() => Object.assign({}, ...saves) as unknown)
      .toEqual({
        product: 'کنسانتره سنگ آهن',
        capacity: { value: '250000', unit: 'مترمکعب' },
        goals: ['export'],
      });
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();
    await expect(page.getByText('۳ از ۵ سؤال پاسخ داده شده')).toBeVisible();
    await expect(page.getByText('۱ سؤال الزامی مانده است')).toBeVisible();

    // The next step is read from its title on; a table answer is a list of small forms.
    await page.getByRole('button', { name: 'مرحله بعد' }).click();
    await expect(page.getByRole('heading', { name: 'متقاضی' })).toBeFocused();
    await page.getByLabel('سهامی خاص').check();
    await page.getByRole('button', { name: 'افزودن سطر به «سهامداران»' }).click();
    const row = page.getByRole('group', { name: 'سطر ۱' });
    await row.getByLabel('نام سهامدار').fill('رضا کریمی');
    await row.getByLabel('درصد سهم').fill('60');
    await expect
      .poll(() => (Object.assign({}, ...saves) as Record<string, unknown>).shareholders)
      .toEqual([{ name: 'رضا کریمی', percent: { value: '60' } }]);
    await expect(page.getByText('۵ از ۵ سؤال پاسخ داده شده')).toBeVisible();
    await expect(page.getByText(/سؤال الزامی مانده است/)).toHaveCount(0);
    await audit(page);

    // An emptied answer is taken back.
    await page.getByRole('button', { name: /۱\. مشخصات طرح/ }).click();
    await page.getByLabel('محصول اصلی').fill('');
    await expect.poll(() => saves.at(-1)).toEqual({ product: null });
    await expect(page.getByText('۴ از ۵ سؤال پاسخ داده شده')).toBeVisible();
  });

  test('keeps a wrong answer in the form with its message and does not send it', async ({
    page,
  }) => {
    await signIn(page);
    let current = questionnaire({ answers: { product: 'کنسانتره' } });
    const saves: Record<string, unknown>[] = [];
    let refuse = false;
    await page.route(base, (route) => json(route, current));
    await page.route(`${base}/answers`, (route) => {
      const { answers } = route.request().postDataJSON() as { answers: Record<string, unknown> };
      saves.push(answers);
      if (refuse) {
        return fail(route, 400, 'اطلاعات واردشده معتبر نیست.', [
          { path: 'answers.capacity', message: 'واحد را از فهرست انتخاب کنید.' },
        ]);
      }
      current = { ...current, answers: { ...current.answers, ...answers } };
      return json(route, current);
    });

    await page.goto('/dashboard/feasibility/p1/questionnaire');
    await expect(page.getByLabel('محصول اصلی')).toHaveValue('کنسانتره');
    await page.getByLabel(/^ظرفیت اسمی/).fill('-5');
    await expect(page.getByText('مقدار نباید کمتر از ۰ باشد.')).toBeVisible();
    await expect(page.getByText('۱ پاسخ نیاز به اصلاح دارد و ذخیره نشده است.')).toBeVisible();
    expect(saves).toEqual([]);
    await expect(page.getByRole('button', { name: /۱\. مشخصات طرح · خطا/ })).toBeVisible();

    // What only the API finds is shown at the same place.
    refuse = true;
    await page.getByLabel(/^ظرفیت اسمی/).fill('120');
    await expect(page.getByText('واحد را از فهرست انتخاب کنید.')).toBeVisible();
    refuse = false;
    await page.getByLabel(/^ظرفیت اسمی/).fill('130');
    await expect.poll(() => saves.at(-1)).toEqual({ capacity: { value: '130', unit: 'تن' } });
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();
    await expect(page.getByText('واحد را از فهرست انتخاب کنید.')).toHaveCount(0);

    // A cell of a table carries its own message.
    await page.getByRole('button', { name: 'مرحله بعد' }).click();
    await page.getByRole('button', { name: 'افزودن سطر به «سهامداران»' }).click();
    const row = page.getByRole('group', { name: 'سطر ۱' });
    await row.getByLabel('درصد سهم').fill('140');
    await expect(row.getByText('مقدار نباید بیشتر از ۱۰۰ باشد.')).toBeVisible();
    await row.getByRole('button', { name: /حذف سطر ۱/ }).click();
    await expect(page.getByText('هنوز سطری وارد نشده است.')).toBeVisible();
  });

  test('has items of its own: the applicant adds and removes theirs, and answers the staff', async ({
    page,
  }) => {
    await signIn(page);
    const staffQuestion = {
      id: 'i1',
      key: 'item_staff',
      kind: 'QUESTION',
      origin: 'staff',
      createdAt: '2026-10-02T08:00:00Z',
      removable: false,
      question: {
        key: 'item_staff',
        type: 'number',
        label: 'فاصله تا پست برق',
        unit: 'کیلومتر',
        required: true,
      },
    };
    let current = questionnaire({
      answers: {
        product: 'کنسانتره',
        capacity: { value: '10', unit: 'تن' },
        company_type: 'private',
      },
      items: [staffQuestion],
    });
    const added: unknown[] = [];
    const removed: string[] = [];
    await page.route(base, (route) => json(route, current));
    await page.route(`${base}/answers`, (route) => {
      const { answers } = route.request().postDataJSON() as { answers: Record<string, unknown> };
      current = { ...current, answers: { ...current.answers, ...answers } };
      return json(route, current);
    });
    await page.route(`${base}/items`, (route) => {
      const body = route.request().postDataJSON() as { kind: string; text?: string };
      added.push(body);
      current = {
        ...current,
        items: [
          ...current.items,
          {
            id: 'i2',
            key: 'item_note',
            kind: 'NOTE',
            origin: 'applicant',
            createdAt: '2026-10-03T08:00:00Z',
            removable: true,
            text: body.text,
          },
        ],
      };
      return json(route, current, 201);
    });
    await page.route(`${base}/items/i2`, (route) => {
      removed.push('i2');
      current = { ...current, items: [staffQuestion] };
      return json(route, current);
    });

    await page.goto('/dashboard/feasibility/p1/questionnaire');
    // The form opens where something is still needed: the question of the staff.
    await expect(page.getByRole('heading', { name: 'موارد اختصاصی و مدارک' })).toBeVisible();
    await expect(page.getByText('افزوده کارشناسان')).toBeVisible();
    await expect(page.getByText('جواز تأسیس')).toBeVisible();
    await page.getByLabel('فاصله تا پست برق').fill('12.5');
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();
    // The staff's item is not the applicant's to remove.
    await expect(page.getByRole('button', { name: 'حذف این مورد' })).toHaveCount(0);

    await page.getByRole('button', { name: 'افزودن', exact: true }).click();
    await expect(page.getByLabel('متن توضیح')).toHaveAttribute('aria-invalid', 'true');
    expect(added).toEqual([]);
    await page.getByLabel('متن توضیح').fill('زمین طرح در اختیار شرکت است.');
    await page.getByRole('button', { name: 'افزودن', exact: true }).click();
    await expect(page.getByText('زمین طرح در اختیار شرکت است.')).toBeVisible();
    expect(added).toEqual([{ kind: 'NOTE', text: 'زمین طرح در اختیار شرکت است.' }]);
    await expect(page.getByText('افزوده شما')).toBeVisible();
    await audit(page);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'حذف این مورد' }).click();
    await expect(page.getByText('زمین طرح در اختیار شرکت است.')).toHaveCount(0);
    expect(removed).toEqual(['i2']);

    await page.getByLabel('نوع مورد').selectOption('QUESTION');
    await expect(page.getByLabel('نوع پاسخ')).toBeVisible();
    await expect(page.getByLabel('متن سؤال')).toBeVisible();
    await page.getByLabel('نوع مورد').selectOption('DOCUMENT');
    await expect(page.getByLabel('عنوان مدرک')).toBeVisible();
  });

  test('loses no answer: not on leaving, not in a refused batch, not when the network fails', async ({
    page,
  }) => {
    await signIn(page);
    let current = questionnaire();
    const saves: Record<string, unknown>[] = [];
    let mode: 'ok' | 'refuse-goals' | 'offline' = 'ok';
    await page.route(base, (route) => json(route, current));
    await page.route(`${base}/answers`, (route) => {
      if (mode === 'offline') return route.abort('connectionfailed');
      const { answers } = route.request().postDataJSON() as { answers: Record<string, unknown> };
      saves.push(answers);
      if (mode === 'refuse-goals' && 'goals' in answers) {
        return fail(route, 400, 'اطلاعات واردشده معتبر نیست.', [
          { path: 'answers.goals', message: 'گزینه را از فهرست انتخاب کنید.' },
        ]);
      }
      current = { ...current, answers: { ...current.answers, ...answers } };
      return json(route, current);
    });

    await page.goto('/dashboard/feasibility/p1/questionnaire');
    await expect(page.getByLabel('محصول اصلی')).toBeVisible();

    // One answer of a request is refused: the other one of the same request is sent again.
    mode = 'refuse-goals';
    await page.getByLabel('محصول اصلی').fill('کنسانتره');
    await page.getByLabel('هدف صادراتی').check();
    await expect(page.getByText('گزینه را از فهرست انتخاب کنید.')).toBeVisible();
    await expect.poll(() => saves.at(-1)).toEqual({ product: 'کنسانتره' });
    await expect(page.getByText('۱ پاسخ نیاز به اصلاح دارد و ذخیره نشده است.')).toBeVisible();
    await expect(page.getByText('۱ از ۵ سؤال پاسخ داده شده')).toBeVisible();
    mode = 'ok';
    await page.getByLabel('هدف صادراتی').uncheck();
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();

    // The network fails: the answer stays queued, the form says so, and a retry sends it.
    mode = 'offline';
    await page.getByLabel(/^ظرفیت اسمی/).fill('500');
    await expect(page.getByText('پاسخ‌های ذخیره‌نشده در فرم مانده‌اند.')).toBeVisible();
    mode = 'ok';
    await page.getByRole('button', { name: 'تلاش دوباره برای ذخیره' }).click();
    await expect.poll(() => saves.at(-1)).toEqual({ capacity: { value: '500', unit: 'تن' } });
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'تلاش دوباره برای ذخیره' })).toHaveCount(0);

    // Leaving through a link of the dashboard right after typing still sends the answer.
    const before = saves.length;
    await page.getByLabel('محصول اصلی').fill('گندله');
    await page.getByRole('link', { name: /بازگشت به پروژه/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/feasibility\/p1$/);
    await expect.poll(() => saves.slice(before)).toEqual([{ product: 'گندله' }]);
  });

  test('turns read-only when the project was submitted elsewhere meanwhile', async ({ page }) => {
    await signIn(page);
    let current = questionnaire();
    await page.route(base, (route) => json(route, current));
    await page.route(`${base}/answers`, (route) => {
      current = questionnaire({ access: { start: false, answer: false, addItems: false } });
      return fail(route, 409, 'پاسخ‌ها پس از ارسال پروژه قفل می‌شوند.');
    });
    await page.goto('/dashboard/feasibility/p1/questionnaire');
    await page.getByLabel('محصول اصلی').fill('کنسانتره');
    await expect(page.getByText(/پاسخ‌ها در این مرحله قفل است/)).toBeVisible();
    await expect(page.getByText('پاسخ‌ها پس از ارسال پروژه قفل می‌شوند.')).toBeVisible();
    await expect(page.getByLabel('محصول اصلی')).toBeDisabled();
  });

  test('says what a submission would still ask for, with every open place marked', async ({
    page,
  }) => {
    await signIn(page);
    let current = questionnaire({
      answers: {
        product: 'کنسانتره',
        capacity: { value: '10', unit: 'تن' },
        // A row without the name its column requires: only the submission minds.
        shareholders: [{ name: null, percent: { value: '60' } }],
      },
    });
    await page.route(base, (route) => json(route, current));
    await page.route(`${base}/answers`, (route) => {
      const { answers } = route.request().postDataJSON() as { answers: Record<string, unknown> };
      current = { ...current, answers: { ...current.answers, ...answers } };
      return json(route, current);
    });

    // The link of a refused submission opens the questionnaire with the check done.
    await page.goto('/dashboard/feasibility/p1/questionnaire?check=1');
    await expect(page.getByRole('heading', { name: 'متقاضی' })).toBeVisible();
    await expect(page.getByRole('button', { name: /۲\. متقاضی · خطا/ })).toBeVisible();
    await expect(page.getByText('۲ پاسخ نیاز به اصلاح دارد و ذخیره نشده است.')).toBeVisible();
    const row = page.getByRole('group', { name: 'سطر ۱' });
    await expect(row.getByLabel('نام سهامدار')).toHaveAttribute('aria-invalid', 'true');
    await audit(page);

    await page.getByLabel('سهامی خاص').check();
    await row.getByLabel('نام سهامدار').fill('رضا کریمی');
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();
    await page.getByRole('button', { name: 'بررسی کامل بودن پرسشنامه' }).click();
    await expect(page.getByText('پرسشنامه کامل است.')).toBeVisible();
    await expect(page.getByRole('button', { name: /· خطا/ })).toHaveCount(0);

    // Without the link nothing is marked until it is asked for.
    await page.getByRole('button', { name: /۱\. مشخصات طرح/ }).click();
    await page.getByLabel('محصول اصلی').fill('');
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();
    await page.getByRole('button', { name: 'بررسی کامل بودن پرسشنامه' }).click();
    await expect(page.getByLabel('محصول اصلی')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: /۱\. مشخصات طرح · خطا/ })).toBeVisible();
  });

  test('shows the message of a date once, and says that files cannot be uploaded yet', async ({
    page,
  }) => {
    await signIn(page);
    const dated = {
      sections: [
        {
          key: 'dates',
          title: 'تاریخ‌ها',
          questions: [
            { key: 'founded', type: 'date', label: 'تاریخ ثبت', min: '2000-01-01' },
            { key: 'license_scan', type: 'file', label: 'تصویر جواز', required: true },
          ],
        },
      ],
      documents: [],
    };
    await page.route(base, (route) =>
      json(route, questionnaire({ definition: dated, answers: { founded: '1990-05-05' } })),
    );
    await page.goto('/dashboard/feasibility/p1/questionnaire?check=1');
    await expect(page.getByText('تاریخ زودتر از بازه مجاز است.')).toHaveCount(1);
    await expect(page.getByText(/بارگذاری فایل برای این سؤال هنوز فعال نیست/)).toBeVisible();
    await expect(page.getByText(/پروژه‌ای که این سؤال الزامی را دارد ارسال نمی‌شود/)).toBeVisible();
    await audit(page);
  });

  test('is only read once the project is submitted', async ({ page }) => {
    await signIn(page);
    await page.route(base, (route) =>
      json(
        route,
        questionnaire({
          answers: {
            product: 'کنسانتره',
            capacity: { value: '10', unit: 'تن' },
            company_type: 'private',
          },
          access: { start: false, answer: false, addItems: false },
        }),
      ),
    );
    await page.goto('/dashboard/feasibility/p1/questionnaire');
    await expect(page.getByText(/پاسخ‌ها در این مرحله قفل است/)).toBeVisible();
    await expect(page.getByLabel('محصول اصلی')).toBeDisabled();
    await expect(page.getByLabel('محصول اصلی')).toHaveValue('کنسانتره');
    await expect(page.getByText('پاسخ‌ها خودکار ذخیره می‌شوند.')).toHaveCount(0);
    await page.getByRole('button', { name: 'مرحله بعد' }).click();
    await expect(page.getByLabel('سهامی خاص')).toBeChecked();
    await expect(page.getByLabel('سهامی خاص')).toBeDisabled();
    await expect(page.getByRole('button', { name: /افزودن سطر/ })).toHaveCount(0);
    await audit(page);
  });

  test('reports a failure with a retry, and a project without a questionnaire', async ({
    page,
  }) => {
    await signIn(page);
    let mode: 'error' | 'none' = 'error';
    await page.route(base, (route) =>
      mode === 'error'
        ? fail(route, 500, 'خطای سرور')
        : json(
            route,
            questionnaire({
              template: null,
              definition: null,
              access: { start: false, answer: false, addItems: false },
            }),
          ),
    );
    await page.goto('/dashboard/feasibility/p1/questionnaire');
    await expect(page.getByText('خطای سرور')).toBeVisible();
    mode = 'none';
    await page.getByRole('button', { name: 'تلاش دوباره' }).click();
    await expect(page.getByText('پرسشنامه‌ای برای شروع نیست')).toBeVisible();
    await expect(page.getByRole('link', { name: /بازگشت به پروژه/ })).toHaveAttribute(
      'href',
      '/dashboard/feasibility/p1',
    );
  });

  test('fits a phone without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page);
    await page.route(base, (route) =>
      json(
        route,
        questionnaire({
          answers: { shareholders: [{ name: 'رضا کریمی', percent: { value: '60' } }] },
        }),
      ),
    );
    await page.goto('/dashboard/feasibility/p1/questionnaire');
    await page.getByRole('button', { name: /۲\. متقاضی/ }).click();
    await expect(page.getByRole('group', { name: 'سطر ۱' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await audit(page);
  });
});
