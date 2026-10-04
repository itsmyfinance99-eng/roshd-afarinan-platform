import AxeBuilder from '@axe-core/playwright';
import { projectModel, type ProjectInput } from '@roshd/financial-engine';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * Result views of a calculation run (ST-34.08): indicators with their warnings, the schedules as
 * tables, the cumulative cash flow chart, scenarios and sensitivity calculated in the browser,
 * the approval of a run, and its download as xlsx, PDF and HTML (ST-34.09).
 */

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', total } });
const json = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: envelope(data) });

async function signIn(page: Page) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    json(route, {
      id: 'u1',
      email: 'u@example.com',
      mobile: null,
      fullName: 'کارشناس',
      roles: ['user', 'expert'],
      permissions: ['financial-models:work'],
      emailVerifiedAt: '2026-09-01T00:00:00Z',
      createdAt: '2026-09-01T00:00:00Z',
    }),
  );
}

const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
const input: ProjectInput & { horizon: { calendar: string } } = {
  horizon: {
    calendar: 'SOLAR_HIJRI',
    start: { year: 1406, month: 1 },
    balanceMonth: 12,
    construction: { periods: 1, periodMonths: 12 },
    startup: { periods: 0, periodMonths: 12 },
    productionYears: 3,
  },
  localCurrency: 'IRR',
  exchangeRates: { USD: ['600000', '600000', '600000', '600000'] },
  investment: {
    items: [
      {
        key: 'ماشین‌آلات',
        group: 'MACHINERY',
        currency: 'USD',
        origin: 'FOREIGN',
        amounts: at({ 0: '1000' }),
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 60,
          salvageRate: '0.1',
          startPeriod: 1,
        },
      },
    ],
  },
  financing: {
    equity: [
      {
        key: 'مؤسسان',
        class: 'ORDINARY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '700000000' }),
      },
    ],
    loans: [],
  },
  operations: {
    products: [
      {
        key: 'میلگرد',
        sales: [
          {
            key: 'داخلی',
            market: 'LOCAL',
            currency: 'IRR',
            quantities: at({ 1: '100', 2: '100', 3: '100' }),
            price: '10000000',
            salesTaxRate: '0',
            subsidyRate: '0',
            subsidyAmount: '0',
            receivablesCoverage: { shareOfYear: '0.1' },
          },
        ],
        finishedGoodsCoverage: none,
        workInProgressCoverage: none,
      },
    ],
    costs: [
      {
        key: 'سنگ آهن',
        category: 'RAW_MATERIALS',
        product: 'میلگرد',
        currency: 'IRR',
        origin: 'LOCAL',
        standard: { mode: 'PER_UNIT', quantity: '1', price: '4000000', fixedCost: '0' },
        stockCoverage: none,
        payablesCoverage: none,
      },
    ],
    cash: { localCoverage: none, foreignCoverage: none, depositShare: '0', depositRate: '0' },
  },
  statements: {
    tax: {
      brackets: [{ lowerLimit: '0', rate: '0.25' }],
      holidayYears: 0,
      lossCarryForwardYears: 3,
    },
    profitDistribution: { retainedShare: '1', shareholders: [] },
    discounting: { totalCapitalRate: '0.2', equityRate: '0.25' },
    referenceYear: 0,
  },
};

// The run as the API stores it: the engine's own result of that input.
const calculated = projectModel(input);

const run = (extra: Record<string, unknown> = {}) => ({
  id: 'r1',
  number: 4,
  modelVersion: 7,
  inputHash: 'a3f1c2d4e5b60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00',
  engineVersion: calculated.modelVersion,
  createdAt: '2026-10-03T09:00:00Z',
  approvedAt: null,
  canApprove: false,
  input,
  results: calculated.value,
  warnings: calculated.warnings,
  defaultsUsed: calculated.defaultsUsed,
  ...extra,
});

const serveRun = (page: Page, data = run()) =>
  page.route('**/api/v1/financial-models/m1/runs/r1', (route) => json(route, data));

const openTab = (page: Page, name: string) => page.getByRole('tab', { name }).click();

