import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route, test } from '@playwright/test';

/**
 * Editor of a financial model's inputs (ST-34.07): tabular entry with the keyboard and Persian
 * numbers, saving on its own, and the live calculation that runs the engine in the browser.
 */

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', total } });
const json = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: envelope(data) });

async function signIn(page: Page, permissions = ['financial-models:work']) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/auth/me', (route) =>
    json(route, {
      id: 'u1',
      email: 'u@example.com',
      mobile: null,
      fullName: 'کارشناس',
      roles: ['user', 'expert'],
      permissions,
      emailVerifiedAt: '2026-09-01T00:00:00Z',
      createdAt: '2026-09-01T00:00:00Z',
    }),
  );
}

const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
/** A small complete model: one machine bought in dollars, one product, one material. */
const inputs = () => ({
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
      {
        key: 'ساختمان',
        group: 'BUILDINGS',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '50000000' }),
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
});

const model = (extra: Record<string, unknown> = {}) => ({
  id: 'm1',
  title: 'طرح میلگرد',
  version: 3,
  schemaVersion: 1,
  createdAt: '2026-10-01T09:00:00Z',
  updatedAt: '2026-10-02T09:00:00Z',
  inputs: inputs(),
  access: { edit: true, approve: false, assign: false, remove: true },
  ...extra,
});

interface Saved {
  title: string;
  version: number;
  inputs: ReturnType<typeof inputs>;
}

/** Serves the model and records what the editor saves. */
async function serveModel(page: Page, loaded = model(), onSave?: (route: Route) => Promise<void>) {
  const saves: Saved[] = [];
  await page.route('**/api/v1/financial-models/m1', async (route) => {
    if (route.request().method() !== 'PUT') return json(route, loaded);
    const body = route.request().postDataJSON() as Saved;
    saves.push(body);
    if (onSave) return onSave(route);
    return json(route, { ...loaded, ...body, version: body.version + 1 });
  });
  return saves;
}

const openSection = (page: Page, name: string) => page.getByRole('tab', { name }).click();

