import {
  COURSE_LEVEL_LABELS_FA,
  COURSE_LEVELS,
  createCourseSchema,
  createInvestmentSchema,
  createResearchSchema,
  DELIVERY_MODE_LABELS_FA,
  DELIVERY_MODES,
  INVESTMENT_SECTOR_LABELS_FA,
  INVESTMENT_SECTORS,
  PROJECT_STAGE_LABELS_FA,
  PROJECT_STAGES,
  updateCourseSchema,
  updateInvestmentSchema,
  updateResearchSchema,
  type CategoryScope,
  type z,
} from '@roshd/validation';

type Option = { value: string; label: string };

/** Where a select gets its options: a fixed list, a category scope or the instructors API. */
export type OptionSource = Option[] | { categories: CategoryScope } | 'instructors';

export type FieldDef = {
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  /** Rendered inside the SEO group. */
  seo?: boolean;
} & (
  | { kind: 'text'; ltr?: boolean }
  | { kind: 'textarea'; rows?: number }
  | { kind: 'markdown' }
  | { kind: 'select'; options: OptionSource; emptyLabel?: string }
  /** Whole number or empty (→ null). */
  | { kind: 'int' }
  /** Whole rials as digits or empty (→ null). */
  | { kind: 'money' }
  /** Calendar day in Iran time or empty (→ null); sent as an ISO date-time. */
  | { kind: 'date' }
  | { kind: 'checkbox' }
);

export interface CatalogConfig {
  type: CatalogType;
  title: string;
  singular: string;
  apiBase: string;
  publicBase: string;
  categoryScope?: CategoryScope;
  fields: FieldDef[];
  createSchema: z.ZodType;
  updateSchema: z.ZodType;
}

export const CATALOG_TYPES = ['courses', 'research', 'investments'] as const;
export type CatalogType = (typeof CATALOG_TYPES)[number];

const options = <T extends string>(values: readonly T[], labels: Record<T, string>): Option[] =>
  values.map((v) => ({ value: v, label: labels[v] }));

const SLUG_HINT = 'حروف کوچک انگلیسی، عدد و خط تیره؛ مثلاً feasibility-basics';
const MARKDOWN_HINT =
  'از ## برای تیتر، - برای فهرست و [متن](نشانی) برای پیوند استفاده کنید. HTML نمایش داده نمی‌شود.';

const common = (bodyName: string, bodyLabel: string): FieldDef[] => [
  { name: 'title', label: 'عنوان', kind: 'text', required: true },
  {
    name: 'slug',
    label: 'نامک (آدرس صفحه)',
    kind: 'text',
    ltr: true,
    required: true,
    hint: SLUG_HINT,
  },
  { name: 'summary', label: 'خلاصه', kind: 'textarea', rows: 2, required: true },
  { name: bodyName, label: bodyLabel, kind: 'markdown', required: true, hint: MARKDOWN_HINT },
];

const seo: FieldDef[] = [
  { name: 'metaTitle', label: 'عنوان سئو (حداکثر ۷۰ نویسه)', kind: 'text', seo: true },
  { name: 'metaDescription', label: 'توضیح سئو (حداکثر ۱۷۰ نویسه)', kind: 'text', seo: true },
  {
    name: 'coverImageUrl',
    label: 'نشانی تصویر شاخص (اختیاری)',
    kind: 'text',
    ltr: true,
    seo: true,
    hint: 'مسیر داخل سایت مانند /media/cover.jpg',
  },
  { name: 'noIndex', label: 'در موتورهای جستجو نمایه نشود (noindex)', kind: 'checkbox', seo: true },
];

export const CATALOGS: Record<CatalogType, CatalogConfig> = {
  courses: {
    type: 'courses',
    title: 'دوره‌ها',
    singular: 'دوره',
    apiBase: '/catalog/courses',
    publicBase: '/training',
    categoryScope: 'COURSE',
    fields: [
      ...common('description', 'معرفی و سرفصل‌ها (Markdown)'),
      {
        name: 'categoryId',
        label: 'دسته',
        kind: 'select',
        options: { categories: 'COURSE' },
        emptyLabel: 'بدون دسته',
      },
      {
        name: 'instructorId',
        label: 'مدرس',
        kind: 'select',
        options: 'instructors',
        emptyLabel: 'بدون مدرس',
      },
      {
        name: 'level',
        label: 'سطح',
        kind: 'select',
        required: true,
        options: options(COURSE_LEVELS, COURSE_LEVEL_LABELS_FA),
      },
      {
        name: 'deliveryMode',
        label: 'نحوه برگزاری',
        kind: 'select',
        required: true,
        options: options(DELIVERY_MODES, DELIVERY_MODE_LABELS_FA),
      },
      { name: 'durationHours', label: 'مدت (ساعت)', kind: 'int' },
      { name: 'startsAt', label: 'تاریخ شروع', kind: 'date' },
      { name: 'isFree', label: 'دوره رایگان است', kind: 'checkbox' },
      {
        name: 'priceRials',
        label: 'هزینه (ریال)',
        kind: 'money',
        hint: 'برای دوره پولی بدون قیمت خالی بگذارید تا «قیمت: استعلام» نمایش داده شود.',
      },
      ...seo,
    ],
    createSchema: createCourseSchema,
    updateSchema: updateCourseSchema,
  },
  research: {
    type: 'research',
    title: 'پژوهش‌ها',
    singular: 'پژوهش',
    apiBase: '/catalog/research',
    publicBase: '/research',
    categoryScope: 'RESEARCH',
    fields: [
      ...common('body', 'متن گزارش (Markdown)'),
      {
        name: 'categoryId',
        label: 'حوزه پژوهش',
        kind: 'select',
        options: { categories: 'RESEARCH' },
        emptyLabel: 'بدون دسته',
      },
      { name: 'year', label: 'سال انجام (هجری شمسی)', kind: 'int', hint: 'مثلاً ۱۴۰۳' },
      ...seo,
    ],
    createSchema: createResearchSchema,
    updateSchema: updateResearchSchema,
  },
  investments: {
    type: 'investments',
    title: 'فرصت‌های سرمایه‌گذاری',
    singular: 'طرح',
    apiBase: '/catalog/investments',
    publicBase: '/investment',
    fields: [
      ...common('description', 'معرفی طرح (Markdown)'),
      {
        name: 'sector',
        label: 'حوزه',
        kind: 'select',
        required: true,
        options: options(INVESTMENT_SECTORS, INVESTMENT_SECTOR_LABELS_FA),
      },
      {
        name: 'stage',
        label: 'مرحله',
        kind: 'select',
        required: true,
        options: options(PROJECT_STAGES, PROJECT_STAGE_LABELS_FA),
      },
      { name: 'province', label: 'موقعیت (استان)', kind: 'text' },
      { name: 'serviceNeeded', label: 'خدمت مورد نیاز', kind: 'text' },
      {
        name: 'estimatedInvestmentRials',
        label: 'برآورد سرمایه‌گذاری (ریال)',
        kind: 'money',
        hint: 'فقط از داده تأییدشده طرح؛ در غیر این صورت خالی بگذارید.',
      },
      ...seo,
    ],
    createSchema: createInvestmentSchema,
    updateSchema: updateInvestmentSchema,
  },
};

export function isCatalogType(value: string): value is CatalogType {
  return (CATALOG_TYPES as readonly string[]).includes(value);
}
