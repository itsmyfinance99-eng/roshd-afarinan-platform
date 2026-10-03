import AxeBuilder from '@axe-core/playwright';
import { projectModel, type ProjectInput } from '@roshd/financial-engine';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * Result views of a calculation run (ST-34.08): indicators with their warnings, the schedules as
 * tables, the cumulative cash flow chart, scenarios and sensitivity calculated in the browser,
 * and the approval of a run.
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
    await page.getByRole('button', { name: 'محاسبه حساسیت' }).click();
    const tornado = page.getByRole('img', { name: 'نمودار گردبادی حساسیت NPV کل سرمایه' });
    await expect(tornado).toBeVisible();
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

  test('has no serious accessibility violations in any part', async ({ page }) => {
    await signIn(page);
    await serveRun(page);
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
