import {
  ALLOCATION_KEY_LABELS_FA,
  CALENDAR_LABELS_FA,
  COST_CATEGORY_LABELS_FA,
  COST_CENTRE_GROUP_LABELS_FA,
  DEPRECIATION_METHOD_LABELS_FA,
  DISCOUNT_REFERENCE_LABELS_FA,
  EQUITY_CLASS_LABELS_FA,
  INVESTMENT_GROUP_LABELS_FA,
  LOAN_TYPE_LABELS_FA,
  MARKET_LABELS_FA,
  ORIGIN_LABELS_FA,
  PERIOD_LABELS_FA,
  RESIDUAL_VALUE_TIMING_LABELS_FA,
  toPersianDigits,
  type ProjectInputData,
} from '@roshd/validation';
import {
  isolate,
  numberValue,
  tableBlock,
  text,
  type GridBlock,
  type PairsBlock,
  type ReportBlock,
  type ReportValue,
} from './document';
import type { Column, Frame } from './frame';
import { named } from './schedules';
import type { RowKind, StatementRow, StatementSection } from './tables';

/**
 * The inputs of a calculation run as blocks of the report (ST-34.09): what the user entered, in
 * the order and with the terms of the editor. Values are shown exactly as entered — amounts in
 * the currency of their item, rates and shares in percent — never in the display unit.
 */

type Coverage = ProjectInputData['operations']['cash']['localCoverage'];
type PerPeriod = string | string[];

const UNIT = '1';
const NONE = text('—');
const COMFAR_DEFAULT = text('وارد نشده (پیش‌فرض COMFAR)');
const digits = (value: number | string) => text(toPersianDigits(value));
const entered = (value: string | undefined, kind: RowKind = 'entered'): ReportValue =>
  value === undefined ? NONE : numberValue(value, kind, UNIT);
const percent = (value: string | undefined) => entered(value, 'enteredPercent');
const yesNo = (value: boolean) => text(value ? 'بله' : 'خیر');
const code = (value: string) => text(value, true);

/** One value for every column, or one value per column. */
const expand = (value: PerPeriod, length: number): string[] =>
  Array.isArray(value) ? value : Array.from({ length }, () => value);

const series = (label: string, values: string[], kind: RowKind = 'entered'): StatementRow => ({
  label,
  values,
  kind,
});

const columnName = (column: Column | undefined): ReportValue =>
  column === undefined ? NONE : text(`${column.group} ${column.label}`);

/** Month number from the start of the project of a 30/360 day index; the day when it is not one. */
function monthOf(day: number | undefined, edge: 'end' | 'start'): ReportValue {
  if (day === undefined) return COMFAR_DEFAULT;
  const month = edge === 'end' ? day / 30 : (day - 1) / 30 + 1;
  return Number.isInteger(month) ? digits(month) : text(`روز ${toPersianDigits(day)}`);
}

function coverage(value: Coverage | undefined): ReportValue {
  if (value === undefined) return NONE;
  if ('days' in value) return text(`${numberValue(value.days, 'entered', UNIT).text} روز`);
  return text(`${numberValue(value.shareOfYear, 'enteredPercent', UNIT).text} درصد از سال`);
}

const grid = (title: string, head: string[], rows: ReportValue[][]): GridBlock[] =>
  rows.length === 0 ? [] : [{ kind: 'grid', title, head, rows }];

const table = (
  title: string,
  columns: Column[],
  sections: StatementSection[],
  note?: string,
): ReportBlock[] => {
  const filled = sections.filter((section) => section.rows.length > 0);
  if (filled.length === 0) return [];
  try {
    return [tableBlock({ id: '', title, sections: filled }, columns, UNIT, note)];
  } catch {
    // A series the engine never read (a rate of a currency no item uses) may have any length:
    // that table says so and the other inputs stay.
    return [
      { kind: 'text', text: `جدول «${title}» با افق این اجرا هم‌خوان نیست و نمایش داده نشد.` },
    ];
  }
};

const NOTE_LABELS: Record<string, string> = {
  'statements.discounting': 'نرخ تنزیل',
  'statements.tax': 'مالیات بر درآمد',
};

