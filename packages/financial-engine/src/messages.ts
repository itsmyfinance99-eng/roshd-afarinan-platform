/**
 * Persian messages for every warning and input-error code the engine emits. Codes stay stable for
 * tests and storage; the API and the web app render these texts (fa-IR). `{name}` placeholders
 * are filled from the warning's or error's `params`, with Persian digits.
 */
export const ENGINE_MESSAGES_FA = {
  // Input errors (EngineInputError)
  'amount.negative': 'این مقدار نمی‌تواند منفی باشد.',
  'breakEven.productRevenueMismatch':
    'جمع فروش محصولات ({actual}) با فروش کل دوره ({expected}) برابر نیست.',
  'mirr.horizonTooShort': 'افق طرح باید از تاریخ مرجع تنزیل طولانی‌تر باشد.',
  'period.lengthNotPositiveInteger': 'طول هر دوره باید عدد صحیح مثبت (بر حسب ماه) باشد.',
  'rate.notAboveMinus100': 'نرخ باید بیشتر از منفی ۱۰۰ درصد باشد.',
  'rate.notInUnitInterval': 'نرخ باید از صفر تا کمتر از ۱۰۰ درصد باشد.',
  'rate.pathLengthMismatch': 'تعداد نرخ‌ها ({actual}) با تعداد دوره‌ها ({expected}) برابر نیست.',
  'series.empty': 'هیچ دوره‌ای وارد نشده است.',
  'series.lengthMismatch': 'تعداد مقادیر ({actual}) با تعداد دوره‌ها ({expected}) برابر نیست.',
  'wacc.noCapital': 'جمع منابع تأمین مالی باید بیشتر از صفر باشد.',

  // Warnings: a value that does not exist or cannot be computed
  'irr.noSignChange': 'جریان نقدی تغییر علامت ندارد؛ نرخ بازده داخلی وجود ندارد.',
  'irr.notFound': 'نرخ بازده داخلی بین منفی ۹۹ درصد و ۱۰۰۰ درصد پیدا نشد.',
  'irr.multiple':
    'جریان نقدی {count} نرخ بازده داخلی دارد ({roots})؛ هیچ‌کدام به‌تنهایی معیار معتبری نیست.',
  'mirr.ratesRequired':
    'نرخ بازده داخلی یکتا وجود ندارد؛ برای MIRR نرخ سرمایه‌گذاری مجدد و نرخ استقراض را وارد کنید.',
  'mirr.noDeficit': 'جریان نقدی هیچ کسری ندارد؛ MIRR قابل محاسبه نیست.',
  'payback.noInvestment':
    'جریان نقدی تجمعی هیچ‌گاه منفی نمی‌شود؛ دوره بازگشت سرمایه قابل محاسبه نیست.',
  'payback.notReached': 'سرمایه تا پایان افق طرح بازنمی‌گردد.',
  'payback.notSustained':
    'جریان نقدی تجمعی پس از بازگشت سرمایه، در دوره {period} دوباره صفر یا منفی می‌شود.',
  'npvr.noInvestment': 'ارزش فعلی سرمایه‌گذاری صفر یا منفی است؛ نسبت NPV قابل محاسبه نیست.',
  'bcr.noCosts': 'ارزش فعلی هزینه‌ها صفر یا منفی است؛ نسبت منفعت به هزینه قابل محاسبه نیست.',
  'breakEven.noSales': 'در این دوره فروشی وجود ندارد؛ نقطه سربه‌سر قابل محاسبه نیست.',
  'breakEven.noVolume': 'مقدار فروش صفر است؛ قیمت متوسط و مقدار سربه‌سر قابل محاسبه نیست.',
  'breakEven.nonPositiveMargin':
    'حاشیه فروش متغیر صفر یا منفی است؛ هزینه‌های ثابت در هیچ سطحی از فروش پوشش داده نمی‌شود.',
  'breakEven.noFixedCosts': 'هزینه ثابتی وجود ندارد؛ نسبت پوشش هزینه ثابت قابل محاسبه نیست.',
  'dscr.noDebtService':
    'در هیچ دوره‌ای خدمت بدهی بلندمدت وجود ندارد؛ نسبت پوشش خدمت بدهی قابل محاسبه نیست.',
  'llcr.noDebt': 'بدهی بلندمدت باقی‌مانده‌ای وجود ندارد؛ نسبت پوشش عمر وام قابل محاسبه نیست.',
} as const satisfies Record<string, string>;

export type EngineMessageCode = keyof typeof ENGINE_MESSAGES_FA;

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** ASCII digits to Persian digits; a decimal point between digits becomes the Persian «٫». */
export function toPersianDigits(text: string): string {
  return text
    .replace(/(?<=\d)\.(?=\d)/g, '٫')
    .replace(/\d/g, (d) => PERSIAN_DIGITS.charAt(d.charCodeAt(0) - 48));
}

/** The Persian message for a code, with its params filled in; unknown codes return the code. */
export function engineMessageFa(code: string, params: Record<string, string> = {}): string {
  const template = (ENGINE_MESSAGES_FA as Record<string, string>)[code];
  if (template === undefined) return code;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : toPersianDigits(value);
  });
}
