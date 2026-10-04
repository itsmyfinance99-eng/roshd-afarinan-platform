import type { ProjectModel } from '@roshd/financial-engine';
import {
  COST_CATEGORY_LABELS_FA,
  COST_CENTRE_GROUP_LABELS_FA,
  EQUITY_CLASS_LABELS_FA,
  INVESTMENT_GROUP_LABELS_FA,
  MARKET_LABELS_FA,
} from '@roshd/validation';
import { isolate } from './document';
import { amounts, type Line, type StatementRow, type StatementTable } from './tables';

/**
 * The input schedules of a calculation run as tables (ST-34.09): investment costs, working
 * capital, production costs, production and sales programme and sources of finance, in the order
 * of COMFAR's schedules (manual X.C.1–5; comfar-model-spec §5). Like the statements, every line
 * is the engine's own; nothing is summed here.
 */

type Investment = ProjectModel['investment'];
type Financing = ProjectModel['financing'];
type Operations = ProjectModel['operations'];
type CostBreakdown = Operations['costs']['produced'];
type LoanPeriods = Financing['loanTotals'];

/** A name the user gave to an item, quoted as in the editor. */
export const named = (kind: string, name: string): string => `${kind} «${isolate(name)}»`;

const row = (
  label: string,
  values: (string | null)[],
  kind: StatementRow['kind'],
  strong = false,
): StatementRow => ({ label, values, kind, ...(strong ? { strong } : {}) });

const lines = <K extends string>(
  labels: Record<K, string>,
  values: Record<K, string[]>,
  keys: readonly K[],
): Line[] => keys.map((key) => [labels[key], values[key]]);

const FIXED_GROUPS = [
  'LAND',
  'SITE_PREPARATION',
  'BUILDINGS',
  'MACHINERY',
  'AUXILIARY_EQUIPMENT',
  'INCORPORATED_ASSETS',
  'CONTINGENCY',
  'OTHER_FIXED',
] as const;

export function investmentCostsTable(
  investment: Investment,
  financing: Financing,
  operations: Operations,
): StatementTable {
  return {
    id: 'investment',
    title: 'هزینه‌های سرمایه‌گذاری',
    sections: [
      {
        title: 'سرمایه‌گذاری ثابت',
        rows: amounts([
          ...lines(INVESTMENT_GROUP_LABELS_FA, investment.groups, FIXED_GROUPS),
          ['جمع سرمایه‌گذاری ثابت', investment.fixedInvestment, true],
          ['سرمایه‌گذاری ثابت: منشأ خارجی', investment.fixedInvestmentByOrigin.foreign],
          ['سرمایه‌گذاری ثابت: منشأ داخلی', investment.fixedInvestmentByOrigin.local],
        ]),
      },
      {
        title: 'هزینه‌های قبل از بهره‌برداری',
        rows: amounts([
          ['هزینه‌های قبل از بهره‌برداری (بدون سود تسهیلات)', investment.preProduction, true],
          ['قبل از بهره‌برداری: منشأ خارجی', investment.preProductionByOrigin.foreign],
          ['قبل از بهره‌برداری: منشأ داخلی', investment.preProductionByOrigin.local],
          ['سود و کارمزد تسهیلات در دوره ساخت', financing.preProductionInterest],
        ]),
      },
      {
        title: 'جمع',
        rows: amounts([
          [
            'جمع سرمایه‌گذاری ثابت و قبل از بهره‌برداری (بدون سود تسهیلات)',
            investment.totalInvestment,
            true,
          ],
          ['افزایش سرمایه در گردش خالص', operations.workingCapital.totals.increase],
        ]),
      },
      {
        title: 'استهلاک و ارزش دفتری',
        rows: amounts([
          ['استهلاک دارایی‌های ثابت', investment.depreciation.fixed],
          ['استهلاک هزینه‌های قبل از بهره‌برداری', investment.depreciation.preProduction],
          ['استهلاک سود و کارمزد دوره ساخت', financing.interestDepreciation],
          ['جمع استهلاک (بدون سود دوره ساخت)', investment.depreciation.total, true],
          ['ارزش دفتری دارایی‌های ثابت', investment.bookValue.fixed],
          ['ارزش دفتری هزینه‌های قبل از بهره‌برداری', investment.bookValue.preProduction],
          ['ارزش دفتری سود و کارمزد دوره ساخت', financing.interestBookValue],
        ]),
      },
    ],
  };
}