function noteLabel(path: string): ReportValue {
  if (Object.hasOwn(NOTE_LABELS, path)) return text(NOTE_LABELS[path] ?? path);
  const [section, currency, ...rest] = path.split('.');
  if (rest.length === 0 && currency !== undefined) {
    if (section === 'exchangeRates') return text(`نرخ ارز ${isolate(currency)}`);
    if (section === 'inflation') return text(`نرخ تورم ${isolate(currency)}`);
  }
  return code(path);
}

function general(input: ProjectInputData, frame: Frame): PairsBlock[] {
  const { horizon, statements, operations } = input;
  const phase = (part: { periods: number; periodMonths: 1 | 3 | 6 | 12 }) =>
    part.periods === 0
      ? text('ندارد')
      : text(`${toPersianDigits(part.periods)} دوره ${PERIOD_LABELS_FA[part.periodMonths]}`);
  const year = (index: number | undefined) =>
    index === undefined ? COMFAR_DEFAULT : columnName(frame.productionYears[index]);
  const { discounting } = statements;
  return [
    {
      kind: 'pairs',
      title: 'افق برنامه‌ریزی و ارز',
      rows: [
        { label: 'تقویم', value: text(CALENDAR_LABELS_FA[horizon.calendar]) },
        {
          label: 'آغاز ساخت (سال/ماه)',
          value: digits(`${horizon.start.year}/${String(horizon.start.month).padStart(2, '0')}`),
        },
        { label: 'ماه پایان سال مالی', value: digits(horizon.balanceMonth) },
        { label: 'دوره‌های ساخت', value: phase(horizon.construction) },
        { label: 'دوره‌های راه‌اندازی', value: phase(horizon.startup) },
        { label: 'سال‌های تولید', value: digits(horizon.productionYears) },
        { label: 'ارز محلی', value: code(input.localCurrency) },
        {
          label: 'نوع طرح',
          value: text(
            input.startingBalances === undefined
              ? 'طرح جدید'
              : 'توسعه یا بازسازی شرکت موجود (با ترازنامه آغازین)',
          ),
        },
        {
          label: 'محاسبه با تورم (قیمت‌های جاری)',
          value: yesNo(input.inflation !== undefined),
        },
      ],
    },
    {
      kind: 'pairs',
      title: 'تنزیل، مالیات و قراردادهای صورت‌های مالی',
      rows: [
        {
          label: 'تاریخ مرجع تنزیل',
          value:
            discounting.reference === undefined
              ? COMFAR_DEFAULT
              : text(DISCOUNT_REFERENCE_LABELS_FA[discounting.reference]),
        },
        {
          label: 'نرخ سرمایه‌گذاری مجدد (MIRR، درصد)',
          value:
            discounting.reinvestmentRate === undefined
              ? COMFAR_DEFAULT
              : percent(discounting.reinvestmentRate),
        },
        {
          label: 'نرخ استقراض (MIRR، درصد)',
          value:
            discounting.borrowingRate === undefined
              ? COMFAR_DEFAULT
              : percent(discounting.borrowingRate),
        },
        {
          label: 'زمان بازگشت ارزش اسقاط',
          value:
            statements.residualValueTiming === undefined
              ? COMFAR_DEFAULT
              : text(RESIDUAL_VALUE_TIMING_LABELS_FA[statements.residualValueTiming]),
        },
        {
          label: 'پوشش خودکار کسری نقد',
          value:
            statements.automaticCashCoverage === undefined
              ? COMFAR_DEFAULT
              : yesNo(statements.automaticCashCoverage),
        },
        { label: 'سال مرجع', value: year(statements.referenceYear) },
        { label: 'سال تحلیل سربه‌سر', value: year(statements.breakEvenYear) },
        { label: 'سال‌های معافیت از آغاز تولید', value: digits(statements.tax.holidayYears) },
        { label: 'سال‌های انتقال زیان', value: digits(statements.tax.lossCarryForwardYears) },
        {
          label: 'وجه نقد برای هزینه‌های داخلی',
          value: coverage(operations.cash.localCoverage),
        },
        {
          label: 'وجه نقد برای هزینه‌های خارجی',
          value: coverage(operations.cash.foreignCoverage),
        },
        {
          label: 'سهمی از وجه نقد که در سپرده کوتاه‌مدت است (درصد)',
          value: percent(operations.cash.depositShare),
        },
        {
          label: 'نرخ سالانه سپرده کوتاه‌مدت (درصد)',
          value: percent(operations.cash.depositRate),
        },
      ],
    },
  ];
}

