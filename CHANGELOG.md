# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Project assumptions (ST-34.01): a shared schema in `@roshd/validation` for the horizon (construction and production phases with their own period lengths), currencies (local, foreign, reporting currency and unit) and assumptions (value or per-period path, unit, source, as-of date) with Persian messages and no defaults; a check that lists, field by field, the assumptions a calculation still needs; personal assumption templates (`/api/v1/assumption-templates`, owner only, audit-logged) and a copy-into-project helper. Migration `assumption_templates`.
- `@roshd/financial-engine` (ST-33.01, ADR-0009 accepted): pure workspace package for the COMFAR-compatible financial engine — `decimal.js` with 34 significant digits, decimal strings at every boundary, half-even rounding for display only, lint rules and tests that keep binary floating point, frameworks and I/O out, `MODEL_VERSION`, and result types that carry warnings and the COMFAR defaults used. The API's `FinancialCalculator` port now re-exports these types.
- Time value of money in the engine (ST-33.02): NPV with COMFAR conventions (month-based factor on a 360-day year, flows at period end, reference date defaulting to the end of the first year and reported as a COMFAR default, salvage value, uneven periods, discount-rate paths), PV/FV, annual↔period rate conversion and the Fisher real/nominal relation; invalid input raises coded errors instead of being guessed. Tested against independently computed reference values.
- IRR and MIRR in the engine (ST-33.03): IRR by a grid scan for sign changes of NPV (−99 % … +1 000 %) and bisection in every bracket, so it cannot diverge; no root, a root outside the range or several roots return no value with a warning listing what was found. MIRR follows COMFAR (surpluses compounded at the reinvestment rate to the horizon end, deficits discounted at the borrowing rate to the reference date); both rates default to the IRR and the default is reported.
- Performance indicators in the engine (ST-33.04): normal and dynamic payback (COMFAR period and date plus an interpolated duration), NPV ratio with profitability index, benefit-cost ratio, break-even for all products (with and without costs of finance, split over products at the planned mix) and per product (constant price and constant volume), long-term debt-service coverage per period with its minimum, LLCR and WACC. Values that cannot be computed are left out with a warning instead of being printed as zero, and every warning and input-error code now has a Persian message. The `FinancialCalculator` port is derived from the implemented functions.
- Depreciation, indexation and exchange rates in the engine (ST-33.06): the four COMFAR depreciation methods (linear to zero, linear to scrap, declining balance switching to linear, sum of years digits) with a partial first year and an exact total, and revaluation with the inflation index; current-price factors with inflation, escalation and the first-year escalator; user index paths; exchange rates entered directly or derived from relative inflation; foreign-currency loans restated in local currency with the exchange gain or loss. Where the COMFAR manual is ambiguous or inconsistent the chosen rule is documented in the spec and tracked as OQ-39.
- Loan schedules in the engine (ST-33.05): annuity, constant principal and profile loans on a 30/360 day calendar with interest by sub-intervals, rate paths, capitalised or paid interest during construction and grace, agency, guarantee, commitment and other fees, COMFAR's default first repayment date (reported as a default), aggregation into project periods and totals over several loans. Annuity and constant-principal loans close at exactly zero; a profile loan not repaid within the horizon is reported.
- Investment and financing schedules (ST-34.02): COMFAR's planning horizon (month of balance, a start-up phase of up to 24 months, a shortened first production year, production in financial years, Solar Hijri or Gregorian start) in the engine and in the project-assumptions schema; fixed investment by COMFAR group and pre-production expenditures per period, each item in its own currency and origin, with depreciation started on a chosen production period (earlier acquisitions jointly, later ones from the next financial year) and charged at balance dates; equity by class and loans per period in local currency, with interest capitalised or paid during construction treated as pre-production interest outside the total investment cost and depreciated with the loan's own conditions.
- Production, revenue, operating costs and working capital (ST-34.03): `operationsSchedule` in the engine builds, per project period and in local currency at current prices, the sales and production programme of every product (finished-goods stock from days of coverage, sales ending early, production intervals), sales revenue by market with sales tax and subsidies, production costs of the products produced and sold (COMFAR categories, standard costs at nominal capacity or per unit, adjustments, fixed costs by `m/12`), allocation of indirect costs by COMFAR's keys or user shares, cost centres in the six standard groups, net working capital item by item (value algorithm, initial stock, foreign/local split) and interest on short-term deposits. Every price follows its own escalation path; coverage, keys and rates have no defaults.
- Financial statements and indicators (ST-34.04): `financialStatements` in the engine builds the net income statement, the cash flow for financial planning, the projected balance sheet (both sides equal in every period), the discounted cash flows of the total capital and of the equity with NPV, IRR, MIRR, payback, NPV ratio and profitability index, break-even of every production period, debt-service coverage and ratios. Income tax on a graduated scale with a tax holiday and losses carried forward (the manual's examples are tests), investment and depreciation allowances, sale of assets with extraordinary income or loss, preferred and ordinary dividends per shareholder. Cash deficits are covered as in COMFAR — equity in construction, an interest-free overdraft in production — but on labelled lines with an under-financing warning, and the user can switch the coverage off. Residual values return in the year after production and break-even uses the reference year unless the user chooses otherwise; every run lists the COMFAR defaults it used. Investment items now follow inflation and their own escalation.
- Scenarios, sensitivity and goal seek (ST-34.05): `projectModel` runs the whole model from the user's inputs in one call; `applyChanges` scales sales, production costs, fixed investment, exchange rates, inflation and discount rates by a percentage (COMFAR's global change of input data); `scenarioAnalysis` compares named sets of changes with the base case; `sensitivityAnalysis` varies one variable at a time over the user's steps and returns the points and tornado bars; `criticalValues` finds the change at which the NPV turns zero; `goalSeek` finds the change that gives a desired NPV or IRR, variable after variable as in COMFAR. Every analysis recalculates the full model, so tax, working capital and financing follow the change.
- Stored financial models and calculation runs (ST-34.06): `/api/v1/financial-models` saves a model as a draft (inputs may be incomplete; every save bumps the version and a stale save is refused), calculates it with the engine and stores each calculation as a run — input snapshot, SHA-256 of its canonical JSON, engine version, results, warnings and the COMFAR defaults used. A run is never changed (a database trigger enforces it); the assigned expert or staff approve it once and a model with an approved run cannot be deleted. Incomplete or invalid inputs come back field by field in Persian. A model is visible to its owner, to the expert assigned to it (`financial-models:work`) and to staff with `financial-models:manage`; for everyone else it is a 404. All changes are audited. `projectInputSchema` in `@roshd/validation` describes the complete calculation input.
- Acceptance test of the engine against a published COMFAR study (ST-36.01, engine side): the sample case of annex I of UNIDO's Manual for the Preparation of Industrial Feasibility Studies runs through `projectModel` and is compared with the printed schedules. Investment, debt service, the income statement, tax, dividends and fixed assets equal the book; NPV of the total capital is 3 864 against 3 856 (0.2 %) and the IRR 18.8 % as printed. The remaining difference is working capital, where the engine follows COMFAR III's rules and the book of 1991 an older convention (docs/qa/engine-acceptance-unido-case.md). The review by the company's financial expert is still open.
- Four-eyes approval of calculation runs (owner decision, OQ-40): the user who calculated a run cannot approve it, whatever their role; enforced in the service (403) and by the database trigger.
- Engine: the dynamic payback has its own warnings (`dynamicPayback.notReached` and so on), so a result no longer shows the same message for the normal and the discounted payback. A consistency test combines every feature the UNIDO case lacks (inflation, exchange rates, declining balance, start-up quarters, cost allocation, sale of assets).
- Editor of the model inputs (ST-34.07): `/dashboard/models` lists the user's financial models (experts also the ones assigned to them, staff all) and creates new ones; the editor has six sections — assumptions, investment, financing, production and sales, costs, working capital — with tables that have one column per period, filled with the keyboard like a spreadsheet (arrow keys, Enter, paste of a copied block). Numbers are typed and shown with Persian digits and thousands separators, rates in percent, and are stored exactly as decimal strings. Every change is saved on its own on top of the loaded version (a conflict stops saving and offers the newer version), and the model is calculated live in the browser by the same engine package in a web worker: indicators of the total capital and the equity, the engine's warnings, the COMFAR conventions used, and a list of what a calculation still needs that leads to the field. A stored model may carry the source and as-of date of its assumptions (`notes`). Persian names of the model's value lists live in `@roshd/validation`.
- Result views of a calculation run (ST-34.08): `/dashboard/models/:id/runs` lists the runs of a model and `/dashboard/models/:id/runs/:runId` shows one — NPV, IRR, MIRR, payback and NPV ratio of the total capital and of the equity with the engine's warnings next to the indicator they are about, break-even and the lowest debt-service coverage, the COMFAR conventions the run used, and the income statement, cash flow for financial planning, balance sheet, discounted cash flows and ratios as tables with Persian digits in a chosen display unit. The cumulative cash flow is drawn as an accessible SVG chart whose figures are in the table next to it. Scenarios (named sets of percentage changes) are compared with the base case side by side, and a one-variable sensitivity analysis gives a tornado chart with its table; both run the engine in a web worker on the run's own input snapshot and are not stored. A run can be approved from its page; the API now tells for every run whether the caller may approve it (`canApprove`) and no longer returns who calculated it.
- Download of a calculation run as xlsx, PDF and HTML (ST-34.09, ADR-0011): `GET /api/v1/financial-models/:id/runs/:runId/export?format=xlsx|pdf|html&unit=…` and three buttons on the page of a run. The file holds the facts of the run, the indicators with their warnings, the COMFAR defaults used, every input as it was entered and every schedule in COMFAR's order — investment costs, working capital, production costs, production and sales programme, sources of finance with each loan, cash flow, discounted cash flows, income statement, balance sheet and ratios — right to left with Persian digits. The new package `@roshd/financial-report` builds one report document from the stored run (nothing is recalculated) and writes all three files from it, so they show the same figures as the page; the HTML is a single file with the font embedded and no script, the xlsx has one sheet per part with real numbers and no formulas, the PDF is laid out for A4 landscape with the font embedded. Names of the user are escaped everywhere. Files are written in a worker thread with a time budget, limited per user and audited; only those who may read the model can download them.
- Golden tests for the engine (ST-33.07): 26 fixed cases (rial-sized sample project, loans, depreciation, indexation) checked against an independent Python implementation with exact arithmetic (values, warnings and COMFAR defaults; CI regenerates the reference and fails on any difference), and a Playwright run that bundles the engine for the browser and requires byte-identical output to Node. Fixtures and control method: `docs/product/engine-golden-tests.md`.

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
