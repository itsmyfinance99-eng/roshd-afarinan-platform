/**
 * DEVELOPMENT ONLY — demo CMS content from the Claude Design handoff so the site can be
 * reviewed end-to-end. Every entry is flagged `isDemo` and labelled «نمونه نمایشی» in the UI.
 * Refuses to run in production. Idempotent (upserts by kind + slug).
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
} as const;

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
    console.warn(`Seeded ${entries.length} demo content entries (isDemo=true).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