function rates(input: ProjectInputData, frame: Frame): ReportBlock[] {
  const periods = frame.periods.length;
  const { discounting, tax, profitDistribution } = input.statements;
  const years = frame.productionYears.length;
  return [
    ...table('نرخ ارز (واحد پول محلی برای هر واحد ارز)', frame.periods, [
      {
        rows: Object.entries(input.exchangeRates).map(([currency, values]) =>
          series(`نرخ ${isolate(currency)}`, values),
        ),
      },
    ]),
    ...table('نرخ تورم سالانه', frame.projectYears, [
      {
        rows: Object.entries(input.inflation ?? {}).map(([currency, values]) =>
          series(`تورم ${isolate(currency)}`, values, 'enteredPercent'),
        ),
      },
    ]),
    ...table('نرخ تنزیل سالانه', frame.periods, [
      {
        rows: [
          series(
            'نرخ تنزیل کل سرمایه',
            expand(discounting.totalCapitalRate, periods),
            'enteredPercent',
          ),
          series('نرخ تنزیل آورده', expand(discounting.equityRate, periods), 'enteredPercent'),
        ],
      },
    ]),
    ...table('مالیات بر درآمد و تقسیم سود', frame.productionYears, [
      {
        title: 'پله‌های مالیاتی',
        rows: tax.brackets.map((bracket) =>
          series(
            `نرخ مالیات از سود مشمول ${numberValue(bracket.lowerLimit, 'entered', UNIT).text}`,
            expand(bracket.rate, years),
            'enteredPercent',
          ),
        ),
      },
      {
        title: 'تقسیم سود',
        rows: [
          series(
            'سهمی از سود خالص که در طرح می‌ماند',
            expand(profitDistribution.retainedShare, years),
            'enteredPercent',
          ),
          ...profitDistribution.shareholders.flatMap((holder) => [
            series(
              `${named('آورده', holder.equity)}: سود ممتاز از آورده پرداخت‌شده`,
              expand(holder.preferredRate, years),
              'enteredPercent',
            ),
            series(
              `${named('آورده', holder.equity)}: سود ممتاز (مبلغ سالانه)`,
              expand(holder.preferredAmount, years),
            ),
            series(
              `${named('آورده', holder.equity)}: سهم از سود عادی`,
              expand(holder.ordinaryShare, years),
              'enteredPercent',
            ),
          ]),
        ],
      },
    ]),
    ...grid(
      'سهم خروجی سود از کشور و سهم از ارزش ویژه پایان طرح',
      ['آورده', 'سهمی از سود که از کشور خارج می‌شود (درصد)', 'سهم از ارزش ویژه پایان طرح (درصد)'],
      profitDistribution.shareholders.map((holder) => [
        text(holder.equity),
        percent(holder.repatriatedShare),
        percent(holder.netWorthShare),
      ]),
    ),
  ];
}

