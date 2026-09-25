/**
 * Institutional copy (ADR-0005 interim content layer). Sources: company résumé and the
 * Claude Design handoff. Do not add certifications, customers or figures that are not
 * confirmed by the company (OQ-17).
 */
import type {
  FaqItem,
  FutureCapability,
  Journey,
  NavItem,
  ProcessStep,
  ServiceItem,
  Stat,
} from './types';

export const site = {
  name: 'رشدآفرینان صنعت و معدن',
  shortName: 'رشدآفرینان',
  tagline: 'صنعت و معدن',
  description:
    'رشدآفرینان صنعت و معدن؛ پلتفرم تخصصی آموزش، پژوهش، مشاوره، امکان‌سنجی و اتصال به فرصت‌های سرمایه‌گذاری.',
  foundedYear: '۱۳۸۸',
  about:
    'گروهی تخصصی با بیش از ۵۰ کارشناس در حوزه‌های مهندسی، اقتصاد، مدیریت، حقوق، بیمه، مالیات و فناوری اطلاعات که از سال ۱۳۸۸ در آموزش، پژوهش و مشاوره فعالیت می‌کند.',
} as const;

/** All primary routes. `main` items appear in the desktop header bar; the rest in the utility bar. */
export const navigation: NavItem[] = [
  { key: 'home', label: 'صفحه اصلی', href: '/' },
  { key: 'training', label: 'آموزش', href: '/training' },
  { key: 'feasibility', label: 'امکان‌سنجی', href: '/feasibility' },
  { key: 'research', label: 'پژوهش', href: '/research' },
  { key: 'consulting', label: 'مشاوره', href: '/consulting' },
  { key: 'investment', label: 'فرصت‌های سرمایه‌گذاری', href: '/investment' },
  { key: 'sahamdar', label: 'ایران سهامدار', href: '/iran-sahamdar' },
  { key: 'knowledge', label: 'دانشنامه', href: '/knowledge' },
  { key: 'articles', label: 'مقالات', href: '/articles' },
  { key: 'about', label: 'درباره ما', href: '/about' },
  { key: 'contact', label: 'تماس با ما', href: '/contact' },
];

export const MAIN_NAV_KEYS = [
  'training',
  'feasibility',
  'research',
  'consulting',
  'investment',
  'sahamdar',
];
export const UTILITY_NAV_KEYS = ['home', 'knowledge', 'articles', 'about', 'contact'];

export const hero = {
  eyebrow: site.name,
  title: 'از ایده تا امکان‌سنجی، پژوهش و مسیر سرمایه‌گذاری',
  lead: site.description,
  primaryCta: { label: 'درخواست امکان‌سنجی', href: '/feasibility/request' },
  secondaryCta: { label: 'مشاهده فرصت‌های سرمایه‌گذاری', href: '/investment' },
  pathTitle: 'مسیر حرفه‌ای در پلتفرم',
};

/** The value chain; steps 4 and 8 (امکان‌سنجی, ایران سهامدار) are emphasised in the design. */
export const pathSteps = [
  'آموزش',
  'دانش',
  'پژوهش',
  'امکان‌سنجی',
  'پروژه',
  'تأمین مالی',
  'سرمایه‌گذاری',
  'ایران سهامدار',
];
export const EMPHASISED_PATH_STEPS = [3, 7];

export const journeys: Journey[] = [
  {
    key: 'training',
    title: 'آموزش',
    description: 'آموزش تخصصی سرمایه‌گذاری، اقتصاد، امکان‌سنجی و تأمین مالی',
    href: '/training',
  },
  {
    key: 'feasibility',
    title: 'امکان‌سنجی',
    description: 'از ایده اولیه تا مطالعات امکان‌سنجی و طرح توجیهی',
    href: '/feasibility',
  },
  {
    key: 'research',
    title: 'پژوهش',
    description: 'مطالعات اقتصادی، صنعتی، مالی و توسعه‌ای',
    href: '/research',
  },
  {
    key: 'sahamdar',
    title: 'ایران سهامدار',
    description: 'معرفی پروژه‌ها و ارتباط با زیرساخت سرمایه‌گذاری',
    href: '/iran-sahamdar',
  },
];

export const stats: Stat[] = [
  {
    value: '+۵۰',
    label: 'کارشناس',
    detail: 'در حوزه‌های مهندسی، اقتصاد، مدیریت، حقوق، بیمه، مالیات و فناوری اطلاعات',
  },
  { value: '۳', label: 'حوزه اصلی فعالیت', detail: 'آموزش، پژوهش و مشاوره' },
  { value: '۱۳۸۸', label: 'آغاز فعالیت', detail: 'سابقه فعالیت حرفه‌ای از سال ۱۳۸۸' },
];

export const expertise = ['مهندسی', 'اقتصاد', 'مدیریت', 'حقوق', 'بیمه', 'مالیات', 'فناوری اطلاعات'];

export const activityAreas = ['آموزش', 'پژوهش', 'مشاوره'];

/**
 * Sectors of the company's past feasibility/consulting work (résumé). Listed as sectors only;
 * no client names or outcomes are stated.
 */
