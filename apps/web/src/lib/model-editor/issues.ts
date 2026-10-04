import { projectInputSchema, toPersianDigits, type ProjectInputData } from '@roshd/validation';
import { getIn, textAt, type Draft } from './paths';

/**
 * What a calculation still needs, field by field (ST-34.07): the messages of the input schema and
 * of the engine, each placed in the section of the editor that holds the field.
 */

export const SECTIONS = [
  'assumptions',
  'investment',
  'financing',
  'sales',
  'costs',
  'workingCapital',
  'startingBalance',
] as const;
export type SectionId = (typeof SECTIONS)[number];

export const SECTION_LABELS_FA: Record<SectionId, string> = {
  assumptions: 'فرض‌ها',
  investment: 'سرمایه‌گذاری',
  financing: 'تأمین مالی',
  sales: 'تولید و فروش',
  costs: 'هزینه‌ها',
  workingCapital: 'سرمایه در گردش',
  startingBalance: 'ترازنامه آغازین',
};

export interface Issue {
  /** Path in the input, joined with dots: `investment.items.0.amounts.3`. */
  path: string;
  section: SectionId;
  /** Where the field is, in words: «ساختمان › مبلغ‌ها › ستون ۴». */
  label: string;
  message: string;
}

const COVERAGE = /Coverage$/;

function sectionOf(parts: string[]): SectionId {
  const [head, second] = parts;
  if (head === 'investment') return 'investment';
  if (head === 'financing') return 'financing';
  if (head === 'startingBalances') return 'startingBalance';
  if (head === 'statements') {
    if (second === 'profitDistribution') return 'financing';
    if (second === 'assetSales' || second === 'allowances') return 'investment';
    return 'assumptions';
  }
  if (head === 'operations') {
    if (second === 'cash' || parts.some((part) => COVERAGE.test(part))) return 'workingCapital';
    if (second === 'costs' || second === 'costCentres') return 'costs';
    return 'sales';
  }
  return 'assumptions';
}

const FIELD_LABELS_FA: Record<string, string> = {
  horizon: 'افق برنامه‌ریزی',
  calendar: 'تقویم',
  start: 'آغاز ساخت',
  year: 'سال',
  month: 'ماه',
  balanceMonth: 'ماه پایان سال مالی',
  construction: 'دوره ساخت',
  startup: 'دوره راه‌اندازی',
  periods: 'تعداد دوره',
  periodMonths: 'طول دوره',
  productionYears: 'سال‌های تولید',
  localCurrency: 'ارز محلی',
  exchangeRates: 'نرخ ارز',
  inflation: 'تورم',
  investment: 'سرمایه‌گذاری',
  items: 'اقلام',
  key: 'نام',
  group: 'گروه',
  origin: 'منشأ',
  currency: 'ارز',
  amounts: 'مبلغ‌ها',
  amount: 'مبلغ',
  depreciation: 'استهلاک',
  method: 'روش',
  lifeMonths: 'عمر استهلاک',
  salvageRate: 'ارزش اسقاط',
  decliningRate: 'نرخ نزولی',
  startPeriod: 'شروع استهلاک',
  escalation: 'افزایش قیمت',
  firstYearEscalator: 'ضریب سال اول',
  financing: 'تأمین مالی',
  equity: 'آورده',
  class: 'نوع آورده',
  loans: 'تسهیلات',
  loan: 'شرایط',
  type: 'نوع بازپرداخت',
  repaymentMonths: 'فاصله اقساط',
  flows: 'برداشت‌ها',
  day: 'ماه',
  rates: 'نرخ سود',
  fromDay: 'از ماه',
  rate: 'نرخ',
  capitalisedShare: 'سهم سود انباشته',
  capitaliseUntilDay: 'پایان انباشت سود',
  numberOfRepayments: 'تعداد اقساط',
  firstRepaymentDay: 'اولین قسط',
  interestDueDay: 'ماه پرداخت سود',
  fees: 'کارمزدها',
  agency: 'کارمزد کارگزاری',
  guarantee: 'کارمزد تضمین',
  commitment: 'کارمزد تعهد',
  other: 'سایر کارمزدها',
  operations: 'عملیات',
  products: 'محصولات',
  product: 'محصول',
  nominalCapacity: 'ظرفیت اسمی',
  production: 'بازه تولید',
  firstPeriod: 'اولین دوره',
  lastPeriod: 'آخرین دوره',
  sales: 'فروش',
  market: 'بازار',
  quantities: 'مقدار',
  capacityShares: 'درصد ظرفیت',
  price: 'قیمت',
  prices: 'قیمت',
  salesTaxRate: 'مالیات فروش',
  subsidyRate: 'نرخ یارانه',
  subsidyAmount: 'مبلغ یارانه',
  receivablesCoverage: 'حساب‌های دریافتنی',
  finishedGoodsCoverage: 'موجودی کالای ساخته‌شده',
  workInProgressCoverage: 'کالای در جریان ساخت',
  stockCoverage: 'موجودی مواد',
  payablesCoverage: 'حساب‌های پرداختنی',
  days: 'روز',
  shareOfYear: 'سهم از سال',
  costs: 'هزینه‌ها',
  category: 'دسته هزینه',
  standard: 'هزینه استاندارد',
  mode: 'روش',
  quantity: 'مقدار',
  variableShare: 'سهم متغیر',
  variableShares: 'سهم متغیر',
  fixedCost: 'هزینه ثابت',
  adjustments: 'مقادیر دوره‌ای',
  costCentre: 'مرکز هزینه',
  costCentres: 'مراکز هزینه',
  allocation: 'تسهیم',
  shares: 'سهم محصولات',
  cash: 'وجه نقد',
  localCoverage: 'پوشش نقد داخلی',
  foreignCoverage: 'پوشش نقد خارجی',
  depositShare: 'سهم سپرده کوتاه‌مدت',
  depositRate: 'نرخ سپرده',
  statements: 'صورت‌ها',
  tax: 'مالیات',
  brackets: 'پله‌ها',
  lowerLimit: 'حد پایین',
  holidayYears: 'سال‌های معافیت',
  lossCarryForwardYears: 'سال‌های انتقال زیان',
  allowances: 'معافیت‌ها',
  assetSales: 'فروش دارایی',
  item: 'قلم',
  period: 'دوره',
  proceeds: 'بهای فروش',
  profitDistribution: 'تقسیم سود',
  retainedShare: 'سهم سود نگه‌داشته',
  shareholders: 'سهامداران',
  preferredRate: 'نرخ سود ممتاز',
  preferredAmount: 'مبلغ سود ممتاز',
  ordinaryShare: 'سهم از سود عادی',
  repatriatedShare: 'سهم خروجی از کشور',
  discounting: 'تنزیل',
  totalCapitalRate: 'نرخ تنزیل کل سرمایه',
  equityRate: 'نرخ تنزیل آورده',
  reference: 'تاریخ مرجع تنزیل',
  reinvestmentRate: 'نرخ سرمایه‌گذاری مجدد',
  borrowingRate: 'نرخ استقراض',
  referenceYear: 'سال مرجع',
  breakEvenYear: 'سال تحلیل سربه‌سر',
  residualValueTiming: 'زمان بازگشت ارزش اسقاط',
  automaticCashCoverage: 'پوشش خودکار کسری نقد',
  startingBalances: 'ترازنامه آغازین',
  fixedAssets: 'دارایی‌های ثابت موجود',
  materials: 'موجودی مواد',
  workInProgress: 'کالای در جریان ساخت',
  finishedProducts: 'کالای ساخته‌شده',
  receivables: 'حساب‌های دریافتنی',
  payables: 'حساب‌های پرداختنی',
  collectionDays: 'روز وصول',
  paymentDays: 'روز پرداخت',
  cashInHand: 'وجه نقد در گردش',
  shortTermDeposits: 'سپرده کوتاه‌مدت',
  cashSurplus: 'مازاد نقد',
  value: 'مبلغ',
  balance: 'مانده',
  cost: 'قلم هزینه',
  notes: 'منبع فرض‌ها',
  source: 'منبع',
  asOf: 'تاریخ اعتبار',
};

