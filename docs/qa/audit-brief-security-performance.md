# Audit brief: security and performance (ST-21.03)

This is the brief for the adversarial security and performance audit, as given by the product owner on 2026-09-26. It is kept verbatim so the audit can be repeated with the same scope. The backlog story is ST-21.03 in [docs/backlog/backlog.yaml](../backlog/backlog.yaml). Findings go to `docs/qa/security-performance-audit-YYYY-MM-DD.md`.

---

You are performing an adversarial, evidence-based SECURITY and PERFORMANCE audit of the Roshd Afarinan platform in this repository (pnpm + turbo monorepo: NestJS 11 API in apps/api, Next.js 16 App Router in apps/web, Prisma 7 + PostgreSQL, packages/types, packages/validation, packages/ui). Read CLAUDE.md, docs/architecture/\*, docs/security/\* (or the security baseline), docs/api/conventions.md and docs/decisions/\* first.

Assume the code is hostile until proven safe. Previous audits found real bugs (rate limiting keyed on the wrong IP, Prisma `contains` not escaping % and \_, 500s from non-UUID ids reaching uuid columns). Do NOT trust comments, docs, test names or ADRs. Verify every claim against the code and, where possible, by running it.

## Rules of engagement (mandatory)

- Target ONLY local instances you start yourself on 127.0.0.1 and the \*\_test database. Never send traffic to any public IP or domain, including the public demo, and never touch the development or production databases.
- Do not modify application code during the audit. Proof-of-concept scripts and tests go in a scratch folder. Report first; fixes come later as separate stories.
- No destructive actions: no dropping or resetting databases, no force pushes, and never print secrets from .env.
- Every finding needs: ID, title, severity (Critical/High/Medium/Low/Info, CVSS 3.1 vector for security), affected file:line, a concrete exploit or reproduction (request/response or script), impact, root cause, a recommended fix, and a regression test proposal. No evidence → mark it "Unverified hypothesis", never a finding.
- Also state explicitly what you checked and found SAFE, so coverage is auditable.

## Part A — Security (OWASP ASVS 4.0 Level 2 as the bar; Level 3 for auth, session, files and payments)