function investment(input: ProjectInputData, frame: Frame): ReportBlock[] {
  const { items } = input.investment;
  const { allowances, assetSales } = input.statements;
  return [
    ...grid(
      'اقلام سرمایه‌گذاری',
      [
        'نام قلم',
        'گروه',
        'منشأ',
        'ارز',
        'روش استهلاک',
        'عمر استهلاک (ماه)',
        'ارزش اسقاط (درصد)',
        'نرخ سالانه نزولی (درصد)',
        'شروع استهلاک از اول دوره',
      ],
      items.map((item) => {
        const d = item.depreciation;
        return [
          text(item.key),
          text(INVESTMENT_GROUP_LABELS_FA[item.group]),
          text(ORIGIN_LABELS_FA[item.origin]),
          code(item.currency),
          ...(d === undefined
            ? [text('مستهلک نمی‌شود'), NONE, NONE, NONE, NONE]
            : [
                text(DEPRECIATION_METHOD_LABELS_FA[d.method]),
                digits(d.lifeMonths),
                percent(d.salvageRate),
                percent(d.decliningRate),
                columnName(frame.periods[d.startPeriod]),
              ]),
        ];
      }),
    ),
    ...table(
      'مبلغ سرمایه‌گذاری در هر دوره',
      frame.periods,
      [
        {
          rows: items.map((item) =>
            series(`${isolate(item.key)} (${isolate(item.currency)})`, item.amounts),
          ),
        },
      ],
      'به ارز هر قلم و به قیمت‌های آغاز طرح',
    ),
    ...table(
      'معافیت‌های سرمایه‌گذاری و استهلاک',
      frame.periods,
      [
        {
          rows:
            allowances === undefined
              ? []
              : [
                  series('معافیت سرمایه‌گذاری', allowances.investment),
                  series('معافیت استهلاک', allowances.depreciation),
                ],
        },
      ],
      'به پول محلی',
    ),
    ...grid(
      'فروش دارایی',
      ['قلم فروخته‌شده', 'دوره فروش', 'بهای فروش (پول محلی)'],
      (assetSales ?? []).map((sale) => [
        text(sale.item),
        columnName(frame.periods[sale.period]),
        entered(sale.proceeds),
      ]),
    ),
  ];
}

function financing(input: ProjectInputData, frame: Frame): ReportBlock[] {
  const { equity, loans } = input.financing;
  return [
    ...grid(
      'آورده سهامداران و کمک‌ها',
      ['نام سهامدار یا منبع', 'نوع آورده', 'منشأ', 'ارز'],
      equity.map((item) => [
        text(item.key),
        text(EQUITY_CLASS_LABELS_FA[item.class]),
        text(ORIGIN_LABELS_FA[item.origin]),
        code(item.currency),
      ]),
    ),
    ...table(
      'آورده پرداختی در هر دوره',
      frame.periods,
      [
        {
          rows: equity.map((item) =>
            series(`${isolate(item.key)} (${isolate(item.currency)})`, item.amounts),
          ),
        },
      ],
      'به ارز هر آورده',
    ),
    ...table(
      'بازپرداخت آورده در هر دوره',
      frame.periods,
      [
        {
          rows: equity.flatMap((item) =>
            item.refunds === undefined
              ? []
              : [series(`${isolate(item.key)} (${isolate(item.currency)})`, item.refunds)],
          ),
        },
      ],
      'به ارز هر آورده',
    ),
    ...loans.map(({ key, currency, origin, loan, depreciation }): PairsBlock => {
      const repayments = loan.type !== 'PROFILE';
      return {
        kind: 'pairs',
        title: named('تسهیلات بلندمدت', key),
        rows: [
          { label: 'ارز', value: code(currency) },
          { label: 'منشأ', value: text(ORIGIN_LABELS_FA[origin]) },
          { label: 'نوع بازپرداخت', value: text(LOAN_TYPE_LABELS_FA[loan.type]) },
          {
            label: 'فاصله اقساط و پرداخت سود',
            value: text(PERIOD_LABELS_FA[loan.repaymentMonths]),
          },
          { label: 'اولین ماه پرداخت سود', value: monthOf(loan.interestDueDay, 'end') },
          ...(repayments
            ? [
                {
                  label: 'تعداد اقساط',
                  value:
                    loan.numberOfRepayments === undefined ? NONE : digits(loan.numberOfRepayments),
                },
                { label: 'ماه اولین قسط', value: monthOf(loan.firstRepaymentDay, 'end') },
              ]
            : []),
          {
            label: 'سهمی از سود دوره برداشت که به اصل افزوده می‌شود (درصد)',
            value: percent(loan.capitalisedShare),
          },
          { label: 'آخرین ماه انباشت سود', value: monthOf(loan.capitaliseUntilDay, 'end') },
          { label: 'کارمزد کارگزاری (بر هر برداشت، درصد)', value: percent(loan.fees?.agency) },
          { label: 'کارمزد تضمین (سالانه بر مانده، درصد)', value: percent(loan.fees?.guarantee) },
          {
            label: 'کارمزد تعهد (سالانه بر برداشت‌نشده، درصد)',
            value: percent(loan.fees?.commitment),
          },
          { label: 'سایر کارمزدها (یک‌بار بر کل، درصد)', value: percent(loan.fees?.other) },
          {
            label: 'استهلاک سود و کارمزد دوره ساخت',
            value:
              depreciation === undefined
                ? text('مستهلک نمی‌شود')
                : text(
                    `${DEPRECIATION_METHOD_LABELS_FA[depreciation.method]}، ${toPersianDigits(
                      depreciation.lifeMonths,
                    )} ماه، از ${columnName(frame.periods[depreciation.startPeriod]).text}`,
                  ),
          },
        ],
      };
    }),
    ...grid(
      'برداشت‌ها و بازپرداخت‌های تسهیلات',
      ['تسهیلات', 'ماه از آغاز طرح', 'مبلغ (ارز تسهیلات)'],
      loans.flatMap(({ key, loan }) =>
        loan.flows.map((flow) => [text(key), monthOf(flow.day, 'end'), entered(flow.amount)]),
      ),
    ),
    ...grid(
      'نرخ سود تسهیلات',
      ['تسهیلات', 'از آغاز ماه', 'نرخ سالانه (درصد)'],
      loans.flatMap(({ key, loan }) =>
        loan.rates.map((rate) => [text(key), monthOf(rate.fromDay, 'start'), percent(rate.rate)]),
      ),
    ),
  ];
}

