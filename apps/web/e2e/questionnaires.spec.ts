import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * Questionnaire templates for the staff of the feasibility platform (ST-35.04): the list, a new
 * template, the editor of its content with the keyboard, the preview, and saving and publishing
 * a version.
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

async function signIn(page: Page, permissions: string[] = ['feasibility:manage']) {
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

const template = (over: object = {}) => ({
  id: 't1',
  title: 'پرسشنامه طرح‌های معدنی',
  sector: 'معدنی',
  isDemo: false,
  archivedAt: null,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-02T08:00:00Z',
  published: null,
  draft: { version: 1, updatedAt: '2026-10-02T08:00:00Z' },
  versions: [
    {
      version: 1,
      status: 'DRAFT',
      updatedAt: '2026-10-02T08:00:00Z',
      publishedAt: null,
      publishedBy: null,
    },
  ],
  draftDefinition: { sections: [], documents: [] },
  publishedDefinition: null,
  ...over,
});

const filled = {
  sections: [
    {
      key: 's1',
      title: 'مشخصات طرح',
      questions: [
        { key: 'q1', type: 'text', label: 'محصول اصلی', required: true },
        { key: 'q2', type: 'number', label: 'ظرفیت اسمی', unit: 'تن' },
      ],
    },
  ],
  documents: [{ key: 'd1', label: 'جواز تأسیس', required: true }],
};

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical' || v.id === 'heading-order')
    .map((v) => ({ rule: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  expect(blocking, `axe violations on ${page.url()}`).toEqual([]);
}

test.describe('questionnaire templates', () => {
  test('lists the templates with their state and starts a new one', async ({ page }) => {
    await signIn(page);
    let mode: 'error' | 'empty' | 'full' = 'error';
    const queries: URLSearchParams[] = [];
    let created: unknown;
    await page.route('**/api/v1/questionnaire-templates?*', (route) => {
      queries.push(new URL(route.request().url()).searchParams);
      return mode === 'error'
        ? fail(route, 500, 'خطای سرور')
        : mode === 'empty'
          ? json(route, [], 0)
          : json(
              route,
              [
                template({ published: { version: 2, publishedAt: '2026-10-02T08:00:00Z' } }),
                template({
                  id: 't2',
                  title: 'پرسشنامه عمومی طرح توجیهی',
                  sector: null,
                  isDemo: true,
                  draft: null,
                  published: { version: 1, publishedAt: '2026-10-01T08:00:00Z' },
                }),
              ],
              2,
            );
    });
    await page.route('**/api/v1/questionnaire-templates', (route) => {
      created = route.request().postDataJSON();
      return json(route, template({ id: 't9', title: 'قالب انرژی', sector: 'انرژی' }), 1, 201);
    });
    await page.route('**/api/v1/questionnaire-templates/t9', (route) =>
      json(route, template({ id: 't9', title: 'قالب انرژی', sector: 'انرژی' })),
    );

    await page.goto('/dashboard/manage/questionnaires');
    await expect(page.getByText('خطای سرور')).toBeVisible();
    mode = 'empty';
    await page.getByRole('button', { name: 'تلاش دوباره' }).click();
    await expect(page.getByText('هنوز قالبی ساخته نشده است')).toBeVisible();

    mode = 'full';
    await page.reload();
    const first = page.getByRole('link', { name: /پرسشنامه طرح‌های معدنی/ });
    await expect(first).toHaveAttribute('href', '/dashboard/manage/questionnaires/t1');
    await expect(first).toContainText('نسخه ۲ منتشر شده · پیش‌نویس نسخه ۱');
    const demo = page.getByRole('link', { name: /پرسشنامه عمومی طرح توجیهی/ });
    await expect(demo).toContainText('نمونه نمایشی');
    await expect(demo).toContainText('عمومی');
    await expect(
      page.getByRole('navigation', { name: 'منوی داشبورد' }).getByRole('link', {
        name: 'قالب‌های پرسشنامه',
        exact: true,
      }),
    ).toHaveAttribute('aria-current', 'page');
    await audit(page);

    await page.getByRole('button', { name: 'بایگانی', exact: true }).click();
    await expect.poll(() => queries.at(-1)?.get('state')).toBe('archived');

    await page.getByRole('button', { name: 'قالب تازه' }).click();
    await page.getByRole('button', { name: 'ساخت قالب' }).click();
    await expect(page.getByText(/حداقل ۳ نویسه/)).toBeVisible();
    expect(created).toBeUndefined();
    await page.getByLabel('عنوان قالب').fill('قالب انرژی');
    await page.getByLabel('حوزه طرح').selectOption('انرژی');
    await page.getByRole('button', { name: 'ساخت قالب' }).click();
    await expect(page).toHaveURL(/\/dashboard\/manage\/questionnaires\/t9$/);
    expect(created).toEqual({ title: 'قالب انرژی', sector: 'انرژی' });
    await expect(page.getByRole('heading', { name: 'قالب انرژی' })).toBeVisible();
  });

  test('builds a questionnaire with the keyboard, previews it and publishes it', async ({
    page,
  }) => {
    await signIn(page);
    let saved: { definition: typeof filled } | undefined;
    let publishedCalls = 0;
    await page.route('**/api/v1/questionnaire-templates/t1', (route) => json(route, template()));
    await page.route('**/api/v1/questionnaire-templates/t1/draft', (route) => {
      saved = route.request().postDataJSON() as { definition: typeof filled };
      return json(route, template({ draftDefinition: saved.definition }));
    });
    await page.route('**/api/v1/questionnaire-templates/t1/publish', (route) => {
      publishedCalls += 1;
      return json(
        route,
        template({
          draft: null,
          draftDefinition: null,
          published: { version: 1, publishedAt: '2026-10-03T08:00:00Z' },
          publishedDefinition: saved?.definition,
          versions: [
            {
              version: 1,
              status: 'PUBLISHED',
              updatedAt: '2026-10-03T08:00:00Z',
              publishedAt: '2026-10-03T08:00:00Z',
              publishedBy: { id: 'u1', fullName: 'مریم احمدی' },
            },
          ],
        }),
      );
    });

    await page.goto('/dashboard/manage/questionnaires/t1');
    await expect(page.getByRole('heading', { name: 'پرسشنامه طرح‌های معدنی' })).toBeVisible();
    // Nothing to save yet.
    await expect(page.getByRole('button', { name: 'ذخیره پیش‌نویس' })).toBeDisabled();

    await page.getByRole('button', { name: 'افزودن بخش' }).click();
    await page.getByLabel('عنوان بخش ۱').fill('مشخصات طرح');
    const section = page.getByRole('region', { name: 'بخش ۱' });
    await section.getByRole('button', { name: 'افزودن سؤال به بخش ۱' }).click();
    await section.getByLabel('متن سؤال ۱').fill('نوع شرکت');
    await section.getByLabel('نوع پاسخ').selectOption('single_choice');
    await section.getByLabel('گزینه‌ها').fill('سهامی خاص\nسهامی عام\nتعاونی');
    await section.getByLabel('گزینه‌ها').blur();
    await section.getByRole('button', { name: 'افزودن سؤال به بخش ۱' }).click();
    await section.getByLabel('متن سؤال ۲').fill('ظرفیت اسمی');
    await section.getByLabel('نوع پاسخ').nth(1).selectOption('number');
    await section.getByLabel('واحد').fill('تن');
    await section.getByLabel('واحد').blur();
    await section.getByRole('switch', { name: 'پاسخ الزامی است' }).nth(1).check();

    // The second question goes up with the keyboard, keeps the focus, and the move is announced.
    const up = section.getByRole('button', { name: 'بالا بردن سؤال ۲ از بخش ۱' });
    await up.focus();
    await page.keyboard.press('Enter');
    await expect(section.getByLabel('متن سؤال ۱')).toHaveValue('ظرفیت اسمی');
    await expect(section.getByLabel('متن سؤال ۲')).toHaveValue('نوع شرکت');
    await expect(
      page.getByRole('status').filter({ hasText: 'سؤال ۲ به جایگاه ۱ رفت.' }),
    ).toHaveCount(1);
    await expect(section.getByRole('button', { name: 'بالا بردن سؤال ۱ از بخش ۱' })).toBeDisabled();

    await page.getByRole('button', { name: 'افزودن مدرک' }).click();
    await page.getByLabel('عنوان مدرک ۱').fill('جواز تأسیس');
    await expect(page.getByText('تغییرهای ذخیره‌نشده دارید')).toBeVisible();
    await audit(page);

    await page.getByRole('button', { name: 'پیش‌نمایش', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'مشخصات طرح' })).toBeVisible();
    await expect(page.getByText('سهامی عام')).toBeVisible();
    await expect(page.getByText('جواز تأسیس')).toBeVisible();
    await audit(page);

    await page.getByRole('button', { name: 'ذخیره پیش‌نویس' }).click();
    await expect(page.getByText('پیش‌نویس ذخیره شد.')).toBeVisible();
    expect(saved?.definition).toEqual({
      sections: [
        {
          key: 's1',
          title: 'مشخصات طرح',
          questions: [
            { key: 'q2', type: 'number', label: 'ظرفیت اسمی', unit: 'تن', required: true },
            {
              key: 'q1',
              type: 'single_choice',
              label: 'نوع شرکت',
              options: [
                { value: 'o1', label: 'سهامی خاص' },
                { value: 'o2', label: 'سهامی عام' },
                { value: 'o3', label: 'تعاونی' },
              ],
            },
          ],
        },
      ],
      documents: [{ key: 'd1', label: 'جواز تأسیس' }],
    });

    // Publishing asks first; declining publishes nothing.
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByRole('button', { name: 'انتشار نسخه' }).click();
    await expect(page.getByText('پیش‌نویس ذخیره شد.')).toBeVisible();
    expect(publishedCalls).toBe(0);
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('نسخه ۱ منتشر شود؟');
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'انتشار نسخه' }).click();
    await expect(page.getByText('نسخه ۱ منتشر شد.')).toBeVisible();
    await expect(page.getByText('نسخه ۱ منتشر شده است')).toBeVisible();
    // Without a draft and without a change there is nothing to publish again.
    await expect(page.getByRole('button', { name: 'انتشار نسخه' })).toBeDisabled();

    await page.getByRole('button', { name: 'نسخه‌ها', exact: true }).click();
    await expect(page.getByText('منتشرشده', { exact: true })).toBeVisible();
    await expect(page.getByText(/مریم احمدی/).last()).toBeVisible();
  });

  test('says where the questionnaire is wrong, before and after asking the API', async ({
    page,
  }) => {
    await signIn(page);
    let calls = 0;
    await page.route('**/api/v1/questionnaire-templates/t1', (route) =>
      json(
        route,
        template({
          draft: { version: 2, updatedAt: '2026-10-02T08:00:00Z' },
          published: { version: 1, publishedAt: '2026-10-01T08:00:00Z' },
          draftDefinition: filled,
          publishedDefinition: filled,
        }),
      ),
    );
    await page.route('**/api/v1/questionnaire-templates/t1/draft', (route) => {
      calls += 1;
      return route.request().method() === 'DELETE'
        ? json(
            route,
            template({
              draft: null,
              draftDefinition: null,
              published: { version: 1, publishedAt: '2026-10-01T08:00:00Z' },
              publishedDefinition: filled,
            }),
          )
        : fail(route, 400, 'اطلاعات واردشده معتبر نیست.', [
            {
              path: 'definition.sections.0.questions.1.max',
              message: 'کمینه نباید از بیشینه بزرگ‌تر باشد.',
            },
          ]);
    });

    await page.goto('/dashboard/manage/questionnaires/t1');
    const section = page.getByRole('region', { name: 'بخش ۱' });
    await expect(section.getByLabel('متن سؤال ۱')).toHaveValue('محصول اصلی');

    // An empty label is caught in the browser.
    await section.getByLabel('متن سؤال ۱').fill('');
    await page.getByRole('button', { name: 'ذخیره پیش‌نویس' }).click();
    await expect(page.getByText('پرسشنامه ایراد دارد و ذخیره نشد.')).toBeVisible();
    await expect(page.getByText(/بخش «مشخصات طرح»، سؤال ۱:/)).toBeVisible();
    expect(calls).toBe(0);

    // What only the API finds is shown at the same place.
    await section.getByLabel('متن سؤال ۱').fill('محصول اصلی');
    await page.getByRole('button', { name: 'ذخیره پیش‌نویس' }).click();
    await expect(
      page.getByText('بخش «مشخصات طرح»، سؤال ۲: کمینه نباید از بیشینه بزرگ‌تر باشد.'),
    ).toBeVisible();
    await expect(page.getByText('تغییرهای ذخیره‌نشده دارید')).toBeVisible();

    // The draft is dropped for the published version.
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'کنار گذاشتن پیش‌نویس' }).click();
    await expect(page.getByText('پیش‌نویس کنار گذاشته شد.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'کنار گذاشتن پیش‌نویس' })).toHaveCount(0);
  });

  test('changes the facts of a template and freezes it while archived', async ({ page }) => {
    await signIn(page);
    const patches: unknown[] = [];
    let current: Record<string, unknown> = template({ draftDefinition: filled, isDemo: true });
    await page.route('**/api/v1/questionnaire-templates/t1', (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as { archived?: boolean; title?: string };
        patches.push(body);
        current = {
          ...current,
          ...(body.title ? { title: body.title } : {}),
          ...(body.archived !== undefined
            ? { archivedAt: body.archived ? '2026-10-03T08:00:00Z' : null }
            : {}),
        };
      }
      return json(route, current);
    });

    await page.goto('/dashboard/manage/questionnaires/t1');
    await expect(page.getByText('نمونه نمایشی')).toBeVisible();
    await page.getByLabel('عنوان قالب').fill('پرسشنامه معدن و فرآوری');
    await page.getByRole('button', { name: 'ذخیره مشخصات' }).click();
    await expect(page.getByText('مشخصات قالب ذخیره شد.')).toBeVisible();
    expect(patches[0]).toEqual({ title: 'پرسشنامه معدن و فرآوری', sector: 'معدنی' });
    await expect(page.getByRole('heading', { name: 'پرسشنامه معدن و فرآوری' })).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'بایگانی قالب' }).click();
    await expect(page.getByText(/این قالب بایگانی شده است/)).toBeVisible();
    expect(patches[1]).toEqual({ archived: true });
    await expect(page.getByLabel('متن سؤال ۱')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'ذخیره پیش‌نویس' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'انتشار نسخه' })).toHaveCount(0);
    await audit(page);

    await page.getByRole('button', { name: 'بازگرداندن از بایگانی' }).click();
    await expect(page.getByLabel('متن سؤال ۱')).toBeEnabled();
    expect(patches[2]).toEqual({ archived: false });
  });

  test('keeps the focus with the part that moves or goes, and gives back what a type had', async ({
    page,
  }) => {
    await signIn(page);
    const three = {
      sections: [
        {
          key: 's1',
          title: 'مشخصات طرح',
          questions: [
            { key: 'q1', type: 'text', label: 'محصول اصلی' },
            {
              key: 'q2',
              type: 'table',
              label: 'سهامداران',
              columns: [
                { key: 'c1', type: 'text', label: 'نام' },
                { key: 'c2', type: 'number', label: 'درصد', unit: 'درصد' },
              ],
            },
            { key: 'q3', type: 'long_text', label: 'سابقه' },
          ],
        },
      ],
      documents: [],
    };
    await page.route('**/api/v1/questionnaire-templates/t1', (route) =>
      json(route, template({ draftDefinition: three })),
    );
    await page.goto('/dashboard/manage/questionnaires/t1');
    const section = page.getByRole('region', { name: 'بخش ۱' });

    // Down twice with the keyboard: the focus goes with the question each time.
    await section.getByRole('button', { name: 'پایین بردن سؤال ۱ از بخش ۱' }).focus();
    await page.keyboard.press('Enter');
    await expect(section.getByRole('button', { name: 'پایین بردن سؤال ۲ از بخش ۱' })).toBeFocused();
    await page.keyboard.press('Enter');
    const last = section.getByRole('button', { name: 'پایین بردن سؤال ۳ از بخش ۱' });
    await expect(last).toBeFocused();
    await expect(section.getByLabel('متن سؤال ۳')).toHaveValue('محصول اصلی');
    // At the end the button says so and still holds the focus; pressing it changes nothing.
    await expect(last).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await expect(section.getByLabel('متن سؤال ۳')).toHaveValue('محصول اصلی');
    await expect(last).toBeFocused();

    // Up, and the same holds.
    await section.getByRole('button', { name: 'بالا بردن سؤال ۳ از بخش ۱' }).focus();
    await page.keyboard.press('Enter');
    await expect(section.getByRole('button', { name: 'بالا بردن سؤال ۲ از بخش ۱' })).toBeFocused();
    await expect(section.getByLabel('متن سؤال ۲')).toHaveValue('محصول اصلی');

    // A removed question hands the focus to its neighbour.
    await section.getByRole('button', { name: 'حذف سؤال ۲ از بخش ۱' }).focus();
    await page.keyboard.press('Enter');
    await expect(section.getByLabel('متن سؤال ۲')).toHaveValue('سابقه');
    await expect(section.getByRole('button', { name: 'حذف سؤال ۲ از بخش ۱' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(section.getByRole('button', { name: 'حذف سؤال ۱ از بخش ۱' })).toBeFocused();

    // One wrong key on the type list does not cost the columns of the table.
    await expect(section.getByLabel('عنوان ستون ۲')).toHaveValue('درصد');
    await section.getByLabel('نوع پاسخ').selectOption('file');
    await expect(section.getByLabel('عنوان ستون ۱')).toHaveCount(0);
    await section.getByLabel('نوع پاسخ').selectOption('table');
    await expect(section.getByLabel('عنوان ستون ۲')).toHaveValue('درصد');
    await expect(section.getByLabel('واحد')).toHaveValue('درصد');

    // Between the two kinds of choice the options go along as they are now.
    await section.getByLabel('نوع پاسخ').selectOption('single_choice');
    await section.getByLabel('گزینه‌ها').fill('الف\nب');
    await section.getByLabel('نوع پاسخ').selectOption('multiple_choice');
    await section.getByLabel('گزینه‌ها').fill('الف\nب\nج');
    await section.getByLabel('نوع پاسخ').selectOption('single_choice');
    await expect(section.getByLabel('گزینه‌ها')).toHaveValue('الف\nب\nج');
    await page.getByRole('button', { name: 'پیش‌نمایش', exact: true }).click();
    await expect(page.getByText('ج', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'ویرایش', exact: true }).click();
    await section.getByLabel('نوع پاسخ').selectOption('table');

    // A table keeps its last column.
    await section.getByRole('button', { name: 'حذف ستون ۲' }).click();
    await expect(section.getByLabel('عنوان ستون ۲')).toHaveCount(0);
    const only = section.getByRole('button', { name: 'حذف ستون ۱' });
    await expect(only).toHaveAttribute('aria-disabled', 'true');
    await only.click({ force: true });
    await expect(section.getByLabel('عنوان ستون ۱')).toHaveValue('نام');
  });

  test('starts the fields afresh when the draft is dropped for the published version', async ({
    page,
  }) => {
    await signIn(page);
    const withOptions = (labels: string[]) => ({
      sections: [
        {
          key: 's1',
          title: 'متقاضی',
          questions: [
            {
              key: 'q1',
              type: 'single_choice',
              label: 'نوع شرکت',
              options: labels.map((label, i) => ({ value: `o${i + 1}`, label })),
            },
          ],
        },
      ],
      documents: [],
    });
    const published = withOptions(['سهامی خاص', 'سهامی عام']);
    let saved: unknown;
    const state = {
      draft: { version: 2, updatedAt: '2026-10-02T08:00:00Z' },
      published: { version: 1, publishedAt: '2026-10-01T08:00:00Z' },
      publishedDefinition: published,
    };
    await page.route('**/api/v1/questionnaire-templates/t1', (route) =>
      json(route, template({ ...state, draftDefinition: published })),
    );
    await page.route('**/api/v1/questionnaire-templates/t1/draft', (route) => {
      if (route.request().method() === 'DELETE') {
        return json(route, template({ ...state, draft: null, draftDefinition: null }));
      }
      saved = (route.request().postDataJSON() as { definition: unknown }).definition;
      return json(route, template({ ...state, draftDefinition: saved }));
    });

    await page.goto('/dashboard/manage/questionnaires/t1');
    const options = page.getByLabel('گزینه‌ها');
    await expect(options).toHaveValue('سهامی خاص\nسهامی عام');
    // Typing is a change at once, without leaving the field.
    await options.fill('سهامی خاص\nسهامی عام\nتعاونی');
    await expect(page.getByText('تغییرهای ذخیره‌نشده دارید')).toBeVisible();
    const save = page.getByRole('button', { name: 'ذخیره پیش‌نویس' });
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('پیش‌نویس ذخیره شد.')).toBeVisible();
    expect(saved).toEqual(withOptions(['سهامی خاص', 'سهامی عام', 'تعاونی']));
    // The button has done its work and keeps the focus.
    await expect(save).toBeFocused();
    await expect(save).toHaveAttribute('aria-disabled', 'true');

    // Walking through the field changes nothing.
    await options.focus();
    await options.blur();
    await expect(page.getByText('تغییرهای ذخیره‌نشده دارید')).toHaveCount(0);
    await expect(page.getByText('پیش‌نویس ذخیره شد.')).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'کنار گذاشتن پیش‌نویس' }).click();
    await expect(page.getByText('پیش‌نویس کنار گذاشته شد.')).toBeVisible();
    await expect(options).toHaveValue('سهامی خاص\nسهامی عام');
    await options.focus();
    await options.blur();
    await expect(page.getByText('تغییرهای ذخیره‌نشده دارید')).toHaveCount(0);
  });

  test('works on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page);
    await page.route('**/api/v1/questionnaire-templates/t1', (route) =>
      json(route, template({ draftDefinition: filled })),
    );
    await page.goto('/dashboard/manage/questionnaires/t1');
    await expect(page.getByLabel('متن سؤال ۱')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await audit(page);
  });

  test('is closed to a user without the right', async ({ page }) => {
    await signIn(page, []);
    await page.goto('/dashboard/manage/questionnaires');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await page.goto('/dashboard/manage/questionnaires/t1');
    await expect(page.getByText('اجازه دسترسی به این بخش را ندارید.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'قالب‌های پرسشنامه' })).toHaveCount(0);
  });
});
