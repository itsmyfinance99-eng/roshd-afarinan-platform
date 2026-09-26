/**
 * DEVELOPMENT ONLY — demo CMS content and courses from the Claude Design handoff so the site
 * can be reviewed end-to-end. Every record is flagged `isDemo` and labelled «نمونه نمایشی» in
 * the UI. Paid demo courses carry no price (no invented prices). Refuses to run in production.
 * Idempotent (upserts by slug).
 *
 *   pnpm --filter @roshd/api db:seed:demo
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnvFile } from '../src/config/load-env-file';
import { PrismaClient } from '../src/generated/prisma/client';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo content in production.');
  process.exit(1);
}
loadEnvFile(__dirname);

const DEMO_NOTE = '> این محتوا نمونه نمایشی است و پس از تأیید محتوای واقعی جایگزین می‌شود.';

const categories = {
  ARTICLE: [
    ['feasibility', 'امکان‌سنجی'],
    ['financing', 'تأمین مالی'],
    ['training', 'آموزش'],
    ['research', 'پژوهش'],
  ],
  KNOWLEDGE: [
    ['feasibility', 'امکان‌سنجی'],
    ['finance', 'مالی'],
    ['financing', 'تأمین مالی'],
    ['technology', 'فناوری'],
  ],
  COURSE: [
    ['feasibility', 'امکان‌سنجی'],
    ['financing', 'تأمین مالی'],
    ['economics', 'اقتصاد'],
    ['investment', 'سرمایه‌گذاری'],
  ],
  RESEARCH: [
    ['industrial', 'صنعتی'],
    ['financial', 'مالی'],
    ['development', 'توسعه‌ای'],
    ['economic', 'اقتصادی'],
  ],
} as const;

const research: {
  slug: string;
  title: string;
  summary: string;
  category: string;
  publishedAt: string;
}[] = [
  {
    slug: 'demo-steel-value-chain',
    title: 'نمونه: بررسی زنجیره ارزش فولاد',
    summary: 'مطالعه‌ای نمونه درباره حلقه‌های زنجیره ارزش و گلوگاه‌های آن.',
    category: 'industrial',
    publishedAt: '2026-08-03',
  },
  {
    slug: 'demo-mining-finance-models',
    title: 'نمونه: الگوهای تأمین مالی طرح‌های معدنی',
    summary: 'مرور نمونه روش‌های رایج تأمین مالی در طرح‌های معدنی.',
    category: 'financial',
    publishedAt: '2026-07-19',
  },
  {
    slug: 'demo-regional-development-index',
    title: 'نمونه: شاخص‌های توسعه منطقه‌ای',
    summary: 'چارچوبی نمونه برای سنجش آمادگی مناطق برای سرمایه‌گذاری.',
    category: 'development',
    publishedAt: '2026-06-05',
  },
  {
    slug: 'demo-building-materials-market',
    title: 'نمونه: تحلیل بازار مصالح ساختمانی',
    summary: 'بررسی نمونه عرضه و تقاضا در بازار مصالح.',
    category: 'economic',
    publishedAt: '2026-04-29',
  },
];

type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

const courses: {
  slug: string;
  title: string;
  category: string;
  level: Level;
  hours: number;
  isFree: boolean;
  publishedAt: string;
}[] = [
  {
    slug: 'demo-feasibility-basics',
    title: 'مبانی امکان‌سنجی طرح‌های صنعتی',
    category: 'feasibility',
    level: 'BEGINNER',
    hours: 12,
    isFree: false,
    publishedAt: '2026-09-01',
  },
  {
    slug: 'demo-project-financing',
    title: 'آشنایی با روش‌های تأمین مالی پروژه',
    category: 'financing',
    level: 'INTERMEDIATE',
    hours: 8,
    isFree: false,
    publishedAt: '2026-08-25',
  },
  {
    slug: 'demo-economics-for-managers',
    title: 'اقتصاد برای مدیران',
    category: 'economics',
    level: 'BEGINNER',
    hours: 6,
    isFree: true,
    publishedAt: '2026-08-18',
  },
  {
    slug: 'demo-investment-appraisal',
    title: 'ارزیابی مالی طرح‌های سرمایه‌گذاری',
    category: 'investment',
    level: 'ADVANCED',
    hours: 16,
    isFree: false,
    publishedAt: '2026-08-11',
  },
  {
    slug: 'demo-business-plan',
    title: 'تدوین طرح توجیهی',
    category: 'feasibility',
    level: 'INTERMEDIATE',
    hours: 10,
    isFree: false,
    publishedAt: '2026-08-04',
  },
  {
    slug: 'demo-capital-market-intro',
    title: 'آشنایی با بازار سرمایه',
    category: 'investment',
    level: 'BEGINNER',
    hours: 4,
    isFree: true,
    publishedAt: '2026-07-28',
  },
];

const entries: {
  kind: 'ARTICLE' | 'KNOWLEDGE';
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
}[] = [
  {
    kind: 'ARTICLE',
    slug: 'feasibility-reduces-risk',
    title: 'نمونه مقاله: نقش امکان‌سنجی در کاهش ریسک',
    excerpt: 'چرا مطالعه پیش از اجرا اهمیت دارد.',
    category: 'feasibility',
    publishedAt: '2026-09-09',
  },
  {
    kind: 'ARTICLE',
    slug: 'choosing-financing-method',
    title: 'نمونه مقاله: انتخاب روش تأمین مالی',
    excerpt: 'معیارهای انتخاب روش مناسب تأمین مالی.',
    category: 'financing',
    publishedAt: '2026-08-26',
  },
  {
    kind: 'ARTICLE',
    slug: 'investment-training-for-managers',
    title: 'نمونه مقاله: آموزش سرمایه‌گذاری برای مدیران',
    excerpt: 'مفاهیمی که مدیران باید بشناسند.',
    category: 'training',
    publishedAt: '2026-08-18',
  },
  {
    kind: 'ARTICLE',
    slug: 'data-in-industrial-decisions',
    title: 'نمونه مقاله: داده در تصمیم‌گیری صنعتی',
    excerpt: 'استفاده از داده در مطالعات صنعتی.',
    category: 'research',
    publishedAt: '2026-08-01',
  },
  {
    kind: 'KNOWLEDGE',
    slug: 'what-is-feasibility',
    title: 'امکان‌سنجی چیست؟',
    excerpt: 'تعریف، مراحل و خروجی‌های یک مطالعه امکان‌سنجی.',
    category: 'feasibility',
    publishedAt: '2026-08-24',
  },
  {
    kind: 'KNOWLEDGE',
    slug: 'justification-plan',
    title: 'طرح توجیهی',
    excerpt: 'اجزای اصلی طرح توجیهی و تفاوت آن با امکان‌سنجی.',
    category: 'feasibility',
    publishedAt: '2026-08-11',
  },
  {
    kind: 'KNOWLEDGE',
    slug: 'internal-rate-of-return',
    title: 'نرخ بازده داخلی (IRR)',
    excerpt: 'مفهوم و کاربرد نرخ بازده داخلی در ارزیابی طرح‌ها.',
    category: 'finance',
    publishedAt: '2026-07-23',
  },
  {
    kind: 'KNOWLEDGE',
    slug: 'project-finance',
    title: 'تأمین مالی پروژه',
    excerpt: 'آشنایی با ساختار تأمین مالی مبتنی بر پروژه.',
    category: 'financing',
    publishedAt: '2026-07-09',
  },
  {
    kind: 'KNOWLEDGE',
    slug: 'net-present-value',
    title: 'ارزش فعلی خالص (NPV)',
    excerpt: 'روش محاسبه و تفسیر ارزش فعلی خالص.',
    category: 'finance',
    publishedAt: '2026-06-25',
  },
  {
    kind: 'KNOWLEDGE',
    slug: 'asset-tokenization',
    title: 'توکنایز کردن دارایی',
    excerpt: 'مفهوم پایه‌ای بازنمایی دیجیتال دارایی‌های واقعی.',
    category: 'technology',
    publishedAt: '2026-06-12',
  },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const categoryId = new Map<string, string>();
    for (const [scope, list] of Object.entries(categories) as [
      keyof typeof categories,
      readonly (readonly [string, string])[],
    ][]) {
      for (const [slug, name] of list) {
        const c = await prisma.category.upsert({
          where: { scope_slug: { scope, slug } },
          update: { name },
          create: { scope, slug, name },
        });
        categoryId.set(`${scope}:${slug}`, c.id);
      }
    }
    for (const e of entries) {
      const data = {
        title: e.title,
        excerpt: e.excerpt,
        body: `${DEMO_NOTE}\n\n## ${e.title}\n\n${e.excerpt}`,
        status: 'PUBLISHED' as const,
        publishedAt: new Date(`${e.publishedAt}T08:00:00Z`),
        categoryId: categoryId.get(`${e.kind}:${e.category}`),
        isDemo: true,
      };
      await prisma.contentEntry.upsert({
        where: { kind_slug: { kind: e.kind, slug: e.slug } },
        update: data,
        create: { kind: e.kind, slug: e.slug, ...data },
      });
    }
    const instructor =
      (await prisma.instructor.findFirst({ where: { name: 'مدرس نمونه', isDemo: true } })) ??
      (await prisma.instructor.create({ data: { name: 'مدرس نمونه', isDemo: true } }));
    for (const c of courses) {
      const data = {
        title: c.title,
        summary: `دوره نمونه «${c.title}» برای بررسی ساختار کاتالوگ آموزشی.`,
        description: `${DEMO_NOTE}

## درباره دوره

سرفصل‌ها و برنامه این دوره پس از تأیید محتوای واقعی تکمیل می‌شود.`,
        categoryId: categoryId.get(`COURSE:${c.category}`),
        instructorId: instructor.id,
        level: c.level,
        deliveryMode: 'ONLINE' as const,
        durationHours: c.hours,
        isFree: c.isFree,
        priceRials: null,
        status: 'PUBLISHED' as const,
        publishedAt: new Date(`${c.publishedAt}T08:00:00Z`),
        isDemo: true,
      };
      await prisma.course.upsert({
        where: { slug: c.slug },
        update: data,
        create: { slug: c.slug, ...data },
      });
    }
    for (const r of research) {
      const data = {
        title: r.title,
        summary: r.summary,
        body: `${DEMO_NOTE}

## ${r.title}

${r.summary}`,
        categoryId: categoryId.get(`RESEARCH:${r.category}`),
        status: 'PUBLISHED' as const,
        publishedAt: new Date(`${r.publishedAt}T08:00:00Z`),
        isDemo: true,
      };
      await prisma.researchProject.upsert({
        where: { slug: r.slug },
        update: data,
        create: { slug: r.slug, ...data },
      });
    }
    console.warn(
      `Seeded ${entries.length} content entries, ${courses.length} courses and ${research.length} research projects (isDemo=true).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
