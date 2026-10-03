import type {
  ALLOCATION_KEY_VALUES,
  COST_CATEGORY_VALUES,
  COST_CENTRE_GROUP_VALUES,
  DEPRECIATION_METHOD_VALUES,
  EQUITY_CLASS_VALUES,
  INVESTMENT_GROUP_VALUES,
} from './financial-model-input';

/**
 * Persian names of the value lists of a financial model (comfar-model-spec §4), shared by the
 * editor, the result views and the exports so that one term is used everywhere.
 */

export const INVESTMENT_GROUP_LABELS_FA: Record<(typeof INVESTMENT_GROUP_VALUES)[number], string> =
  {
    LAND: 'زمین',
    SITE_PREPARATION: 'آماده‌سازی و محوطه‌سازی',
    BUILDINGS: 'ساختمان و کارهای عمرانی',
    MACHINERY: 'ماشین‌آلات و تجهیزات تولید',
    AUXILIARY_EQUIPMENT: 'تجهیزات جانبی و خدماتی',
    INCORPORATED_ASSETS: 'دارایی‌های نامشهود (دانش فنی و حقوق)',
    CONTINGENCY: 'پیش‌بینی‌نشده',
    OTHER_FIXED: 'سایر دارایی‌های ثابت',
    PRE_PRODUCTION: 'هزینه‌های قبل از بهره‌برداری',
  };

export const EQUITY_CLASS_LABELS_FA: Record<(typeof EQUITY_CLASS_VALUES)[number], string> = {
  ORDINARY: 'سهام عادی',
  PREFERENCE: 'سهام ممتاز',
  JOINT_VENTURE: 'شریک سرمایه‌گذاری مشترک',
  SUBSIDY: 'یارانه و کمک بلاعوض',
};

export const COST_CATEGORY_LABELS_FA: Record<(typeof COST_CATEGORY_VALUES)[number], string> = {
  RAW_MATERIALS: 'مواد اولیه',
  FACTORY_SUPPLIES: 'ملزومات کارخانه',
  UTILITIES: 'آب، برق و خدمات عمومی',
  ENERGY: 'انرژی',
  SPARE_PARTS: 'قطعات یدکی',
  LABOUR: 'نیروی کار',
  LABOUR_OVERHEADS: 'سربار نیروی کار',
  FACTORY_OVERHEADS: 'سربار کارخانه',
  ADMINISTRATIVE_OVERHEADS: 'سربار اداری',
  LEASING: 'اجاره و لیزینگ',
  DIRECT_MARKETING: 'هزینه مستقیم بازاریابی',
  MARKETING_OVERHEADS: 'سربار بازاریابی',
};

/** Cost categories that keep a stock (comfar-model-spec §4.7). */
export const MATERIAL_COST_CATEGORIES: readonly (typeof COST_CATEGORY_VALUES)[number][] = [
  'RAW_MATERIALS',
  'FACTORY_SUPPLIES',
  'UTILITIES',
  'ENERGY',
  'SPARE_PARTS',
];

export const COST_CENTRE_GROUP_LABELS_FA: Record<
  (typeof COST_CENTRE_GROUP_VALUES)[number],
  string
> = {
  PRODUCTION: 'تولید',
  STORAGE: 'انبار',
  ENVIRONMENT: 'محیط زیست',
  MARKETING: 'بازاریابی',
  SERVICES: 'خدمات',
  ADMINISTRATION: 'اداری',
};

export const ALLOCATION_KEY_LABELS_FA: Record<
  (typeof ALLOCATION_KEY_VALUES)[number] | 'SHARES',
  string
> = {
  DIRECT_COST: 'به نسبت هزینه مستقیم',
  DIRECT_FACTORY_COST: 'به نسبت هزینه مستقیم کارخانه',
  DIRECT_MATERIAL: 'به نسبت مواد مستقیم',
  DIRECT_LABOUR: 'به نسبت نیروی کار مستقیم',
  SALES: 'به نسبت فروش',
  EQUAL: 'مساوی بین محصولات',
  SHARES: 'سهم دلخواه هر محصول',
};

export const DEPRECIATION_METHOD_LABELS_FA: Record<
  (typeof DEPRECIATION_METHOD_VALUES)[number],
  string
> = {
  LINEAR_TO_ZERO: 'خط مستقیم تا صفر',
  LINEAR_TO_SCRAP: 'خط مستقیم تا ارزش اسقاط',
  DECLINING_BALANCE: 'نزولی',
  SUM_OF_YEARS_DIGITS: 'مجموع سنوات',
};

export const LOAN_TYPE_LABELS_FA = {
  ANNUITY: 'اقساط مساوی',
  CONSTANT_PRINCIPAL: 'اصل مساوی',
  PROFILE: 'جدول دلخواه',
} as const;

export const ORIGIN_LABELS_FA = { LOCAL: 'داخلی', FOREIGN: 'خارجی' } as const;
export const MARKET_LABELS_FA = { LOCAL: 'داخلی', EXPORT: 'صادراتی' } as const;

export const DISCOUNT_REFERENCE_LABELS_FA = {
  START_OF_FIRST_PERIOD: 'آغاز دوره اول',
  END_OF_FIRST_YEAR: 'پایان سال اول',
} as const;

export const RESIDUAL_VALUE_TIMING_LABELS_FA = {
  YEAR_AFTER_PRODUCTION: 'سال پس از پایان تولید',
  END_OF_PRODUCTION: 'پایان تولید',
} as const;

/** COMFAR conventions the engine applies when the user leaves the choice open. */
export const ENGINE_DEFAULT_LABELS_FA: Record<string, string> = {
  'mirr.rates': 'نرخ سرمایه‌گذاری مجدد و استقراض در MIRR برابر نرخ بازده داخلی',
  'discounting.referenceDate': 'تاریخ مرجع تنزیل: پایان سال اول',
  'loan.firstRepaymentDate': 'تاریخ اولین قسط تسهیلات طبق قاعده COMFAR',
  'assets.residualValuePeriod': 'بازگشت ارزش اسقاط در سال پس از پایان تولید',
  'breakEven.period': 'سال تحلیل نقطه سربه‌سر برابر سال مرجع',
  'cash.autoCoverage': 'پوشش خودکار کسری نقد',
};
