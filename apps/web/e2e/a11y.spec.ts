import AxeBuilder from '@axe-core/playwright';
import { PERMISSIONS } from '@roshd/types';
import { expect, type Page, type TestInfo, test } from '@playwright/test';

/**
 * Automated accessibility audit (ST-25.09): WCAG 2.1 A/AA rules from axe-core on every public
 * page and the dashboard. Serious and critical violations fail the build; the rest are
 * attached to the report for manual review.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['serious', 'critical']);

async function audit(page: Page, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ''));
  const minor = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ''));
  if (minor.length) {
    await testInfo.attach('minor-violations', {
      body: JSON.stringify(
        minor.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      ),
      contentType: 'application/json',
    });
  }
  const summary = blocking.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes
      .slice(0, 5)
      .map((n) => ({ target: n.target.join(' '), summary: n.failureSummary })),
  }));
  expect(summary, `axe violations on ${page.url()}`).toEqual([]);
}

const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/services',
  '/consulting',
  '/consulting/request',
  '/training',
  '/training/feasibility-basics',
  '/training/feasibility-basics/enroll',
  '/feasibility',
  '/feasibility/request',
  '/research',
  '/research/steel-value-chain',
  '/research/request',
  '/investment',
  '/investment/iron-ore-processing',
  '/investment/iron-ore-processing/interest',
  '/iran-sahamdar',
  '/knowledge',
  '/articles',
  '/contact',
  '/track',
  '/search?q=امکان‌سنجی',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password?token=abc',
  '/verify-email',
  '/does-not-exist',
];

test.describe('accessibility: public pages', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no serious or critical violations`, async ({ page }, testInfo) => {
      await page.goto(route);
      await expect(page.locator('main').first()).toBeVisible();
      await audit(page, testInfo);
    });
  }
});

// ───────────────────────────── dashboard (all permissions) ─────────────────────────────

const envelope = (data: unknown, total = 1) =>
  JSON.stringify({ data, meta: { requestId: 't', page: 1, pageSize: 20, total } });
const ok = (data: unknown, total = 1) => ({
  status: 200,
  contentType: 'application/json',
  body: envelope(data, total),
});

const staff = { id: 'u2', fullName: 'نرگس کارشناس' };
const request = {
  id: 'r1',
  trackingCode: 'RA-7K3M9QPD',
  type: 'FEASIBILITY',
  status: 'NEW',
  fullName: 'مریم احمدی',
  mobile: '09121234567',
  email: 'maryam@example.com',
  subject: 'طرح فرآوری',
  message: 'طرح فرآوری سنگ آهن',
  details: { sector: 'معدنی' },
  createdAt: '2026-09-20T10:00:00Z',
  updatedAt: '2026-09-21T10:00:00Z',
  assignee: staff,
  attachments: [],
  events: [{ fromStatus: null, toStatus: 'NEW', note: null, createdAt: '2026-09-20T10:00:00Z' }],
};
const ticket = {
  id: 't1',
  code: 'TK-7K3M9Q',
  subject: 'پیگیری درخواست',
  category: 'REQUEST',
  priority: 'NORMAL',
  status: 'OPEN',
  lastMessageAt: '2026-09-25T10:00:00Z',
  createdAt: '2026-09-25T09:00:00Z',
  assignee: null,
  requester: { id: 'u9', fullName: 'مریم احمدی', email: 'maryam@example.com' },
  messages: [
    {
      id: 'm1',
      fromStaff: false,
      internal: false,
      body: 'وضعیت درخواست من چیست؟',
      createdAt: '2026-09-25T09:00:00Z',
      authorName: null,
    },
  ],
  attachments: [],
};

/** Signs in with every permission and answers browser API calls with realistic data. */
async function signInAsAdmin(page: Page) {
  await page.goto('/');
  await page.context().addCookies([{ name: 'ra_session', value: '1', url: page.url() }]);
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    if (path === '/auth/me' || path === '/users/me') {
      return route.fulfill(
        ok({
          id: 'u1',
          email: 'admin@example.com',
          mobile: null,
          fullName: 'مدیر سامانه',
          roles: ['user', 'super_admin'],
          permissions: PERMISSIONS,
          createdAt: '2026-09-01T00:00:00Z',
        }),
      );
    }
    if (path === '/notifications/unread-count') return route.fulfill(ok({ unread: 2 }));
    if (path === '/dashboard/stats') {
      return route.fulfill(
        ok({
          requests: {
            byStatus: { NEW: 12, IN_REVIEW: 3, RESPONDED: 2, CLOSED: 40 },
            total: 57,
            open: 17,
            lastSevenDays: 9,
          },
          tickets: { byStatus: { OPEN: 4, PENDING: 1, ANSWERED: 6, CLOSED: 20 }, open: 5 },
          users: { active: 42, suspended: 1 },
          generatedAt: '2026-09-26T08:00:00Z',
        }),
      );
    }
    if (/^\/service-requests\/r1$/.test(path)) return route.fulfill(ok(request));
    if (/^\/service-requests(\/mine)?$/.test(path)) return route.fulfill(ok([request]));
    if (/\/assignees$/.test(path)) return route.fulfill(ok([staff], 1));
    if (/^\/tickets\/t1$/.test(path)) return route.fulfill(ok(ticket));
    if (/^\/tickets(\/mine)?$/.test(path)) return route.fulfill(ok([ticket]));
    // Everything else: an empty list, so pages show their empty states.
    return route.fulfill(ok([], 0));
  });
}

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/profile',
  '/dashboard/requests',
  '/dashboard/requests/r1',
  '/dashboard/tickets',
  '/dashboard/tickets/new',
  '/dashboard/tickets/t1',
  '/dashboard/files',
  '/dashboard/orders',
  '/dashboard/notifications',
  '/dashboard/manage/requests',
  '/dashboard/manage/requests/r1',
  '/dashboard/manage/tickets',
  '/dashboard/manage/tickets/t1',
  '/dashboard/manage/users',
  '/dashboard/manage/audit',
  '/dashboard/content',
  '/dashboard/content/new',
  '/dashboard/pages',
  '/dashboard/catalog',
  '/dashboard/catalog/courses',
  '/dashboard/catalog/courses/new',
  '/dashboard/catalog/research/new',
  '/dashboard/catalog/investments/new',
];

test.describe('accessibility: dashboard', () => {
  for (const route of DASHBOARD_ROUTES) {
    test(`${route} has no serious or critical violations`, async ({ page }, testInfo) => {
      await signInAsAdmin(page);
      await page.goto(route);
      await expect(page.locator('h1').first()).toBeVisible();
      // Let client data load so loaded content is audited, not only skeletons.
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await audit(page, testInfo);
    });
  }
});
