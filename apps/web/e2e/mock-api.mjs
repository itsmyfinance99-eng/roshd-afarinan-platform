// Minimal stand-in for the Nest API during Playwright runs. Server components fetch from
// API_INTERNAL_URL (page.route() cannot intercept server-side requests), so the web server under
// test points here. Browser-side calls are still mocked per test with page.route().
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_API_PORT ?? 4100);

const categories = [
  { id: '0199a000-0000-7000-8000-000000000001', slug: 'feasibility', name: 'امکان‌سنجی' },
  { id: '0199a000-0000-7000-8000-000000000002', slug: 'economics', name: 'اقتصاد' },
];

const instructor = {
  id: '0199a000-0000-7000-8000-0000000000a1',
  name: 'مدرس آزمایشی',
  title: 'کارشناس امکان‌سنجی',
  bio: 'سابقه اجرای مطالعات امکان‌سنجی طرح‌های صنعتی.',
};

const course = (overrides) => ({
  coverImageUrl: null,
  deliveryMode: 'ONLINE',
  startsAt: null,
  publishedAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
  isDemo: false,
  instructor,
  description: '## سرفصل‌ها\n\n- مطالعه بازار\n- مطالعه فنی\n- مطالعه مالی',
  metaTitle: null,
  metaDescription: null,
  noIndex: false,
  ...overrides,
});

const courses = [
  course({
    id: '0199a000-0000-7000-8000-0000000000c1',
    slug: 'feasibility-basics',
    title: 'مبانی امکان‌سنجی طرح‌های صنعتی',
    summary: 'آشنایی با مراحل و خروجی‌های مطالعات امکان‌سنجی.',
    category: categories[0],
    level: 'BEGINNER',
    durationHours: 12,
    isFree: false,
    priceRials: '25000000',
  }),
  course({
    id: '0199a000-0000-7000-8000-0000000000c2',
    slug: 'economics-for-managers',
    title: 'اقتصاد برای مدیران',
    summary: 'مفاهیم پایه اقتصاد برای تصمیم‌گیری مدیریتی.',
    category: categories[1],
    level: 'INTERMEDIATE',
    deliveryMode: 'HYBRID',
    durationHours: 6,
    isFree: true,
    priceRials: null,
    isDemo: true,
  }),
];

const researchCategories = [
  { id: '0199a000-0000-7000-8000-000000000011', slug: 'industrial', name: 'صنعتی' },
  { id: '0199a000-0000-7000-8000-000000000012', slug: 'financial', name: 'مالی' },
];

const research = [
  {
    id: '0199a000-0000-7000-8000-0000000000r1',
    slug: 'steel-value-chain',
    title: 'بررسی زنجیره ارزش فولاد استان',
    summary: 'شناسایی حلقه‌های زنجیره ارزش و گلوگاه‌های سرمایه‌گذاری.',
    coverImageUrl: null,
    year: 1403,
    publishedAt: '2026-08-03T08:00:00.000Z',
    updatedAt: '2026-08-03T08:00:00.000Z',
    isDemo: false,
    category: researchCategories[0],
    body: '## یافته‌ها\n\nمتن گزارش',
    metaTitle: null,
    metaDescription: null,
    noIndex: false,
  },
  {
    id: '0199a000-0000-7000-8000-0000000000r2',
    slug: 'mining-finance-models',
    title: 'نمونه: الگوهای تأمین مالی طرح‌های معدنی',
    summary: 'مرور نمونه روش‌های رایج تأمین مالی.',
    coverImageUrl: null,
    year: null,
    publishedAt: '2026-07-19T08:00:00.000Z',
    updatedAt: '2026-07-19T08:00:00.000Z',
    isDemo: true,
    category: researchCategories[1],
    body: 'متن نمونه',
    metaTitle: null,
    metaDescription: null,
    noIndex: false,
  },
];

const summary = ({
  description: _d,
  metaTitle: _t,
  metaDescription: _m,
  noIndex: _n,
  ...rest
}) => ({
  ...rest,
  instructor: { id: rest.instructor.id, name: rest.instructor.name, title: rest.instructor.title },
});

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const ok = (res, data, extra = {}) =>
  send(res, 200, { data, meta: { requestId: 'mock', ...extra } });
const notFound = (res) =>
  send(res, 404, { error: { code: 'NOT_FOUND', message: 'یافت نشد.', requestId: 'mock' } });

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const q = url.searchParams;

  if (req.method !== 'GET') return notFound(res);
  if (path === '/health/live') return ok(res, { status: 'ok' });

  if (path === '/courses') {
    const list = courses
      .filter((c) => !q.get('category') || c.category.slug === q.get('category'))
      .filter((c) => q.get('free') !== 'true' || c.isFree)
      .filter((c) => !q.get('q') || c.title.includes(q.get('q')));
    const page = Number(q.get('page') ?? 1);
    const pageSize = Number(q.get('pageSize') ?? 20);
    return ok(res, list.slice((page - 1) * pageSize, page * pageSize).map(summary), {
      page,
      pageSize,
      total: list.length,
    });
  }
  const courseMatch = /^\/courses\/([^/]+)$/.exec(path);
  if (courseMatch) {
    const found = courses.find((c) => c.slug === decodeURIComponent(courseMatch[1]));
    return found ? ok(res, found) : notFound(res);
  }
  if (path === '/categories') {
    const scope = q.get('scope');
    return ok(
      res,
      scope === 'COURSE' ? categories : scope === 'RESEARCH' ? researchCategories : [],
    );
  }
  if (path === '/research') {
    const list = research
      .filter((r) => !q.get('category') || r.category.slug === q.get('category'))
      .filter((r) => !q.get('q') || r.title.includes(q.get('q')))
      .map(({ body: _b, metaTitle: _t, metaDescription: _m, noIndex: _n, ...rest }) => rest);
    return ok(res, list, { page: 1, pageSize: 12, total: list.length });
  }
  const researchMatch = /^\/research\/([^/]+)$/.exec(path);
  if (researchMatch) {
    const found = research.find((r) => r.slug === decodeURIComponent(researchMatch[1]));
    return found ? ok(res, found) : notFound(res);
  }
  if (path === '/sitemap/research') {
    return ok(
      res,
      research.filter((r) => !r.isDemo).map((r) => ({ slug: r.slug, updatedAt: r.updatedAt })),
    );
  }
  if (path === '/articles' || path === '/knowledge') {
    return ok(res, [], { page: 1, pageSize: 20, total: 0 });
  }
  if (path === '/sitemap/courses') {
    return ok(
      res,
      courses.filter((c) => !c.isDemo).map((c) => ({ slug: c.slug, updatedAt: c.updatedAt })),
    );
  }
  if (path === '/content/sitemap') return ok(res, []);
  return notFound(res);
}).listen(PORT, '127.0.0.1');