/** Parts of a path that only group fields and add nothing for the reader. */
const SILENT = new Set(['items', 'operations', 'statements', 'investment', 'financing', 'loan']);
/** Series whose numbered values are columns of a table (the others are rows of a list). */
const SERIES = new Set([
  'amounts',
  'quantities',
  'capacityShares',
  'prices',
  'variableShares',
  'price',
  'salesTaxRate',
  'subsidyRate',
  'subsidyAmount',
  'exchangeRates',
  'inflation',
  'escalation',
  'totalCapitalRate',
  'equityRate',
  'retainedShare',
]);

const asKey = (part: string): string | number => (/^\d+$/.test(part) ? Number(part) : part);

function labelOf(parts: string[], draft: Draft): string {
  const words: string[] = [];
  parts.forEach((part, i) => {
    if (/^\d+$/.test(part)) {
      const node = getIn(draft, parts.slice(0, i + 1).map(asKey));
      // A row is named by its own name; a row that has none by nature (dividend conditions, a
      // sale of an asset, a starting balance) by the item it belongs to.
      const referring = parts[0] === 'startingBalances' || parts[i - 1] === 'assetSales';
      const name = ['key', 'equity', ...(referring ? ['item', 'cost', 'product', 'loan'] : [])]
        .map((property) => textAt(node, [property]))
        .find((text) => text !== '');
      const number = toPersianDigits(Number(part) + 1);
      if (name !== undefined) words.push(`«${name}»`);
      else if (SERIES.has(parts[i - 1] ?? '') || SERIES.has(parts[i - 2] ?? '')) {
        words.push(`ستون ${number}`);
      } else words.push(`ردیف ${number}`);
    } else if (!SILENT.has(part) || i === parts.length - 1) {
      words.push(Object.hasOwn(FIELD_LABELS_FA, part) ? (FIELD_LABELS_FA[part] ?? part) : part);
    }
  });
  return words.join(' › ');
}

export function describeIssue(path: string, message: string, draft: Draft): Issue {
  const parts = path === '' ? [] : path.split('.');
  return { path, section: sectionOf(parts), label: labelOf(parts, draft), message };
}

/** `investment.items[2].amounts[0]` (engine) → `investment.items.2.amounts.0`. */
export const enginePath = (field: string): string => field.replace(/\[(\d+)\]/g, '.$1');

export type InputCheck = { ok: true; input: ProjectInputData } | { ok: false; issues: Issue[] };

/** Checks the draft against the input schema; a complete draft is the engine's input. */
export function checkDraft(draft: Draft): InputCheck {
  const parsed = projectInputSchema.safeParse(draft);
  if (parsed.success) return { ok: true, input: parsed.data };
  const seen = new Set<string>();
  const issues: Issue[] = [];
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String).join('.');
    if (seen.has(path)) continue;
    seen.add(path);
    issues.push(describeIssue(path, issue.message, draft));
  }
  return { ok: false, issues };
}
