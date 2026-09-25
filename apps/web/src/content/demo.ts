/**
 * DEMO ONLY — sample records from the Claude Design handoff (design/claude-design/project/mock-data.js).
 * They let the UI be reviewed before the CMS/catalog APIs exist. Every record is flagged
 * `isDemo: true` and rendered with a «نمونه نمایشی» label. Replace with API repositories
 * (EPIC-09/16); never present these as real projects, courses or research.
 * Articles, knowledge entries and courses now come from the API (demo copies: `pnpm db:seed:demo`).
 */
import type { DemoEntry, DemoProject, SectorKey } from './types';

export const sectors: { value: 'all' | SectorKey; label: string }[] = [
  { value: 'all', label: 'همه' },
  { value: 'mining', label: 'معدنی' },
  { value: 'industry', label: 'صنعتی' },
  { value: 'energy', label: 'انرژی' },
  { value: 'agri', label: 'کشاورزی و غذایی' },
  { value: 'infra', label: 'خدمات و زیرساخت' },
];

export const demoProjects: DemoProject[] = [
  {
    id: 'p1',
    isDemo: true,
    title: 'طرح نمونه واحد فرآوری سنگ آهن',
    sector: 'mining',
    sectorLabel: 'معدنی',
    location: 'کرمان',
    stage: 'ایده اولیه',
    service: 'مطالعات امکان‌سنجی',
  },
  {
    id: 'p2',
    isDemo: true,
    title: 'طرح نمونه تولید قطعات صنعتی',
    sector: 'industry',
    sectorLabel: 'صنعتی',
    location: 'اصفهان',
    stage: 'طرح توجیهی',
    service: 'مشاوره تأمین مالی',
  },
  {
    id: 'p3',
    isDemo: true,
    title: 'طرح نمونه نیروگاه خورشیدی کوچک',
    sector: 'energy',
    sectorLabel: 'انرژی',
    location: 'یزد',
    stage: 'مطالعه بازار',
    service: 'امکان‌سنجی فنی و مالی',
  },
  {
    id: 'p4',
    isDemo: true,
    title: 'طرح نمونه مجتمع بسته‌بندی محصولات کشاورزی',
    sector: 'agri',
    sectorLabel: 'کشاورزی و غذایی',
    location: 'خراسان رضوی',
    stage: 'ایده اولیه',
    service: 'طرح توجیهی',
  },
  {
    id: 'p5',
    isDemo: true,
    title: 'طرح نمونه توسعه معدن سنگ ساختمانی',
    sector: 'mining',
    sectorLabel: 'معدنی',
    location: 'لرستان',
    stage: 'مطالعه فنی',
    service: 'مشاوره سرمایه‌گذاری صنعتی',
  },
  {
    id: 'p6',
    isDemo: true,
    title: 'طرح نمونه مرکز لجستیک منطقه‌ای',
    sector: 'infra',
    sectorLabel: 'خدمات و زیرساخت',
    location: 'قزوین',
    stage: 'طرح توجیهی',
    service: 'مشاوره پروژه',
  },
];

export const demoResearch: DemoEntry[] = [
  {
    id: 'r1',
    isDemo: true,
    title: 'نمونه: بررسی زنجیره ارزش فولاد',
    summary: 'مطالعه‌ای نمونه درباره حلقه‌های زنجیره ارزش و گلوگاه‌های آن.',
    category: 'صنعتی',
    date: '2026-08-03',
  },
  {
    id: 'r2',
    isDemo: true,
    title: 'نمونه: الگوهای تأمین مالی طرح‌های معدنی',
    summary: 'مرور نمونه روش‌های رایج تأمین مالی در طرح‌های معدنی.',
    category: 'مالی',
    date: '2026-07-19',
  },
  {
    id: 'r3',
    isDemo: true,
    title: 'نمونه: شاخص‌های توسعه منطقه‌ای',
    summary: 'چارچوبی نمونه برای سنجش آمادگی مناطق برای سرمایه‌گذاری.',
    category: 'توسعه‌ای',
    date: '2026-06-05',
  },
  {
    id: 'r4',
    isDemo: true,
    title: 'نمونه: تحلیل بازار مصالح ساختمانی',
    summary: 'بررسی نمونه عرضه و تقاضا در بازار مصالح.',
    category: 'اقتصادی',
    date: '2026-04-29',
  },
];