test.describe('financial model editor', () => {
  test('creates a model from the list and opens its editor', async ({ page }) => {
    await signIn(page);
    let created: Record<string, unknown> | undefined;
    await page.route('**/api/v1/financial-models?**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: envelope([], 0) }),
    );
    await page.route('**/api/v1/financial-models', async (route) => {
      created = route.request().postDataJSON() as Record<string, unknown>;
      await json(route, model({ inputs: created.inputs, title: created.title, version: 1 }), 201);
    });
    await serveModel(page, model({ inputs: {}, version: 1 }));

    await page.goto('/dashboard/models');
    await expect(page.getByText('هنوز مدلی ساخته نشده است')).toBeVisible();
    await page.getByLabel(/عنوان مدل تازه/).fill('طرح میلگرد');
    await page.getByRole('button', { name: 'ساخت مدل' }).click();

    await expect(page).toHaveURL(/\/dashboard\/models\/m1$/);
    expect(created).toMatchObject({ title: 'طرح میلگرد', inputs: { investment: { items: [] } } });
    // A new model has nothing yet: the editor says what a calculation needs.
    await expect(page.getByText(/برای محاسبه هنوز .* مورد لازم است/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'ثبت اجرای محاسبه' })).toBeDisabled();
  });

  test('calculates live in the browser with the engine', async ({ page }) => {
    await signIn(page);
    await serveModel(page);
    await page.goto('/dashboard/models/m1');

    const result = page.getByRole('region', { name: 'نتیجه زنده' });
    await expect(result.getByRole('heading', { name: 'کل سرمایه' })).toBeVisible();
    await expect(result.getByText('ارزش فعلی خالص (NPV)').first()).toBeVisible();
    await expect(result.getByText(/درصد$/).first()).toBeVisible();
    // Conventions left open are named, never applied silently.
    await expect(result.getByText(/تاریخ مرجع تنزیل: پایان سال اول/)).toBeVisible();
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();
  });

  test('takes Persian numbers in a period table and saves on its own', async ({ page }) => {
    await signIn(page);
    const saves = await serveModel(page);
    await page.goto('/dashboard/models/m1');
    await openSection(page, 'سرمایه‌گذاری');

    const grid = page.getByRole('region', { name: 'مبلغ سرمایه‌گذاری در هر دوره' });
    const cell = grid.getByRole('textbox', { name: 'ماشین‌آلات (USD)، ساخت ۱۴۰۶/۱۲' });
    // Stored 1000 is shown with Persian digits and a thousands separator.
    await expect(cell).toHaveValue('۱٬۰۰۰');
    await cell.fill('۲٬۵۰۰٫۵');
    await cell.blur();
    await expect(cell).toHaveValue('۲٬۵۰۰٫۵');

    await expect.poll(() => saves.at(-1)?.inputs.investment.items[0]?.amounts[0]).toBe('2500.5');
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();
    expect(saves[0]?.version).toBe(3);
    const before = saves.length;

    // The next save builds on the version the first one returned.
    await cell.fill('3000');
    await expect.poll(() => saves.length).toBeGreaterThan(before);
    expect(saves.at(-1)?.version).toBe(3 + before);
  });

  test('moves between cells with the keyboard and pastes a block', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'clipboard events are synthesised for Chromium');
    await signIn(page);
    const saves = await serveModel(page);
    await page.goto('/dashboard/models/m1');
    await openSection(page, 'سرمایه‌گذاری');

    const grid = page.getByRole('region', { name: 'مبلغ سرمایه‌گذاری در هر دوره' });
    const first = grid.getByRole('textbox', { name: 'ماشین‌آلات (USD)، ساخت ۱۴۰۶/۱۲' });
    await first.focus();
    await page.keyboard.press('ArrowDown');
    await expect(grid.getByRole('textbox', { name: 'ساختمان (IRR)، ساخت ۱۴۰۶/۱۲' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    // The table reads right to left: the next period is reached with the left arrow.
    await page.keyboard.press('ArrowLeft');
    const next = grid.getByRole('textbox', { name: 'ماشین‌آلات (USD)، تولید ۱۴۰۷/۱۲' });
    await expect(next).toBeFocused();

    // Two rows and two columns copied from a spreadsheet.
    await next.evaluate((input) => {
      const data = new DataTransfer();
      data.setData('text/plain', '10\t20\n1,000\t۲٬۰۰۰\n');
      input.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await expect.poll(() => saves.length).toBeGreaterThan(0);
    const stored = saves.at(-1)?.inputs.investment.items;
    expect(stored?.[0]?.amounts).toEqual(['1000', '10', '20', '0']);
    expect(stored?.[1]?.amounts).toEqual(['50000000', '1000', '2000', '0']);
  });

  test('shows rates in percent and stores fractions', async ({ page }) => {
    await signIn(page);
    const saves = await serveModel(page);
    await page.goto('/dashboard/models/m1');

    const rate = page.getByLabel(/نرخ تنزیل کل سرمایه/);
    await expect(rate).toHaveValue('۲۰');
    await rate.fill('۱۸٫۵');
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0]?.inputs.statements.discounting.totalCapitalRate).toBe('0.185');
  });

  test('lists what a calculation needs and leads to its section', async ({ page }) => {
    await signIn(page);
    const incomplete = inputs();
    incomplete.exchangeRates.USD[2] = '';
    // @ts-expect-error the coverage is removed to make the draft incomplete
    delete incomplete.operations.cash.depositRate;
    await serveModel(page, model({ inputs: incomplete }));
    await page.goto('/dashboard/models/m1');

    const result = page.getByRole('region', { name: 'نتیجه زنده' });
    await expect(result.getByText('برای محاسبه هنوز ۲ مورد لازم است:')).toBeVisible();
    await expect(page.getByRole('tab', { name: /سرمایه در گردش/ })).toContainText('۱');
    await result.getByRole('button', { name: /سرمایه در گردش › وجه نقد › نرخ سپرده/ }).click();
    await expect(page.getByRole('tab', { name: /سرمایه در گردش/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel(/نرخ سالانه سپرده کوتاه‌مدت/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    // Filling the two inputs brings the result back.
    await page.getByLabel(/نرخ سالانه سپرده کوتاه‌مدت/).fill('0');
    await openSection(page, 'فرض‌ها');
    await page.getByRole('textbox', { name: 'USD، تولید ۱۴۰۸/۱۲' }).fill('600000');
    await expect(result.getByRole('heading', { name: 'کل سرمایه' })).toBeVisible();
  });

  test('reports an input the engine refuses at its field', async ({ page }) => {
    await signIn(page);
    const refused = inputs();
    // Depreciation cannot start in a construction period.
    refused.investment.items[0]!.depreciation!.startPeriod = 0;
    await serveModel(page, model({ inputs: refused }));
    await page.goto('/dashboard/models/m1');
    const result = page.getByRole('region', { name: 'نتیجه زنده' });
    await expect(
      result.getByText(/شروع استهلاک باید اولین روز یکی از دوره‌های بهره‌برداری/),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: /سرمایه‌گذاری/ })).toContainText('۱');
  });

  test('stops saving when the model changed elsewhere', async ({ page }) => {
    await signIn(page);
    await serveModel(page, model(), (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'CONFLICT', message: 'نسخه تازه‌تری وجود دارد.' } }),
      }),
    );
    await page.goto('/dashboard/models/m1');
    await page.getByLabel('عنوان مدل').fill('طرح میلگرد ۲');
    await expect(page.getByText(/این مدل در جای دیگری تغییر کرده است/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'بارگذاری نسخه تازه' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'دریافت رونوشت این صفحه' })).toBeVisible();
  });

  test('stores a calculation run after saving', async ({ page }) => {
    await signIn(page);
    const saves = await serveModel(page);
    const order: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/financial-models/')) {
        order.push(request.method());
      }
    });
    await page.route('**/api/v1/financial-models/m1/runs', (route) =>
      json(route, { id: 'r1', number: 4 }, 201),
    );
    await page.goto('/dashboard/models/m1');
    await expect(page.getByRole('button', { name: 'ثبت اجرای محاسبه' })).toBeEnabled();
    await page.getByLabel('عنوان مدل').fill('طرح میلگرد — نسخه بانک');
    // The pending change is saved first, then the saved inputs are calculated on the server.
    await page.getByRole('button', { name: 'ثبت اجرای محاسبه' }).click();
    await expect(page.getByText('اجرای شماره ۴ ثبت شد.')).toBeVisible();
    expect(saves.at(-1)?.title).toBe('طرح میلگرد — نسخه بانک');
    expect(order).toEqual(['PUT', 'POST']);
  });

  test('changes the horizon only when it is applied, and keeps values with their periods', async ({
    page,
  }) => {
    await signIn(page);
    const saves = await serveModel(page);
    await page.goto('/dashboard/models/m1');
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();

    // Typing 12 passes through 1: nothing of the model changes meanwhile.
    const years = page.getByLabel(/سال‌های تولید/);
    await years.fill('');
    await years.pressSequentially('12');
    await page.getByLabel(/تعداد دوره‌های ساخت/).fill('2');
    await expect(page.getByText(/افق تازه ۱۴ دوره دارد/)).toBeVisible();
    await page.waitForTimeout(1800);
    expect(saves).toHaveLength(0);

    await page.getByRole('button', { name: 'اعمال افق' }).click();
    await expect.poll(() => saves.length).toBe(1);
    const stored = saves[0]!.inputs;
    expect(stored.horizon).toMatchObject({
      productionYears: 12,
      construction: { periods: 2, periodMonths: 12 },
    });
    // The sales of the three production years stay in production periods, after two of construction.
    expect(stored.operations.products[0]?.sales[0]?.quantities).toEqual([
      '0',
      '0',
      '100',
      '100',
      '100',
      ...Array.from({ length: 9 }, () => '0'),
    ]);
    // New periods have no exchange rate yet: it is asked, not copied.
    expect(stored.exchangeRates.USD).toEqual([
      '600000',
      '',
      '600000',
      '600000',
      '600000',
      ...Array.from({ length: 9 }, () => ''),
    ]);
    expect(stored.investment.items[0]?.depreciation?.startPeriod).toBe(2);
    await expect(page.getByText(/برای محاسبه هنوز ۱۰ مورد لازم است/)).toBeVisible();
  });

  test('keeps the unit of a coverage and asks before removing a product', async ({ page }) => {
    await signIn(page);
    const saves = await serveModel(page);
    await page.goto('/dashboard/models/m1');
    await openSection(page, 'سرمایه در گردش');

    const receivables = page.getByLabel(/^حساب‌های دریافتنی سطر فروش/);
    const unit = page.getByLabel(/^واحد حساب‌های دریافتنی سطر فروش/);
    await expect(unit).toHaveValue('shareOfYear');
    await expect(receivables).toHaveValue('۱۰');
    await receivables.fill('');
    await expect(unit).toHaveValue('shareOfYear');
    await receivables.fill('۲۵');
    await expect
      .poll(() => saves.at(-1)?.inputs.operations.products[0]?.sales[0]?.receivablesCoverage)
      .toEqual({ shareOfYear: '0.25' });
    // Days are another number: the value is asked again instead of being reinterpreted.
    await unit.selectOption('days');
    await expect(receivables).toHaveValue('');

    await openSection(page, 'تولید و فروش');
    // The basis of the sales volume always has one of its two values.
    await expect(page.getByLabel(/مقدار فروش بر حسب/).locator('option')).toHaveCount(2);
    const messages: string[] = [];
    page.on('dialog', (dialog) => {
      messages.push(dialog.message());
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'حذف محصول «میلگرد»' }).click();
    expect(messages[0]).toContain('هزینه‌های مستقیم این محصول هم حذف می‌شوند');
    await expect.poll(() => saves.at(-1)?.inputs.operations.products).toEqual([]);
    expect(saves.at(-1)?.inputs.operations.costs).toEqual([]);
  });

  test('renames an item when its field is left and refuses a name in use', async ({ page }) => {
    await signIn(page);
    const withSale = inputs();
    Object.assign(withSale.statements, {
      assetSales: [{ item: 'ماشین‌آلات', period: 3, proceeds: '100' }],
    });
    const saves = await serveModel(page, model({ inputs: withSale }));
    await page.goto('/dashboard/models/m1');
    await openSection(page, 'سرمایه‌گذاری');

    const name = page.getByLabel(/نام قلم/).first();
    await name.fill('ساختمان');
    await name.blur();
    await expect(page.getByText('این نام برای مورد دیگری به کار رفته است.')).toBeVisible();
    await name.fill('');
    await name.fill('خط تولید');
    await name.blur();
    await expect.poll(() => saves.at(-1)?.inputs.investment.items[0]?.key).toBe('خط تولید');
    const stored = saves.at(-1)!.inputs as ReturnType<typeof inputs> & {
      statements: { assetSales: { item: string }[] };
    };
    expect(stored.statements.assetSales[0]?.item).toBe('خط تولید');
    // No half-typed name was ever saved.
    expect(saves.every((save) => save.inputs.investment.items[0]?.key !== '')).toBe(true);
  });

  test('recognises its own save when the answer was lost', async ({ page }) => {
    await signIn(page);
    let stored: { title: string; inputs: unknown } | undefined;
    let serverVersion = 3;
    const versions: number[] = [];
    await page.route('**/api/v1/financial-models/m1', async (route) => {
      if (route.request().method() !== 'PUT') {
        return json(route, { ...model(), ...stored, version: serverVersion });
      }
      const body = route.request().postDataJSON() as {
        title: string;
        inputs: unknown;
        version: number;
      };
      versions.push(body.version);
      if (!stored) {
        // The server stores the save, but the connection drops before the answer.
        stored = { title: body.title, inputs: body.inputs };
        serverVersion = 4;
        return route.abort('connectionreset');
      }
      if (body.version !== serverVersion) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'CONFLICT', message: 'نسخه تازه‌تری وجود دارد.' },
          }),
        });
      }
      stored = { title: body.title, inputs: body.inputs };
      serverVersion += 1;
      return json(route, { ...model(), ...stored, version: serverVersion });
    });
    await page.goto('/dashboard/models/m1');
    const title = page.getByLabel('عنوان مدل');
    await title.fill('طرح میلگرد ۲');
    await expect(page.getByText(/ذخیره نشد:/)).toBeVisible();
    // The user goes on typing; the next save meets the version of the save that got no answer.
    await title.fill('طرح میلگرد ۲۳');
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();
    await expect(page.getByText(/این مدل در جای دیگری تغییر کرده است/)).toHaveCount(0);
    expect(stored?.title).toBe('طرح میلگرد ۲۳');
    expect(versions).toEqual([3, 3, 4]);
  });

  test('recognises its own save after an outage of several requests', async ({ page }) => {
    await signIn(page);
    let stored: { title: string; inputs: unknown } | undefined;
    let serverVersion = 3;
    let attempts = 0;
    const versions: number[] = [];
    await page.route('**/api/v1/financial-models/m1', async (route) => {
      if (route.request().method() !== 'PUT') {
        return json(route, { ...model(), ...stored, version: serverVersion });
      }
      const body = route.request().postDataJSON() as {
        title: string;
        inputs: unknown;
        version: number;
      };
      versions.push(body.version);
      attempts += 1;
      if (attempts === 1) {
        // Stored, but the answer is lost.
        stored = { title: body.title, inputs: body.inputs };
        serverVersion = 4;
        return route.abort('connectionreset');
      }
      // The connection is down: the second save never reaches the server.
      if (attempts === 2) return route.abort('internetdisconnected');
      if (body.version !== serverVersion) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'CONFLICT', message: 'نسخه تازه‌تری وجود دارد.' },
          }),
        });
      }
      stored = { title: body.title, inputs: body.inputs };
      serverVersion += 1;
      return json(route, { ...model(), ...stored, version: serverVersion });
    });
    await page.goto('/dashboard/models/m1');
    const title = page.getByLabel('عنوان مدل');
    await title.fill('طرح میلگرد ۲');
    await expect.poll(() => attempts).toBe(1);
    await expect(page.getByText(/ذخیره نشد:/)).toBeVisible();
    await title.fill('طرح میلگرد ۲۳');
    await expect.poll(() => attempts).toBe(2);
    await title.fill('طرح میلگرد ۲۳۴');
    await expect(page.getByText('همه تغییرها ذخیره شد.')).toBeVisible();
    await expect(page.getByText(/این مدل در جای دیگری تغییر کرده است/)).toHaveCount(0);
    expect(stored?.title).toBe('طرح میلگرد ۲۳۴');
    expect(versions).toEqual([3, 3, 3, 4]);
  });

  test('enters a refund of equity and the share of the net worth of a shareholder', async ({
    page,
  }) => {
    await signIn(page);
    const saves = await serveModel(page);
    await page.goto('/dashboard/models/m1');
    await openSection(page, 'تأمین مالی');
    const equity = () =>
      (saves.at(-1)?.inputs.financing.equity[0] as { refunds?: string[] } | undefined)?.refunds;

    await expect(page.getByRole('region', { name: 'بازپرداخت آورده در هر دوره' })).toHaveCount(0);
    await page.getByLabel('بخشی از این آورده در طول طرح بازپرداخت می‌شود').check();
    await expect.poll(equity).toEqual(['0', '0', '0', '0']);
    const grid = page.getByRole('region', { name: 'بازپرداخت آورده در هر دوره' });
    await expect(grid).toBeVisible();
    const cell = grid.getByRole('textbox').nth(3);
    await cell.fill('۱۰۰٬۰۰۰٬۰۰۰');
    await cell.blur();
    await expect.poll(equity).toEqual(['0', '0', '0', '100000000']);

    // The share of the net worth is optional; it is stored as a fraction.
    await page.getByLabel('این آورده سود سهام می‌گیرد').check();
    const share = page.getByLabel(/^سهم از ارزش ویژه پایان طرح/);
    await share.fill('۱۰۰');
    await share.blur();
    await expect
      .poll(
        () =>
          (
            saves.at(-1)?.inputs.statements.profitDistribution.shareholders[0] as
              { netWorthShare?: string } | undefined
          )?.netWorthShare,
      )
      .toBe('1');

    await page.getByLabel('بخشی از این آورده در طول طرح بازپرداخت می‌شود').uncheck();
    await expect.poll(equity).toBeUndefined();
  });

  test('enters the starting balances of an existing enterprise', async ({ page }) => {
    await signIn(page);
    const saves = await serveModel(page);
    await page.goto('/dashboard/models/m1');
    await openSection(page, 'ترازنامه آغازین');
    const balances = () =>
      (saves.at(-1)?.inputs as { startingBalances?: Record<string, unknown> } | undefined)
        ?.startingBalances;

    // A new project has none; an expansion asks for every balance and suggests no value.
    await expect(page.getByLabel(/^مازاد نقد/)).toHaveCount(0);
    await page.getByLabel('این طرح، توسعه یا بازسازی یک شرکت موجود است').check();
    await expect(page.getByLabel(/^مازاد نقد/)).toHaveValue('');
    await expect(page.getByRole('tab', { name: /ترازنامه آغازین/ })).toContainText('۷');

    await page.getByLabel(/^حساب‌های دریافتنی/).fill('۵۰٬۰۰۰٬۰۰۰');
    await page.getByLabel(/^وصول حساب‌های دریافتنی/).fill('۶۰');
    await page.getByLabel(/^حساب‌های پرداختنی/).fill('0');
    await page.getByLabel(/^پرداخت حساب‌های پرداختنی/).fill('0');
    await page.getByLabel(/^وجه نقد در گردش/).fill('0');
    await page.getByLabel(/^سپرده کوتاه‌مدت/).fill('0');
    await page.getByLabel(/^مازاد نقد/).fill('۱۰۰۰۰۰۰۰');

    await page.getByRole('button', { name: 'افزودن دارایی ثابت موجود' }).click();
    await page.getByLabel('قلم سرمایه‌گذاری').selectOption('ساختمان');
    await page.getByLabel(/^ارزش دفتری/).fill('300000000');
    await page.getByLabel(/^ارزش دفتری/).blur();
    await expect.poll(balances).toMatchObject({
      fixedAssets: [{ item: 'ساختمان', value: '300000000' }],
      receivables: { value: '50000000', collectionDays: 60 },
      payables: { value: '0', paymentDays: 0 },
      cashSurplus: '10000000',
      loans: [],
    });
    await expect(page.getByRole('tab', { name: /ترازنامه آغازین/ })).not.toContainText('۷');
    // The live calculation follows: the engine accepts the model with its starting balances.
    await expect(page.getByText(/برای محاسبه هنوز/)).toHaveCount(0);

    // Renaming the asset keeps its starting balance with it.
    await openSection(page, 'سرمایه‌گذاری');
    const name = page.getByLabel('نام قلم').nth(1);
    await name.fill('سوله');
    await name.blur();
    await expect
      .poll(() => balances()?.fixedAssets)
      .toEqual([{ item: 'سوله', value: '300000000' }]);

    // Leaving the expansion asks first and removes every balance.
    await openSection(page, 'ترازنامه آغازین');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByLabel('این طرح، توسعه یا بازسازی یک شرکت موجود است').uncheck();
    await expect.poll(balances).toBeUndefined();
  });

  test('has no serious accessibility violations in any section', async ({ page }) => {
    await signIn(page);
    await serveModel(page);
    await page.goto('/dashboard/models/m1');
    await expect(page.getByRole('heading', { name: 'کل سرمایه' })).toBeVisible();
    for (const name of [
      'فرض‌ها',
      'سرمایه‌گذاری',
      'تأمین مالی',
      'تولید و فروش',
      'هزینه‌ها',
      'سرمایه در گردش',
      'ترازنامه آغازین',
    ]) {
      await openSection(page, name);
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
