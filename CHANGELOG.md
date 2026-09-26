# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - Phase 1 (MVP)

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

### Known limitations

- Production payment is disabled until a PSP is chosen (OQ-09). Legal texts (OQ-21), SMS/email providers (OQ-08) and log retention (OQ-24) are pending. The security and performance audit (ST-21.03) is still to run. See [docs/qa/phase-1-qa-report.md](docs/qa/phase-1-qa-report.md).

## [0.1.0] - Phase 0 (Foundation)

### Added

- Project governance: CLAUDE.md, ADR-0001…0007, architecture, product and security docs, the backlog (EPIC → STORY) with GitHub sync, and issue/PR templates (#1).
- Monorepo tooling (pnpm, Turborepo), shared packages (tsconfig, eslint, types, validation, ui) and CI (#109).
- The Claude Design UI handoff and its integration map (#110).
- NestJS API foundation: configuration, response envelope, errors, logging, health checks and Swagger (#111).
- PostgreSQL + Prisma 7 foundation with identity, RBAC and audit schema (#112).
- Authentication (argon2id, rotating refresh tokens, CSRF), DB-backed RBAC, the audit log and auth rate limiting (#113).
- Provider ports and development adapters (payments, storage, notifications, search, Iran Sahamdar mock, AI and blockchain interfaces) (#114).
- Next.js RTL foundation, the UI package and the home page (#115).