test.describe('financial model results', () => {
  test('lists the runs of a model with their state', async ({ page }) => {
    await signIn(page);
    const { input: _input, results: _results, ...summary } = run();
    await page.route('**/api/v1/financial-models/m1/runs?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope(
          [
            { ...summary, canApprove: true },
            { ...summary, id: 'r0', number: 3, approvedAt: '2026-10-02T09:00:00Z' },
          ],
          2,
        ),
      }),
    );
    await page.goto('/dashboard/models/m1/runs');
    const waiting = page.getByRole('link', { name: /اجرای شماره ۴/ });
    await expect(waiting).toContainText('در انتظار تأیید شما');
    await expect(waiting).toHaveAttribute('href', '/dashboard/models/m1/runs/r1');
    await expect(page.getByRole('link', { name: /اجرای شماره ۳/ })).toContainText('تأییدشده');
  });

  test('shows the indicators, the chart and the statements of a run', async ({ page }) => {
    await signIn(page);
    await serveRun(page);
    await page.goto('/dashboard/models/m1/runs/r1');

    await expect(page.getByRole('heading', { name: 'نتایج اجرای شماره ۴' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'کل سرمایه' })).toBeVisible();
    await expect(page.getByText('ارزش فعلی خالص (NPV)').first()).toBeVisible();
    // The chart says what it shows and where its figures are.
    const chart = page.getByRole('img', { name: /نمودار جریان نقد تجمعی کل سرمایه/ });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAccessibleDescription(/جدول «جریان نقدی تنزیل‌شده کل سرمایه»/);
    // Conventions the run used are named.
    await expect(page.getByText(/پیش‌فرض‌های COMFAR که در این اجرا به کار رفت/)).toBeVisible();

    await openTab(page, 'سود و زیان');
    const income = page.getByRole('region', { name: 'صورت سود و زیان' });
    const sales = income.getByRole('row', { name: /^درآمد فروش/ });
    // 100 units at 10 000 000 in each production year; nothing during construction.
    await expect(sales.getByRole('cell')).toHaveText([
      '۰',
      '۱٬۰۰۰٬۰۰۰٬۰۰۰',
      '۱٬۰۰۰٬۰۰۰٬۰۰۰',
      '۱٬۰۰۰٬۰۰۰٬۰۰۰',
    ]);
    await expect(income.getByRole('columnheader')).toHaveText([
      'شرح',
      /ساخت.*۱۴۰۶\/۱۲/,
      /تولید.*۱۴۰۷\/۱۲/,
      /تولید.*۱۴۰۸\/۱۲/,
      /تولید.*۱۴۰۹\/۱۲/,
    ]);

    await page.getByLabel('واحد نمایش مبلغ‌ها').selectOption('1000000');
    await expect(sales.getByRole('cell').nth(1)).toHaveText('۱٬۰۰۰');
    await expect(income.getByText('(مبلغ‌ها به میلیون IRR)')).toBeVisible();

    await openTab(page, 'جریان نقدی تنزیل‌شده');
    const discounted = page.getByRole('region', { name: 'جریان نقدی تنزیل‌شده کل سرمایه' });
    await expect(discounted.getByRole('columnheader').last()).toContainText('پس از تولید');
    await openTab(page, 'ترازنامه');
    // Unit: million. Assets and liabilities are equal in every period.
    const sheet = page.getByRole('region', { name: 'ترازنامه پیش‌بینی‌شده' });
    const totals = ['۷۰۰', '۱٬۰۶۰', '۱٬۴۲۰', '۱٬۷۸۰'];
    await expect(sheet.getByRole('row', { name: /^جمع دارایی‌ها ۷/ }).getByRole('cell')).toHaveText(
      totals,
    );
    await expect(
      sheet.getByRole('row', { name: /^جمع بدهی‌ها و حقوق صاحبان سهام/ }).getByRole('cell'),
    ).toHaveText(totals);
  });

  test('puts a warning next to the indicator it is about', async ({ page }) => {
    await signIn(page);
    await serveRun(
      page,
      run({
        warnings: [
          { code: 'dynamicPayback.notReached', params: { basis: 'equity' } },
          { code: 'cash.underFinanced', params: { periods: '۲' } },
        ],
      }),
    );
    await page.goto('/dashboard/models/m1/runs/r1');
    const equity = page.getByRole('heading', { name: 'آورده' }).locator('..');
    await expect(
      equity.getByText(/ارزش فعلی جریان نقدی تا پایان افق طرح سرمایه را بازنمی‌گرداند/),
    ).toBeVisible();
    const total = page.getByRole('heading', { name: 'کل سرمایه' }).locator('..');
    await expect(total.getByText(/بازنمی‌گرداند/)).toHaveCount(0);
    // A warning that is not about one indicator is listed with the general ones.
    await expect(page.getByRole('note').getByText(/طرح در دوره‌های ۲ کسری نقد دارد/)).toBeVisible();
  });

  test('approves a run once, after asking', async ({ page }) => {
    await signIn(page);
    let approved = false;
    await page.route('**/api/v1/financial-models/m1/runs/r1', (route) =>
      json(
        route,
        run(
          approved
            ? { approvedAt: '2026-10-04T08:00:00Z', canApprove: false }
            : { canApprove: true },
        ),
      ),
    );
    await page.route('**/api/v1/financial-models/m1/runs/r1/approval', (route) => {
      approved = true;
      return json(route, run({ approvedAt: '2026-10-04T08:00:00Z', canApprove: false }));
    });
    await page.goto('/dashboard/models/m1/runs/r1');
    await expect(page.getByText('تأییدنشده')).toBeVisible();
    const messages: string[] = [];
    page.on('dialog', (dialog) => {
      messages.push(dialog.message());
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'تأیید این اجرا' }).click();
    await expect(page.getByText('این اجرا تأیید و قفل شد.')).toBeVisible();
    expect(messages[0]).toContain('قابل بازگشت نیست');
    await expect(page.getByText(/تأییدشده در/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'تأیید این اجرا' })).toHaveCount(0);
  });

  test('offers no approval to someone who may not approve', async ({ page }) => {
    await signIn(page);
    await serveRun(page);
    await page.goto('/dashboard/models/m1/runs/r1');
    await expect(page.getByRole('heading', { name: 'کل سرمایه' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'تأیید این اجرا' })).toHaveCount(0);
  });

  test('compares scenarios and draws the sensitivity tornado in the browser', async ({ page }) => {
    await signIn(page);
    await serveRun(page);
    await page.goto('/dashboard/models/m1/runs/r1');
    await openTab(page, 'سناریو و حساسیت');

    // A scenario needs a name and at least one change.
    await page.getByRole('button', { name: 'محاسبه سناریوها' }).click();
    await expect(page.getByText('برای هر سناریو نامی بنویسید.')).toBeVisible();
    await page.getByLabel('نام سناریوی ۱').fill('بدبینانه');
    await page.getByLabel('قیمت فروش، سناریوی بدبینانه').fill('-۱۰');
    await page.getByRole('button', { name: 'افزودن سناریو' }).click();
    await page.getByLabel('نام سناریوی ۲').fill('خوش‌بینانه');
    await page.getByLabel('قیمت فروش، سناریوی خوش‌بینانه').fill('10');
    await page.getByRole('button', { name: 'محاسبه سناریوها' }).click();

    const comparison = page.getByRole('region', { name: 'مقایسه سناریوها با حالت پایه' });
    await expect(comparison).toBeVisible({ timeout: 30_000 });
    await expect(comparison.getByRole('columnheader')).toHaveText([
      'شاخص',
      'پایه',
      'بدبینانه',
      'خوش‌بینانه',
    ]);
    const npv = comparison.getByRole('row', { name: /^کل سرمایه: ارزش فعلی خالص/ });
    const values = (await npv.getByRole('cell').allTextContents()).map((text) =>
      Number(
        text
          .replace(/[⁦⁩٬]/g, '')
          .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))),
      ),
    );
    // A lower price lowers the NPV, a higher one raises it.
    expect(values[1]).toBeLessThan(values[0]!);
    expect(values[2]).toBeGreaterThan(values[0]!);

    // Sensitivity: the steps are entered by the user.
    await page.getByRole('button', { name: 'محاسبه حساسیت' }).click();
    await expect(page.getByText(/دست‌کم یک درصد تغییر وارد کنید/)).toBeVisible();
    await page.getByLabel(/گام‌های تغییر/).fill('-10 10');
    // Two variables are enough here: every variable and step is a full run of the model.
    for (const name of [
      'مقدار فروش',
      'قیمت اقلام هزینه تولید',
      'مقدار مصرف اقلام هزینه',
      'سرمایه‌گذاری ثابت',
      'نرخ تنزیل',
    ]) {
      await page.getByRole('checkbox', { name, exact: true }).uncheck();
    }
    await page.getByRole('button', { name: 'محاسبه حساسیت' }).click();
    const tornado = page.getByRole('img', { name: 'نمودار گردبادی حساسیت NPV کل سرمایه' });
    await expect(tornado).toBeVisible({ timeout: 30_000 });
    await expect(tornado).toHaveAccessibleDescription(/ارقام در جدول زیر نمودار آمده است/);
    const table = page.getByRole('region', { name: 'جدول حساسیت' });
    await expect(table.getByRole('columnheader')).toHaveText([
      'متغیر',
      'شاخص',
      'پایه',
      /-۱۰٪/,
      /\+۱۰٪/,
    ]);
    await expect(table.getByRole('rowheader', { name: 'نرخ ارز' })).toHaveCount(2);
  });

  test('says so when the results cannot be shown', async ({ page }) => {
    await signIn(page);
    await serveRun(page, run({ results: { other: true } }));
    await page.goto('/dashboard/models/m1/runs/r1');
    await expect(
      page.getByText(/نتایج این اجرا با این نسخه از برنامه قابل نمایش نیست/),
    ).toBeVisible();
  });

  test('shows a plain message for results of another shape, part by part', async ({ page }) => {
    await signIn(page);
    // A run stored by another version of the engine: one schedule is missing.
    const { ratios: _ratios, ...rest } = calculated.value.statements;
    await serveRun(page, run({ results: { ...calculated.value, statements: rest } }));
    await page.goto('/dashboard/models/m1/runs/r1');
    await expect(page.getByRole('heading', { name: 'کل سرمایه' })).toBeVisible();
    await openTab(page, 'نسبت‌ها');
    await expect(
      page.getByText(/نتایج این اجرا با این نسخه از برنامه قابل نمایش نیست/),
    ).toBeVisible();
    // The other parts are still readable.
    await openTab(page, 'سود و زیان');
    await expect(page.getByRole('region', { name: 'صورت سود و زیان' })).toBeVisible();
  });

  test('shows the tables of a run whose input this version cannot analyse', async ({ page }) => {
    await signIn(page);
    // An older snapshot: an input the current schema requires is missing.
    const { cash: _cash, ...operations } = input.operations;
    await serveRun(page, run({ input: { ...input, operations } }));
    await page.goto('/dashboard/models/m1/runs/r1');
    await openTab(page, 'سود و زیان');
    await expect(page.getByRole('region', { name: 'صورت سود و زیان' })).toBeVisible();
    await openTab(page, 'سناریو و حساسیت');
    await expect(page.getByText(/سناریو و حساسیت برای آن در دسترس نیست/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'محاسبه حساسیت' })).toHaveCount(0);
  });

  test('keeps what was typed and calculated while another part is open', async ({ page }) => {
    await signIn(page);
    await serveRun(page);
    await page.goto('/dashboard/models/m1/runs/r1');
    await openTab(page, 'سناریو و حساسیت');
    await page.getByLabel('نام سناریوی ۱').fill('بدبینانه');
    await page.getByLabel('قیمت فروش، سناریوی بدبینانه').fill('-10');
    await page.getByRole('button', { name: 'محاسبه سناریوها' }).click();
    const comparison = page.getByRole('region', { name: 'مقایسه سناریوها با حالت پایه' });
    await expect(comparison).toBeVisible({ timeout: 30_000 });
    await expect(comparison.getByText('(مبلغ‌ها به IRR)')).toBeVisible();

    await openTab(page, 'ترازنامه');
    await expect(comparison).toBeHidden();
    await openTab(page, 'سناریو و حساسیت');
    await expect(page.getByLabel('نام سناریوی ۱')).toHaveValue('بدبینانه');
    await expect(comparison).toBeVisible();
    // Changing an input removes the result that no longer belongs to it.
    await page.getByLabel('قیمت فروش، سناریوی بدبینانه').fill('-20');
    await expect(comparison).toHaveCount(0);

    // A step the model cannot take is refused before anything is calculated.
    await page.getByLabel(/گام‌های تغییر/).fill('-100 10');
    await page.getByRole('button', { name: 'محاسبه حساسیت' }).click();
    await expect(
      page.getByText(/هر گام باید بیشتر از منفی ۱۰۰ و حداکثر ۱۰۰۰ درصد باشد/),
    ).toBeVisible();
    // The same range holds for a scenario, and the message names where it is.
    await page.getByLabel('قیمت فروش، سناریوی بدبینانه').fill('-150');
    await page.getByRole('button', { name: 'محاسبه سناریوها' }).click();
    await expect(
      page.getByText(
        'در سناریوی «بدبینانه»، درصد تغییر «قیمت فروش» باید بیشتر از منفی ۱۰۰ و حداکثر ۱۰۰۰ درصد باشد.',
      ),
    ).toBeVisible();
    // More runs of the model than one analysis may ask for.
    await page.getByLabel(/گام‌های تغییر/).fill('-40 -30 -20 -10 10 20 30 40');
    await page.getByRole('button', { name: 'محاسبه حساسیت' }).click();
    await expect(
      page.getByText(/کل مدل را ۵۶ بار حساب می‌کند؛ حداکثر ۴۸ بار ممکن است/),
    ).toBeVisible();
  });

  test('keeps the page for warnings or defaults of another shape', async ({ page }) => {
    await signIn(page);
    for (const extra of [
      { warnings: null },
      { warnings: [{}] },
      { warnings: [{ code: 'payback.notSustained', params: null }] },
      { defaultsUsed: [null] },
    ]) {
      await serveRun(page, run(extra));
      await page.goto('/dashboard/models/m1/runs/r1');
      await expect(
        page.getByText(/نتایج این اجرا با این نسخه از برنامه قابل نمایش نیست/),
        JSON.stringify(extra),
      ).toBeVisible();
      // The statements are still there.
      await openTab(page, 'سود و زیان');
      await expect(page.getByRole('region', { name: 'صورت سود و زیان' })).toBeVisible();
      await page.unroute('**/api/v1/financial-models/m1/runs/r1');
    }
  });

  test('does not show a line with missing values as if they were empty', async ({ page }) => {
    await signIn(page);
    const { statements } = calculated.value;
    const short = { ...statements.incomeStatement, salesRevenue: ['1'] };
    await serveRun(
      page,
      run({
        results: { ...calculated.value, statements: { ...statements, incomeStatement: short } },
      }),
    );
    await page.goto('/dashboard/models/m1/runs/r1');
    await openTab(page, 'سود و زیان');
    await expect(
      page.getByText(/نتایج این اجرا با این نسخه از برنامه قابل نمایش نیست/),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'صورت سود و زیان' })).toHaveCount(0);
  });

  test('reloads the run when an approval is refused', async ({ page }) => {
    await signIn(page);
    let refused = false;
    await page.route('**/api/v1/financial-models/m1/runs/r1', (route) =>
      json(
        route,
        run(
          refused
            ? { approvedAt: '2026-10-04T08:00:00Z', canApprove: false }
            : { canApprove: true },
        ),
      ),
    );
    await page.route('**/api/v1/financial-models/m1/runs/r1/approval', (route) => {
      refused = true;
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'CONFLICT', message: 'این اجرا پیش‌تر تأیید شده است.' },
        }),
      });
    });
    await page.goto('/dashboard/models/m1/runs/r1');
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'تأیید این اجرا' }).click();
    await expect(page.getByText('این اجرا پیش‌تر تأیید شده است.')).toBeVisible();
    // Someone else approved it meanwhile: the page shows that and offers no approval any more.
    await expect(page.getByText(/تأییدشده در/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'تأیید این اجرا' })).toHaveCount(0);
  });

  test('downloads the run as Excel, PDF and HTML in the unit of the page', async ({ page }) => {
    await signIn(page);
    await serveRun(page);
    const asked: Record<string, string>[] = [];
    await page.route('**/api/v1/financial-models/m1/runs/r1/export?**', (route) => {
      const query = Object.fromEntries(new URL(route.request().url()).searchParams);
      asked.push(query);
      return route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        headers: {
          'Content-Disposition': `attachment; filename="financial-model-run-4.${query.format}"`,
        },
        body: 'file',
      });
    });
    await page.goto('/dashboard/models/m1/runs/r1');
    await expect(page.getByRole('heading', { name: 'دریافت خروجی این اجرا' })).toBeVisible();

    const excel = page.waitForEvent('download');
    await page.getByRole('button', { name: 'خروجی Excel' }).click();
    expect((await excel).suggestedFilename()).toBe('financial-model-run-4.xlsx');
    await expect(page.getByText('فایل Excel این اجرا آماده شد.')).toBeVisible();

    // The files follow the display unit chosen on the page.
    await page.getByLabel('واحد نمایش مبلغ‌ها').selectOption('1000000');
    const pdf = page.waitForEvent('download');
    await page.getByRole('button', { name: 'خروجی PDF' }).click();
    expect((await pdf).suggestedFilename()).toBe('financial-model-run-4.pdf');
    const html = page.waitForEvent('download');
    await page.getByRole('button', { name: 'خروجی HTML' }).click();
    expect((await html).suggestedFilename()).toBe('financial-model-run-4.html');
    await expect(page.getByText('فایل HTML این اجرا آماده شد.')).toBeVisible();
    expect(asked).toEqual([
      { format: 'xlsx', unit: '1' },
      { format: 'pdf', unit: '1000000' },
      { format: 'html', unit: '1000000' },
    ]);
  });

  test('says why a file could not be made and lets the user try again', async ({ page }) => {
    await signIn(page);
    await serveRun(page);
    const message = 'این اجرا برای خروجی PDF بیش از حد بزرگ است؛ خروجی Excel یا HTML بگیرید.';
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v1/financial-models/m1/runs/r1/export?**', async (route) => {
      await held;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'VALIDATION_FAILED', message, requestId: 't' } }),
      });
    });
    await page.goto('/dashboard/models/m1/runs/r1');
    await page.getByRole('button', { name: 'خروجی PDF' }).click();
    // While a file is being made no second one can be asked for.
    await expect(page.getByRole('button', { name: 'در حال آماده‌سازی PDF…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'خروجی Excel' })).toBeDisabled();
    release();
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByRole('button', { name: 'خروجی PDF' })).toBeEnabled();
  });

  test('shows the starting balances of an expansion project', async ({ page }) => {
    await signIn(page);
    // The same project as the expansion of an enterprise that already owns a building.
    const expansion: ProjectInput = {
      ...input,
      investment: {
        items: [
          ...input.investment.items,
          {
            key: 'ساختمان موجود',
            group: 'BUILDINGS',
            currency: 'IRR',
            origin: 'LOCAL',
            amounts: at({}),
          },
        ],
      },
      startingBalances: {
        fixedAssets: [{ item: 'ساختمان موجود', value: '300000000' }],
        materials: [],
        workInProgress: [],
        finishedProducts: [],
        receivables: { value: '50000000', collectionDays: 60 },
        payables: { value: '20000000', paymentDays: 30 },
        cashInHand: '0',
        shortTermDeposits: '0',
        cashSurplus: '10000000',
        loans: [],
        equity: [{ equity: 'مؤسسان', value: '200000000' }],
      },
    };
    const outcome = projectModel(expansion);
    await serveRun(
      page,
      run({
        input: expansion,
        results: outcome.value,
        warnings: outcome.warnings,
        defaultsUsed: outcome.defaultsUsed,
      }),
    );
    await page.goto('/dashboard/models/m1/runs/r1');
    await page.getByLabel('واحد نمایش مبلغ‌ها').selectOption('1000000');

    await openTab(page, 'ترازنامه');
    const sheet = page.getByRole('region', { name: 'ترازنامه پیش‌بینی‌شده' });
    await expect(sheet.getByRole('columnheader').nth(1)).toHaveText(/مانده آغازین.*پیش از طرح/);
    // Building 300, receivables 50 and cash 10 against payables 20 and equity 200: reserves 140.
    await expect(
      sheet
        .getByRole('row', { name: /^جمع دارایی‌ها ۳/ })
        .getByRole('cell')
        .first(),
    ).toHaveText('۳۶۰');
    await expect(
      sheet
        .getByRole('row', { name: /^سود انباشته/ })
        .getByRole('cell')
        .first(),
    ).toHaveText('۱۴۰');

    await openTab(page, 'جریان نقدی تنزیل‌شده');
    const discounted = page.getByRole('region', { name: 'جریان نقدی تنزیل‌شده کل سرمایه' });
    // Fixed and current assets less current liabilities: 300 + 60 − 20.
    await expect(
      discounted
        .getByRole('row', { name: /^مانده آغازین/ })
        .getByRole('cell')
        .first(),
    ).toHaveText('۳۴۰');
    await expect(
      discounted
        .getByRole('row', { name: /^جریان نقد خالص تجمعی/ })
        .getByRole('cell')
        .first(),
    ).toHaveText('-۳۴۰');
  });

  test('calculates the incremental effect against a run without the project', async ({ page }) => {
    await signIn(page);
    await serveRun(page);
    // Without the project the enterprise sells 80 units a year instead of 100.
    const [product] = input.operations.products;
    const without = projectModel({
      ...input,
      operations: {
        ...input.operations,
        products: product
          ? [
              {
                ...product,
                sales: product.sales.map((line) => ({
                  ...line,
                  quantities: at({ 1: '80', 2: '80', 3: '80' }),
                })),
              },
            ]
          : [],
      },
    });
    const { input: _input, results: _results, ...summary } = run();
    await page.route(/\/api\/v1\/financial-models\?/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: envelope([], 0) }),
    );
    await page.route(/\/api\/v1\/financial-models\/m1\/runs\?/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: envelope([summary, { ...summary, id: 'r0', number: 3 }], 2),
      }),
    );
    await page.route('**/api/v1/financial-models/m1/runs/r0', (route) =>
      json(route, run({ id: 'r0', number: 3, results: without.value })),
    );
    await page.goto('/dashboard/models/m1/runs/r1');
    await openTab(page, 'تحلیل افزایشی');

    const choice = page.getByLabel('اجرای حالت «بدون طرح»');
    // The run on screen is not offered as its own base case.
    await expect(choice.locator('option')).toHaveText(['انتخاب کنید', 'اجرای شماره ۳']);
    const calculate = page.getByRole('button', { name: 'محاسبه تحلیل افزایشی' });
    await expect(calculate).toBeDisabled();
    await choice.selectOption('r0');
    await calculate.click();

    await expect(page.getByRole('heading', { name: 'اثر طرح بر کل سرمایه' })).toBeVisible();
    await expect(page.getByText('همین مدل، اجرای شماره ۳')).toBeVisible();
    await page.getByLabel('واحد نمایش مبلغ‌ها').selectOption('1000000');
    const table = page.getByRole('region', {
      name: 'تحلیل افزایشی: جریان نقدی تنزیل‌شده کل سرمایه',
    });
    // 20 units more: 200 of sales less 80 of ore and a quarter of tax, 90 a year; the
    // receivables of a tenth of the yearly cost of 80 are built up first and return at the end.
    await expect(
      table.getByRole('row', { name: /^جریان نقد خالص افزایشی ۰/ }).getByRole('cell'),
    ).toHaveText(['۰', '۸۲', '۹۰', '۹۰', '۸']);
    // No investment is made, so the difference has no rate of return: the page says why.
    await expect(page.getByText('جریان نقدی تغییر علامت ندارد').first()).toBeVisible();
    await expect(
      page.getByRole('region', { name: /تحلیل افزایشی: جریان نقد برای برنامه‌ریزی مالی/ }),
    ).toBeVisible();

    // Another choice removes the result that belonged to the first one.
    await choice.selectOption('');
    await expect(page.getByRole('heading', { name: 'اثر طرح بر کل سرمایه' })).toHaveCount(0);
  });

  test('has no serious accessibility violations in any part', async ({ page }) => {
    await signIn(page);
    await serveRun(page);
    await page.route(/\/api\/v1\/financial-models(\/m1\/runs)?\?/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: envelope([], 0) }),
    );
    await page.goto('/dashboard/models/m1/runs/r1');
    await expect(page.getByRole('heading', { name: 'کل سرمایه' })).toBeVisible();
    for (const name of [
      'خلاصه و شاخص‌ها',
      'سود و زیان',
      'جریان نقد',
      'ترازنامه',
      'جریان نقدی تنزیل‌شده',
      'نسبت‌ها',
      'سناریو و حساسیت',
      'تحلیل افزایشی',
    ]) {
      await page.getByRole('tab', { name, exact: true }).click();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations
        .filter(
          (v) => v.impact === 'serious' || v.impact === 'critical' || v.id === 'heading-order',
        )
        .map((v) => ({ rule: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
      expect(blocking, `axe violations in «${name}»`).toEqual([]);
    }
  });
});