export function workingCapitalTable(operations: Operations): StatementTable {
  const { totals, cash } = operations.workingCapital;
  return {
    id: 'working-capital',
    title: 'سرمایه در گردش خالص',
    sections: [
      {
        title: 'دارایی‌های جاری',
        rows: amounts([
          ['موجودی مواد', totals.materials],
          ['کالای در جریان ساخت', totals.workInProgress],
          ['کالای ساخته‌شده', totals.finishedProducts],
          ['جمع موجودی‌ها', totals.inventory, true],
          ['حساب‌های دریافتنی', totals.receivables],
          ['وجه نقد در گردش', cash.inHand],
          ['سپرده کوتاه‌مدت', cash.deposits],
          ['جمع وجه نقد مورد نیاز', totals.cash, true],
          ['جمع دارایی‌های جاری', totals.currentAssets, true],
        ]),
      },
      {
        title: 'بدهی‌های جاری و سرمایه در گردش',
        rows: amounts([
          ['حساب‌های پرداختنی', totals.currentLiabilities],
          ['سرمایه در گردش خالص', totals.netWorkingCapital, true],
          ['افزایش سرمایه در گردش خالص', totals.increase],
          ['سرمایه در گردش خالص: منشأ خارجی', totals.foreign],
          ['سرمایه در گردش خالص: منشأ داخلی', totals.local],
        ]),
      },
    ],
  };
}

const FACTORY_CATEGORIES = [
  'RAW_MATERIALS',
  'FACTORY_SUPPLIES',
  'UTILITIES',
  'ENERGY',
  'SPARE_PARTS',
  'LABOUR',
  'LABOUR_OVERHEADS',
  'FACTORY_OVERHEADS',
] as const;

const breakdownSections = (costs: CostBreakdown): StatementTable['sections'] => [
  {
    rows: amounts([
      ...lines(COST_CATEGORY_LABELS_FA, costs.categories, FACTORY_CATEGORIES),
      ['هزینه‌های کارخانه', costs.factoryCosts, true],
      [COST_CATEGORY_LABELS_FA.ADMINISTRATIVE_OVERHEADS, costs.categories.ADMINISTRATIVE_OVERHEADS],
      ['هزینه‌های عملیاتی', costs.operatingCosts, true],
      [COST_CATEGORY_LABELS_FA.LEASING, costs.leasing],
      [COST_CATEGORY_LABELS_FA.DIRECT_MARKETING, costs.categories.DIRECT_MARKETING],
      [COST_CATEGORY_LABELS_FA.MARKETING_OVERHEADS, costs.categories.MARKETING_OVERHEADS],
      ['جمع هزینه‌ها (بدون استهلاک و هزینه مالی)', costs.total, true],
    ]),
  },
  {
    title: 'تفکیک جمع هزینه‌ها',
    rows: amounts([
      ['هزینه‌های ثابت', costs.fixed],
      ['هزینه‌های متغیر', costs.variable],
      ['منشأ خارجی', costs.foreign],
      ['منشأ داخلی', costs.local],
      ['جمع مواد (اولیه، ملزومات، آب و برق، انرژی، یدکی)', costs.materials],
      ['جمع هزینه‌های بازاریابی', costs.marketing],
    ]),
  },
];

/** Costs of the products produced, and of the products sold (which the income statement uses). */
export function productionCostTables(operations: Operations): StatementTable[] {
  const { costs, products } = operations;
  const groups = Object.keys(COST_CENTRE_GROUP_LABELS_FA) as (keyof typeof costs.groups)[];
  return [
    {
      id: 'costs-produced',
      title: 'هزینه‌های تولید (محصولات تولیدشده)',
      sections: breakdownSections(costs.produced),
    },
    {
      id: 'costs-sold',
      title: 'هزینه محصولات فروخته‌شده',
      sections: breakdownSections(costs.sold),
    },
    {
      id: 'costs-allocation',
      title: 'هزینه‌ها به تفکیک مرکز هزینه و محصول',
      sections: [
        {
          title: 'گروه‌های مرکز هزینه',
          rows: amounts(lines(COST_CENTRE_GROUP_LABELS_FA, costs.groups, groups)),
        },
        ...(costs.centres.length === 0
          ? []
          : [
              {
                title: 'مراکز هزینه',
                rows: amounts(
                  costs.centres.map((centre): Line => [named('مرکز', centre.key), centre.total]),
                ),
              },
            ]),
        {
          title: 'هزینه مستقیم و سهم غیرمستقیم هر محصول (تولیدشده)',
          rows: amounts(
            products.flatMap((product): Line[] => [
              [`${named('محصول', product.key)}: هزینه مستقیم`, product.costs.direct.total],
              [
                `${named('محصول', product.key)}: با سهم هزینه‌های غیرمستقیم`,
                product.costs.produced.total,
                true,
              ],
            ]),
          ),
        },
        {
          title: 'هزینه‌های غیرمستقیم پیش از تسهیم',
          rows: amounts([['جمع هزینه‌های غیرمستقیم', costs.indirect.total, true]]),
        },
      ],
    },
  ];
}