1. Authentication & sessions: argon2id parameters, timing-safe comparison, user enumeration (login, register, forgot password: responses AND timing), refresh token rotation and reuse detection race conditions (send parallel refresh requests), revocation after password change, reset or suspension (`sessionsRevokedAt` granularity, clock skew), JWT algorithm confusion, `kid`/`alg:none`, secret strength checks, token lifetime, cookie flags (Secure, HttpOnly, SameSite, Path, \_\_Host- prefix), logout completeness, password reset token entropy, single use, expiry, and whether the token leaks via Referer or logs.
2. Authorization (highest priority): build a matrix of EVERY route (enumerate the controllers with grep; do not trust Swagger) × role (anonymous, user, student, expert, instructor, editor, support, finance, admin, super_admin, suspended user). For each cell, test IDOR/BOLA with other users' ids, BFLA, mass assignment (extra fields such as userId, status, ownerId, assigneeId, isDemo, role), privilege escalation via role assignment, and admin vs super_admin rules. Check that @Public() is only where intended and that ownership is checked in services, not only in guards. Add negative tests for any gap.
3. Input handling & injection: every Zod schema (missing .max(), unbounded arrays, regex ReDoS, number coercion, unicode and ZWNJ normalisation bypasses), Prisma raw queries ($queryRaw/$executeRaw), LIKE wildcard escaping, JSON `details` fields, header injection in Content-Disposition, CSV/formula injection in exports, log injection, open redirects (login `next` params, notification links, Markdown links such as `/\evil.com` and `javascript:`), SSRF in any URL field.
4. XSS & frontend: Markdown rendering pipeline (urlTransform, raw HTML, images), dangerouslySetInnerHTML, JSON-LD script injection (`</script>` inside titles), CSP (evaluate 'unsafe-inline'; propose a nonce-based CSP and test that it doesn't break hydration), clickjacking, and the Next.js /api rewrite (can it be abused to reach internal hosts or bypass the CSRF header check?).
5. CSRF & CORS: the X-Requested-With check on every cookie-authenticated mutation including multipart uploads, CORS config, SameSite interplay, and whether any GET has side effects.
6. Files & media: content sniffing bypasses (polyglots such as PNG+HTML and JPEG+JS, SVG disguised under an image extension, double extensions, a huge declared size, zip bombs in DOCX/XLSX), path traversal in storage keys, signed URL forgery, replay and expiry, the public /media route leaking private files, headers (nosniff, CSP sandbox, Content-Disposition), storage exhaustion (upload quotas, orphaned files).
7. Rate limiting & abuse: IP spoofing through X-Forwarded-For with TRUST_PROXY on and off, per-account lockout, enumeration via rate-limit differences, expensive endpoints (search, export, stats) as DoS vectors, body size limits, multer limits, slowloris via long requests.
8. Business logic: orders and payments (amount tampering, replayed callbacks, marking an order paid via the return URL alone, state machine violations, concurrent pay/cancel, mock gateway reachable in production), service request status transitions, ticket internal notes leaking to owners, notifications leaking data across users, audit log completeness and tamper resistance, and isDemo data leaking into production behaviour.
9. Secrets, config & supply chain: run `pnpm audit --prod` and review overrides, check .env.example against actual config validation, confirm the app refuses to start with weak or default secrets in production, Docker images (non-root, no secrets in layers, pinned base images), compose defaults (COOKIE_SECURE and others), GitHub Actions permissions and pinning, Swagger exposure in production, verbose errors and stack traces.
10. Privacy: personal data in logs (mobile numbers, emails, tokens), redaction, retention, what an admin can export, and data minimisation in API responses (e.g. passwordHash or storageKey anywhere in a select).

## Part B — Performance and scalability

1. Measure, don't guess. Build production bundles (`turbo run build`) and start API + web locally against a seeded test database with realistic volume. Write a seed script in the scratch folder: ≥50k service requests, ≥20k tickets with messages, ≥100k notifications, ≥5k users, ≥2k CMS entries, ≥10k files.
2. Database: enable Prisma query logging. For every list, search, stats and export endpoint, capture the SQL, run EXPLAIN (ANALYZE, BUFFERS) and flag sequential scans, missing or unused indexes, N+1 patterns, COUNT(\*) on large tables, OFFSET pagination at deep pages, and transactions held across network calls. Check the connection pool size vs. concurrency.
3. API load: use autocannon or k6 (local only) on the hot paths: public content lists and details, search, login, refresh, the notifications unread count (polled every minute per user), dashboard stats, file and media download. Report p50/p95/p99 latency, throughput, error rate, memory and CPU at 10/50/200 concurrent users, and find the breaking point. Look for event loop blocking (argon2, CSV generation, large JSON), memory leaks (heap snapshots before and after load) and unbounded in-memory caches.
4. Frontend: run Lighthouse (mobile and desktop) on the home page, list pages, detail pages, search and the dashboard. Report LCP, INP, CLS, TBT and JS bundle size per route (next build output + bundle analyzer). Flag client components that could be server components, missing caching or ISR on public pages, images without dimensions or modern formats, font loading (Persian fonts: subsetting, font-display), waterfalls in server components, and duplicated fetches.
5. Caching & delivery: HTTP caching headers for public pages, the /media route and static assets; compression; whether public API responses can be cached safely (no user data); ISR revalidation strategy.
6. Resilience: behaviour when PostgreSQL is slow or down, when storage is unavailable, and when the notification provider times out. Check timeouts on every outbound call and graceful shutdown.

## Deliverables

1. docs/qa/security-performance-audit-YYYY-MM-DD.md, written in Persian (code, identifiers and CVSS vectors stay in English): an executive summary, a findings table sorted by severity, a detailed finding for each item, the authorization matrix, performance baselines with the numbers measured, and a "verified safe" section.
2. A proposed backlog section (YAML matching docs/backlog/backlog.yaml format, not yet merged) with one story per Critical/High finding and grouped stories for Medium/Low, each with acceptance criteria including negative tests.
3. A short list of quick wins (≤1 hour each) and of items that need a business decision (reference docs/product/open-questions.md).

Work systematically and do not stop at the first issues found. When you finish, list any areas you could not cover and why.