function operations(input: ProjectInputData, frame: Frame): ReportBlock[] {
  const { products, costs, costCentres } = input.operations;
  const periods = frame.periods.length;
  const each = (value: PerPeriod) => expand(value, periods);
  return [
    ...grid(
      'محصولات',
      [
        'نام محصول',
        'ظرفیت اسمی سالانه',
        'دوره‌های تولید',
        'موجودی کالای ساخته‌شده',
        'کالای در جریان ساخت',
      ],
      products.map((product) => [
        text(product.key),
        entered(product.nominalCapacity),
        product.production === undefined
          ? text('همه دوره بهره‌برداری')
          : text(
              `از ${columnName(frame.periods[product.production.firstPeriod]).text} تا ${
                columnName(frame.periods[product.production.lastPeriod]).text
              }`,
            ),
        coverage(product.finishedGoodsCoverage),
        coverage(product.workInProgressCoverage),
      ]),
    ),
    ...grid(
      'سطرهای فروش',
      ['محصول', 'نام سطر فروش', 'بازار', 'ارز', 'مقدار فروش بر حسب', 'حساب‌های دریافتنی'],
      products.flatMap((product) =>
        product.sales.map((line) => [
          text(product.key),
          text(line.key),
          text(MARKET_LABELS_FA[line.market]),
          code(line.currency),
          text(line.capacityShares === undefined ? 'مقدار در هر دوره' : 'درصد ظرفیت اسمی'),
          coverage(line.receivablesCoverage),
        ]),
      ),
    ),
    ...table(
      'برنامه فروش',
      frame.periods,
      products.flatMap((product) =>
        product.sales.map((line) => ({
          title: `${named('محصول', product.key)}، ${named('سطر فروش', line.key)} (${isolate(line.currency)})`,
          rows: [
            line.capacityShares === undefined
              ? series('مقدار فروش', line.quantities ?? [])
              : series('فروش به نسبت ظرفیت اسمی', line.capacityShares, 'enteredPercent'),
            series('قیمت هر واحد (بدون مالیات فروش)', each(line.price)),
            series('مالیات فروش', each(line.salesTaxRate), 'enteredPercent'),
            series('یارانه به نسبت فروش خالص', each(line.subsidyRate), 'enteredPercent'),
            series('یارانه (مبلغ هر دوره)', each(line.subsidyAmount)),
          ],
        })),
      ),
      'قیمت‌ها به ارز هر سطر و به قیمت‌های آغاز طرح',
    ),
    ...grid(
      'اقلام هزینه',
      [
        'نام قلم هزینه',
        'دسته هزینه',
        'محصول',
        'منشأ',
        'ارز',
        'مرکز هزینه',
        'کلید تسهیم بین محصولات',
        'موجودی',
        'حساب‌های پرداختنی',
      ],
      costs.map((cost) => [
        text(cost.key),
        text(COST_CATEGORY_LABELS_FA[cost.category]),
        text(cost.product ?? 'غیرمستقیم'),
        text(ORIGIN_LABELS_FA[cost.origin]),
        code(cost.currency),
        cost.costCentre === undefined ? NONE : text(cost.costCentre),
        cost.allocation === undefined
          ? NONE
          : cost.allocation.key === 'SHARES'
            ? text(
                `${ALLOCATION_KEY_LABELS_FA.SHARES}: ${Object.entries(cost.allocation.shares)
                  .map(([product, share]) => `${isolate(product)} ${percent(share).text}٪`)
                  .join('، ')}`,
              )
            : text(ALLOCATION_KEY_LABELS_FA[cost.allocation.key]),
        coverage(cost.stockCoverage),
        coverage(cost.payablesCoverage),
      ]),
    ),
    ...grid(
      'هزینه استاندارد اقلام مستقیم',
      [
        'نام قلم هزینه',
        'هزینه استاندارد',
        'مقدار مصرف',
        'قیمت هر واحد',
        'سهم متغیر (درصد)',
        'هزینه ثابت سالانه',
      ],
      costs.flatMap((cost) => {
        const s = cost.standard;
        if (s === undefined) return [];
        const perUnit = s.mode === 'PER_UNIT';
        return [
          [
            text(cost.key),
            text(perUnit ? 'به ازای هر واحد محصول' : 'در ظرفیت اسمی (سالانه)'),
            entered(s.quantity),
            entered(s.price),
            perUnit ? NONE : percent(s.variableShare),
            perUnit ? entered(s.fixedCost) : NONE,
          ],
        ];
      }),
    ),
    ...table(
      'هزینه‌های دوره‌ای (مقدار × قیمت هر دوره)',
      frame.periods,
      costs.flatMap((cost) =>
        cost.adjustments === undefined
          ? []
          : [
              {
                title: `${named('هزینه', cost.key)} (${isolate(cost.currency)})`,
                rows: [
                  series('مقدار', cost.adjustments.quantities),
                  series('قیمت هر واحد', cost.adjustments.prices),
                  series('سهم متغیر', cost.adjustments.variableShares, 'enteredPercent'),
                ],
              },
            ],
      ),
      'در دوره‌های ساخت، خرید موجودی اولیه مواد است',
    ),
    ...grid(
      'مراکز هزینه',
      ['نام مرکز هزینه', 'گروه', 'محصولات'],
      (costCentres ?? []).map((centre) => [
        text(centre.key),
        text(COST_CENTRE_GROUP_LABELS_FA[centre.group]),
        text(
          centre.products === undefined ? 'همه محصولات' : centre.products.map(isolate).join('، '),
        ),
      ]),
    ),
  ];
}

