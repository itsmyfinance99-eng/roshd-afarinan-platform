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
  'horizon.outOfRange': 'این مقدار باید عددی صحیح از {min} تا {max} باشد.',
  'horizon.periodLength': 'طول دوره باید ماهانه، سه‌ماهه، شش‌ماهه یا سالانه باشد.',
  'horizon.startupTooLong': 'دوره راه‌اندازی حداکثر ۲۴ ماه است.',
  'horizon.tooLong': 'افق طرح حداکثر {max} ماه است.',
  'horizon.startupBeyondProduction': 'دوره راه‌اندازی از پایان دوره بهره‌برداری فراتر می‌رود.',
  'depreciation.firstYearMonths': 'تعداد ماه‌های سال اول استهلاک باید عددی صحیح از ۱ تا ۱۲ باشد.',
  'depreciation.lifeTooLong': 'عمر استهلاک حداکثر {max} ماه است.',
  'depreciation.rateRequired': 'برای روش نزولی، نرخ استهلاک را وارد کنید.',
  'depreciation.rateOutOfRange': 'نرخ استهلاک نزولی باید بیشتر از صفر و حداکثر ۱۰۰ درصد باشد.',
  'index.notPositive': 'شاخص یا ضریب تعدیل باید بیشتر از صفر باشد.',
  'index.factorNotPositive': 'جمع تورم و افزایش قیمت این سال، ضریب قیمت را صفر یا منفی می‌کند.',
  'index.escalatorNotInteger': 'ضریب افزایش قیمت سال اول باید عددی صحیح و نامنفی باشد.',
  'index.baseOutOfRange': 'سال پایه شاخص خارج از بازه سال‌های واردشده است.',
  'exchangeRate.notPositive': 'نرخ ارز باید بیشتر از صفر باشد.',
  'loan.negativeBalance': 'بازپرداخت از مانده تسهیلات بیشتر است.',
  'rate.negative': 'نرخ نمی‌تواند منفی باشد.',
  'loan.dayInvalid': 'تاریخ باید روزی در افق طرح (حداکثر صد سال) باشد.',
  'loan.notMonthEnd': 'این تاریخ باید آخرین روز یک ماه باشد.',
  'loan.repaymentMonths': 'فاصله بازپرداخت باید ماهانه، سه‌ماهه، شش‌ماهه یا سالانه باشد.',
  'loan.noDisbursement': 'برای تسهیلات هیچ برداشتی وارد نشده است.',
  'loan.rateMissing': 'نرخ سود تسهیلات از تاریخ اولین برداشت وارد نشده است.',
  'loan.ratesNotAscending': 'تاریخ‌های شروع نرخ سود باید به ترتیب و بدون تکرار باشند.',
  'loan.capitaliseUntilRequired':
    'برای سود انباشته (سرمایه‌ای)، آخرین تاریخ انباشت سود را وارد کنید.',
  'loan.capitaliseAfterFirstRepayment': 'انباشت سود باید پیش از تاریخ اولین قسط پایان یابد.',
  'loan.interestDueDayRequired': 'برای تسهیلات با جدول دلخواه، ماه پرداخت سود را وارد کنید.',
  'loan.horizonEndRequired': 'برای تسهیلات با جدول دلخواه، پایان افق طرح لازم است.',
  'loan.flowOutsideHorizon': 'این برداشت یا بازپرداخت بعد از پایان افق طرح است.',
  'loan.numberOfRepayments': 'تعداد اقساط باید عدد صحیح از ۱ تا ۱۲۰۰ باشد.',
  'loan.firstRepaymentRequired':
    'تاریخ اولین قسط یا پایان دوره ساخت را وارد کنید تا تاریخ پیش‌فرض COMFAR محاسبه شود.',
  'loan.flowAfterDisbursementPhase':
    'برداشت یا بازپرداخت بعد از پایان دوره برداشت مجاز نیست؛ تاریخ اولین قسط را دیرتر کنید.',
  'loan.capitalisedShare': 'سهم سود انباشته باید از صفر تا ۱۰۰ درصد باشد.',
  'loan.periodsNotAscending': 'پایان دوره‌ها باید به ترتیب صعودی باشد.',
  'model.duplicateKey': 'این کلید بیش از یک بار به کار رفته است.',
  'model.exchangeRateMissing': 'نرخ ارز {currency} برای دوره‌های طرح وارد نشده است.',
  'investment.group': 'گروه قلم سرمایه‌گذاری معتبر نیست.',
  'investment.depreciationStart':
    'شروع استهلاک باید اولین روز یکی از دوره‌های بهره‌برداری (راه‌اندازی یا تولید) باشد.',
  'financing.equityClass': 'نوع آورده سهامداران معتبر نیست.',
  'financing.interestDepreciationStart':
    'استهلاک سود انباشته باید بعد از آخرین تاریخ انباشت سود شروع شود.',
  'model.origin': 'منشأ قلم باید داخلی یا خارجی باشد.',
  'amount.notPositive': 'این مقدار باید بیشتر از صفر باشد.',
  'share.outOfRange': 'سهم باید از صفر تا ۱۰۰ درصد باشد.',
  'operations.noProducts': 'دست‌کم یک محصول تعریف کنید.',
  'operations.unknownProduct': 'این محصول تعریف نشده است.',
  'operations.market': 'بازار فروش باید داخلی یا صادراتی باشد.',
  'operations.volume':
    'برای هر سطر فروش یا مقدار فروش هر دوره را وارد کنید یا درصد ظرفیت اسمی را، نه هر دو.',
  'operations.nominalCapacityRequired': 'برای این ورودی، ظرفیت اسمی محصول را وارد کنید.',
  'operations.constructionSales': 'در دوره ساخت فروشی وجود ندارد.',
  'production.interval':
    'بازه تولید محصول باید از یک دوره بهره‌برداری شروع شود و پایان آن پیش از شروع نباشد.',
  'production.salesOutsideInterval':
    'فروش این دوره خارج از بازه تولید محصول است و از موجودی کالای ساخته‌شده بیشتر است.',
  'operations.inflationMissing': 'نرخ تورم {currency} برای سال‌های طرح وارد نشده است.',
  'operations.escalationRequired':
    'با فعال بودن تورم، نرخ افزایش قیمت این قلم را وارد کنید (صفر یعنی بدون افزایش).',
  'operations.costCategory': 'دسته هزینه معتبر نیست.',
  'operations.costCentre': 'مرکز هزینه تعریف نشده یا بدون محصول است.',
  'operations.costCentreGroup': 'گروه مرکز هزینه معتبر نیست.',
  'operations.costCentreProduct': 'محصول این قلم هزینه به این مرکز هزینه اختصاص ندارد.',
  'operations.initialStockCategory':
    'موجودی اولیه در دوره ساخت فقط برای مواد اولیه، ملزومات، آب و برق، انرژی و قطعات یدکی است.',
  'operations.indirectStandard':
    'هزینه غیرمستقیم فقط به‌صورت مبلغ هر دوره وارد می‌شود؛ هزینه استاندارد مخصوص هزینه مستقیم محصول است.',
  'operations.standardMode': 'روش هزینه استاندارد باید «در ظرفیت اسمی» یا «به ازای هر واحد» باشد.',
  'operations.negativeCost': 'تعدیل این دوره، هزینه ثابت یا متغیر قلم را منفی می‌کند.',
  'operations.allocationRequired': 'کلید تسهیم این هزینه غیرمستقیم به محصولات را انتخاب کنید.',
  'operations.allocationKey': 'کلید تسهیم معتبر نیست.',
  'operations.allocationShares': 'جمع سهم محصولات در تسهیم باید ۱۰۰ درصد باشد.',
  'operations.coverageRequired': 'روزهای پوشش این قلم سرمایه در گردش را وارد کنید.',
  'operations.coverage': 'پوشش را یا بر حسب روز وارد کنید یا بر حسب درصد سال، نه هر دو.',

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
  'loan.beyondHorizon': 'بخشی از بازپرداخت تسهیلات بعد از پایان افق طرح است.',
  'loan.notRepaid': 'تسهیلات تا پایان افق طرح تسویه نمی‌شود؛ مانده: {balance}.',
  'allocation.noBasis':
    'در دوره {period} مبنای تسهیم قلم «{item}» صفر است؛ هزینه به‌طور مساوی بین محصولات تقسیم شد.',
  'loan.interestAfterHorizon':
    'سود و کارمزد انباشته‌ای ({amount}) بعد از آخرین سررسید پرداخت سود باقی می‌ماند.',
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