export const pastWorkSectors = [
  'کاشی',
  'فولاد',
  'بتن',
  'سنگ مصنوعی',
  'پرورش میگو',
  'حمل‌ونقل ریلی',
  'معدن',
  'مجتمع‌های تفریحی و اقامتی',
  'هتل',
  'گلخانه',
  'تجهیزات آزمایشگاهی',
  'واحدهای صنعتی',
];

/**
 * Licences and memberships named in the résumé. Numbers/dates and logos are shown only
 * after the company supplies verified documents (OQ-17).
 */
export const credentials = [
  'مجوز واحد فنی-مهندسی از اداره کل صنعت، معدن و تجارت استان یزد',
  'عضویت در انجمن خدمات فنی و مهندسی استان یزد',
  'مجوز فعالیت از سازمان فنی و حرفه‌ای',
  'عضویت در کانون مشاوران اعتباری و سرمایه‌گذاری بانکی',
  'عضویت در انجمن IT استان یزد',
];

export const consultingServices: ServiceItem[] = [
  {
    key: 'investment',
    title: 'مشاوره سرمایه‌گذاری',
    description: 'بررسی گزینه‌های سرمایه‌گذاری و همراهی در تصمیم‌گیری بر پایه مطالعات کارشناسی.',
  },
  {
    key: 'financing',
    title: 'مشاوره تأمین مالی',
    description: 'شناخت روش‌های تأمین مالی متناسب با مرحله و ساختار پروژه.',
  },
  {
    key: 'economic',
    title: 'مشاوره اقتصادی',
    description: 'تحلیل‌های اقتصادی برای سازمان‌ها، طرح‌ها و سیاست‌گذاری.',
  },
  {
    key: 'feasibility',
    title: 'مشاوره امکان‌سنجی',
    description: 'ارزیابی فنی، بازار و مالی ایده پیش از ورود به اجرا.',
  },
  {
    key: 'industrial',
    title: 'مشاوره سرمایه‌گذاری صنعتی',
    description: 'همراهی در طرح‌های صنعتی و معدنی از مطالعه تا ساختاردهی.',
  },
  {
    key: 'project',
    title: 'مشاوره پروژه',
    description: 'پشتیبانی کارشناسی در برنامه‌ریزی و کنترل مراحل پروژه.',
  },
];

export const processSteps: ProcessStep[] = [
  { title: 'ثبت درخواست', description: 'ثبت اطلاعات اولیه ایده یا پروژه' },
  { title: 'بررسی اولیه', description: 'ارزیابی درخواست و تعیین دامنه خدمت' },
  { title: 'اجرای خدمت', description: 'انجام مطالعه یا مشاوره توسط تیم متخصص' },
  { title: 'کنترل کارشناس', description: 'بازبینی کیفیت و صحت خروجی‌ها' },
  { title: 'تحویل', description: 'تحویل گزارش و جلسه جمع‌بندی' },
];

export const futureCapabilities: FutureCapability[] = [
  {
    title: 'دستیار هوشمند (AI Assistant)',
    description: 'پاسخ‌گویی و راهنمایی در مسیر آموزش و امکان‌سنجی',
  },
  { title: 'تحلیل هوشمند اسناد', description: 'استخراج نکات کلیدی از گزارش‌ها و مدارک' },
  { title: 'محاسبات مالی', description: 'ابزارهای محاسبه شاخص‌های ارزیابی طرح' },
  { title: 'داشبورد سرمایه‌گذاری', description: 'پیگیری وضعیت پروژه‌ها و درخواست‌ها' },
  {
    title: 'توکنایز کردن دارایی‌های واقعی',
    description: 'بازنمایی دیجیتال دارایی‌های واقعی در آینده',
  },
];

export const faq: FaqItem[] = [
  {
    question: 'امکان‌سنجی چه مدت زمان می‌برد؟',
    answer: 'مدت زمان به دامنه و پیچیدگی طرح بستگی دارد و پس از بررسی اولیه اعلام می‌شود.',
  },
  {
    question: 'برای ثبت درخواست چه اطلاعاتی لازم است؟',
    answer: 'شرح کوتاه ایده، حوزه فعالیت، محل اجرا و مرحله فعلی طرح کافی است.',
  },
  {
    question: 'آیا فرصت‌های نمایش‌داده‌شده واقعی هستند؟',
    answer: 'خیر. در نسخه فعلی، همه پروژه‌ها و فرصت‌ها نمونه نمایشی هستند.',
  },
  {
    question: 'ارتباط با ایران سهامدار چگونه است؟',
    answer: 'جزئیات اتصال در مراحل بعدی توسعه مشخص می‌شود و در نسخه فعلی فعال نیست.',
  },
];

/** Contact details are placeholders until the company confirms them (OQ-18). */
export const contact = {
  confirmed: false,
  address: 'نشانی دفتر مرکزی (به‌زودی)',
  phone: 'تلفن تماس (به‌زودی)',
  email: 'ایمیل (به‌زودی)',
  hours: 'ساعات کاری (به‌زودی)',
  social: [] as { label: string; href: string }[],
};