/** Escalation of every priced item that has one, and the notes on the assumptions. */
function pricesAndNotes(input: ProjectInputData, frame: Frame): ReportBlock[] {
  const years = frame.projectYears.length;
  const priced = [
    ...input.investment.items.map((item) => ({ ...item, title: named('سرمایه‌گذاری', item.key) })),
    ...input.operations.products.flatMap((product) =>
      product.sales.map((line) => ({
        ...line,
        title: `${named('محصول', product.key)}، ${named('سطر فروش', line.key)}`,
      })),
    ),
    ...input.operations.costs.map((cost) => ({ ...cost, title: named('هزینه', cost.key) })),
  ];
  return [
    ...table('افزایش سالانه قیمت بیش از تورم', frame.projectYears, [
      {
        rows: priced.flatMap((item) =>
          item.escalation === undefined
            ? []
            : [series(item.title, expand(item.escalation, years), 'enteredPercent')],
        ),
      },
    ]),
    ...grid(
      'ضریب افزایش قیمت سال اول',
      ['قلم', 'ضریب'],
      priced.flatMap((item) =>
        item.firstYearEscalator === undefined
          ? []
          : [[text(item.title), digits(item.firstYearEscalator)]],
      ),
    ),
    ...grid(
      'منبع و تاریخ اعتبار فرض‌ها',
      ['فرض', 'منبع', 'تاریخ اعتبار'],
      Object.entries(input.notes ?? {}).flatMap(([path, note]) =>
        note.source === undefined && note.asOf === undefined
          ? []
          : [[noteLabel(path), text(note.source ?? '—'), text(note.asOf ?? '—')]],
      ),
    ),
  ];
}