const revenueRows = (r: Operations['sales'] | Operations['products'][number]): StatementRow[] =>
  amounts([
    ['فروش ناخالص (با مالیات فروش)', r.grossRevenue],
    ['مالیات فروش', r.salesTax],
    ['فروش خالص', r.netRevenue],
    ['یارانه', r.subsidy],
    ['درآمد فروش (فروش خالص و یارانه)', r.revenue, true],
  ]);

/** The programme of every product, then the sales of all products together. */
export function salesProgrammeTables(operations: Operations): StatementTable[] {
  const products = operations.products.map((product, index): StatementTable => ({
    id: `programme-${index + 1}`,
    title: `برنامه تولید و فروش ${named('محصول', product.key)}`,
    sections: [
      {
        title: 'مقدار',
        rows: [
          row('موجودی اول دوره', product.quantities.stockBroughtForward, 'quantity'),
          row('تولید', product.quantities.produced, 'quantity'),
          row('فروش', product.quantities.sold, 'quantity', true),
          row('موجودی پایان دوره', product.quantities.stockCarried, 'quantity'),
          row('بهره‌برداری از ظرفیت اسمی', product.capacityUtilisation, 'percent'),
        ],
      },
      ...product.lines.map((line) => ({
        title: `${named('سطر فروش', line.key)} (بازار ${MARKET_LABELS_FA[line.market]})`,
        rows: [
          row('مقدار فروش', line.quantity, 'quantity'),
          row('قیمت جاری هر واحد (پول محلی)', line.unitPrice, 'quantity'),
          ...amounts([['درآمد فروش', line.revenue]]),
        ],
      })),
      { title: 'درآمد', rows: revenueRows(product) },
    ],
  }));
  const { sales } = operations;
  return [
    ...products,
    {
      id: 'sales-total',
      title: 'فروش همه محصولات',
      sections: [
        {
          rows: [
            ...amounts([
              ['فروش داخلی', sales.local],
              ['فروش صادراتی', sales.export],
            ]),
            ...revenueRows(sales),
          ],
        },
      ],
    },
  ];
}

const loanRows = (periods: LoanPeriods): StatementRow[] => {
  const of = (name: keyof LoanPeriods[number]) => periods.map((period) => period[name]);
  return amounts([
    ['مانده اول دوره', of('beginningBalance')],
    ['برداشت تسهیلات', of('disbursement')],
    ['سود افزوده‌شده به اصل', of('capitalisedInterest')],
    ['بازپرداخت اصل', of('repayment')],
    ['تعدیل تسعیر ارز (زیان مثبت، سود منفی)', of('exchangeAdjustment')],
    ['مانده پایان دوره', of('endingBalance'), true],
    ['سود پرداختی', of('interest')],
    ['کارمزدها', of('fees')],
  ]);
};

/** Equity and loans of the project, then every loan on its own (all in local currency). */
export function financingTables(financing: Financing): StatementTable[] {
  const classes = Object.keys(EQUITY_CLASS_LABELS_FA) as (keyof typeof financing.equity.classes)[];
  return [
    {
      id: 'financing',
      title: 'منابع تأمین مالی',
      sections: [
        {
          title: 'آورده و کمک‌ها',
          rows: amounts([
            ...lines(EQUITY_CLASS_LABELS_FA, financing.equity.classes, classes),
            ['جمع آورده و کمک‌ها', financing.equity.total, true],
            ['آورده: منشأ خارجی', financing.equity.byOrigin.foreign],
            ['آورده: منشأ داخلی', financing.equity.byOrigin.local],
          ]),
        },
        { title: 'تسهیلات بلندمدت (همه تسهیلات)', rows: loanRows(financing.loanTotals) },
        {
          title: 'جمع',
          rows: amounts([
            ['جمع منابع نقدی (آورده و برداشت تسهیلات)', financing.totalSources, true],
            ['سود و کارمزد تسهیلات در دوره ساخت', financing.preProductionInterest],
          ]),
        },
      ],
    },
    ...financing.loans.map((loan, index): StatementTable => ({
      id: `loan-${index + 1}`,
      title: `${named('تسهیلات', loan.key)} (به پول محلی)`,
      sections: [{ rows: loanRows(loan.periods) }],
    })),
  ];
}
