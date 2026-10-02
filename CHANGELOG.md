# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-10-02 — UI v2 "Copper & Graphite"

### Changed

- The whole web UI now follows the v2 "Copper & Graphite" Claude Design handoff (#220): dark-first tokens with `data-surface="paper"` reading regions, Noto Kufi Arabic display font (self-hosted), rebuilt public pages and shared components, and the dashboard on a paper surface. The raw handoff lives in `design/claude-design/`; decisions D1–D20 and the coverage checklist are in `design/INTEGRATION.md`.

### Added

- Zero-dependency motion layer (`apps/web/src/components/motion`): session-once skippable intro, scroll reveals, ticker, sonar grid and reading progress. All motion is off under `prefers-reduced-motion`; Playwright runs with reduced motion and `e2e/motion.spec.ts` covers the animated path.
- `design/prompts/`: the prompt used to produce the v2 handoff, so a later design round can start from it.
- `docs/HANDOFF.md`: current state, next steps and environment notes for whoever picks the project up next (#221).

### Fixed

- QA fixes before merge: ticker layout shift, tablet bento order, bidirectional text isolation, touch-target sizes and pill state before hydration.
- The home hero's background glows no longer shift the layout when a slow device paints the hero before it has fully loaded (mobile CLS stayed above the 0.1 budget on slow CI runners) (#222).

### Maintenance

- CI actions moved to their current major versions, still pinned to commit SHAs (#217, #218).

## [0.2.0] - 2026-09-27 — Phase 1 (MVP + operational readiness)

### Added

- **Service requests**: feasibility, consulting, research, training-enrollment, investment-interest and contact forms, with tracking codes, a staff workflow and status timeline, attachments, and an audited CSV export (UTF-8 BOM, formula-safe) (#117, #133).
- **Public website**: all main pages in RTL with official contact details, SEO metadata, sitemap, robots and JSON-LD (#118, #119).
- **Accounts**: login, register and profile, a user dashboard, and staff request management (#120).
- **CMS**: articles and knowledge base with SEO and an editor (#121); typed institutional page sections with a page editor, and a CMS-driven About page that falls back to the reviewed copy (#142).
- **Files**: private uploads with content sniffing, and signed, expiring downloads (#123).
- **Support tickets**: conversations, internal notes and attachments (#124).
- **Catalogs**: courses (#125), research portfolio (#135) and investment opportunities (presentation only, with interest requests) (#136), with management forms (#137).
- **Admin panel**: user and role management (#134), audit log viewer with redaction (#138), and live staff statistics per permission (#139).
- **Orders and payments**: server-priced orders, payment attempts behind the `PaymentGateway` port, server-side verification, idempotent callbacks, and a development mock gateway (#140).
- **Site search**: a federated PostgreSQL search over published content, with space/ZWNJ-aware matching (#141).
- **Deployment**: multi-stage, non-root Docker images for the API (plus a migrate job) and the web app, a full-stack compose file, and a CI image build (#143).

#### Operational readiness (EPIC-25)

- **Accounts**: password change, recovery by email and sign out everywhere (#160); account suspension and reactivation with immediate sign-out (#162); email verification with one-time links and a rate-limited resend (#170).
- **Notifications**: an in-app notification center, and event notifications for requests, tickets and orders through the notification port (#163).
- **Staff workflow**: assign requests and tickets to staff members, with "assigned to me" and "unassigned" queues (#164).
- **Media library**: public PNG/JPEG/WebP images for article, course, research and investment covers, with upload and a library picker in the editors (#165).
- **Operations**: database and file backups with a verified restore procedure (#161); an ErrorReporter port, crash reporting, scrubbed error logs, Docker log rotation and a monitoring runbook (#166).
- **Accessibility**: an automated axe audit (WCAG 2.1 A/AA) of public and dashboard pages, with contrast, label and page-title fixes (#167).

### Security

- Every new area has negative authorization tests (401/403, and 404 for strangers). Sensitive actions are audited, and secret-like audit metadata is redacted on read.
- Payment success comes only from server-to-server verification. Replays are no-ops, and paying an order twice returns 409.
- Rate limits and audit IPs use the real visitor address behind nginx (#159).
- Per-account login lockout, rejection of common passwords, literal `%`/`_` in search, safer Markdown links, a secure `COOKIE_SECURE` default in compose, `/mock-gateway` hidden in production builds, and dependency overrides that leave `pnpm audit` clean (#169).
- Route ids are validated as UUIDs, so malformed ids return 400 instead of 500 (#165).

#### Security and performance audit (ST-21.03, EPIC-26)

- An evidence-based adversarial audit ran against a local instance and a `*_test` database: an authorization matrix over every route and role, mass-assignment and privilege-escalation probes, session and token handling, injection and ReDoS scans, file-upload abuse, rate limiting, resilience under a failing database, and a performance baseline on seeded volume (50k requests, 200k audit rows) with `EXPLAIN ANALYZE`, autocannon and Lighthouse. The report is [docs/qa/security-performance-audit-2026-09-27.md](docs/qa/security-performance-audit-2026-09-27.md), and every finding it raised is fixed in this release:
- **Search**: the `types` filter is bounded and de-duplicated, so one small request can no longer exhaust the database pool (#188).
- **Sessions**: cross-site mutations are refused, the post-login redirect only accepts same-origin paths, the auth guard resolves a session rather than just a user, and two tabs refreshing at once no longer sign each other out (#189, #192).
- **Configuration**: production refuses weak, placeholder or reused secrets; the database pool, connect and statement timeouts and a request timeout are configurable; database and body errors map to the right status instead of 500 (#190).
- **Uploads**: a per-user ceiling on unattached uploads, with a job that deletes stale ones (#191).
- **Logs**: query strings and personal data are removed from logs and error reports (#190).
- **Performance**: indexes for the staff list sorts and a page-number cap, so a deep page cannot make PostgreSQL walk every skipped row (#192); a font fallback that stops the layout shifting, plus fewer needless requests on the dashboard (#193).
- **Supply chain**: GitHub Actions pinned to commit SHAs and the Node base image pinned by digest; the web image ships with demo mode off; the notification and payment ports carry timeouts (#194).

#### Phase 1 follow-ups (EPIC-27)

- **Finance**: an orders and payments desk for the `finance` role, which had the permission but no page (#204).
- **Files**: a staff file browser with owner, purpose and status filters; staff deletions are audited with the owner and the record the file was attached to (#205).
- **Retention**: a daily job that deletes spent refresh, password-reset and verification tokens, and notifications the user has already read (#206).
- **Publishing**: an editorial change now drops the site's cache immediately instead of waiting for the ISR window (#207).
- **Dates**: a Jalali date picker replaces the browser's Gregorian date input in the export and audit filters (#208).
- **Images**: the API runtime image is about 40% smaller and the migration image about 80% smaller, and CI now runs both instead of only building them (#209).

### Known limitations

- Production payment is disabled until a PSP is chosen (OQ-09). Legal texts (OQ-21), SMS/email providers (OQ-08) and log retention (OQ-24) are pending decisions. Two performance findings were deliberately left as they are, with measurements recorded in the audit report: streaming the CSV export (the 10,000-row cap already bounds it) and CDN-cacheable HTML (the data cache already covers the case). See [docs/qa/phase-1-qa-report.md](docs/qa/phase-1-qa-report.md).

## [0.1.0] - 2026-09-25 — Phase 0 (Foundation)

### Added

- Project governance: CLAUDE.md, ADR-0001…0007, architecture, product and security docs, the backlog (EPIC → STORY) with GitHub sync, and issue/PR templates (#1).
- Monorepo tooling (pnpm, Turborepo), shared packages (tsconfig, eslint, types, validation, ui) and CI (#109).
- The Claude Design UI handoff and its integration map (#110).
- NestJS API foundation: configuration, response envelope, errors, logging, health checks and Swagger (#111).
- PostgreSQL + Prisma 7 foundation with identity, RBAC and audit schema (#112).
- Authentication (argon2id, rotating refresh tokens, CSRF), DB-backed RBAC, the audit log and auth rate limiting (#113).
- Provider ports and development adapters (payments, storage, notifications, search, Iran Sahamdar mock, AI and blockchain interfaces) (#114).
- Next.js RTL foundation, the UI package and the home page (#115).