/** The balances of an existing enterprise on the day before the project (expansion projects). */
function startingBalances(input: ProjectInputData): ReportBlock[] {
  const balances = input.startingBalances;
  if (balances === undefined) return [];
  const days = (value: number) => text(`روز ${toPersianDigits(value)} از شروع طرح`);
  const loanCurrency = (key: string) =>
    input.financing.loans.find((loan) => loan.key === key)?.currency ?? '';
  return [
    {
      kind: 'pairs',
      title: 'ترازنامه آغازین شرکت موجود (به پول محلی، روز پیش از شروع طرح)',
      rows: [
        { label: 'حساب‌های دریافتنی', value: entered(balances.receivables.value) },
        { label: 'زمان وصول حساب‌های دریافتنی', value: days(balances.receivables.collectionDays) },
        { label: 'حساب‌های پرداختنی', value: entered(balances.payables.value) },
        { label: 'زمان پرداخت حساب‌های پرداختنی', value: days(balances.payables.paymentDays) },
        { label: 'وجه نقد در گردش', value: entered(balances.cashInHand) },
        { label: 'سپرده کوتاه‌مدت', value: entered(balances.shortTermDeposits) },
        { label: 'مازاد نقد', value: entered(balances.cashSurplus) },
      ],
    },
    ...grid(
      'مانده آغازین دارایی‌های ثابت',
      ['قلم سرمایه‌گذاری', 'ارزش دفتری (پول محلی)'],
      balances.fixedAssets.map((asset) => [text(asset.item), entered(asset.value)]),
    ),
    ...grid(
      'مانده آغازین موجودی‌ها',
      ['نوع', 'قلم', 'مقدار', 'قیمت واحد (پول محلی)', 'ارزش (پول محلی)'],
      [
        ...balances.materials.map((stock) => [
          text('مواد'),
          text(stock.cost),
          NONE,
          NONE,
          entered(stock.value),
        ]),
        ...balances.workInProgress.map((stock) => [
          text('کالای در جریان ساخت'),
          text(stock.product),
          NONE,
          NONE,
          entered(stock.value),
        ]),
        ...balances.finishedProducts.map((stock) => [
          text('کالای ساخته‌شده'),
          text(stock.product),
          entered(stock.quantity),
          entered(stock.price),
          NONE,
        ]),
      ],
    ),
    ...grid(
      'مانده آغازین تسهیلات و آورده',
      ['نوع', 'نام', 'مانده', 'ارز'],
      [
        ...balances.loans.map((loan) => [
          text('تسهیلات'),
          text(loan.loan),
          entered(loan.balance),
          code(loanCurrency(loan.loan)),
        ]),
        ...balances.equity.map((equity) => [
          text('آورده'),
          text(equity.equity),
          entered(equity.value),
          code(input.localCurrency),
        ]),
      ],
    ),
  ];
}

/** Every input of the run, section by section as in the editor. */
export function inputBlocks(input: ProjectInputData, frame: Frame): ReportBlock[] {
  return [
    ...general(input, frame),
    ...rates(input, frame),
    ...investment(input, frame),
    ...financing(input, frame),
    ...operations(input, frame),
    ...startingBalances(input),
    ...pricesAndNotes(input, frame),
  ];
}
