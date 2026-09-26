# Phase 1 QA report

Date: 2026-09-26 · Scope: Phase 0 (foundation) and Phase 1 (MVP), sprints S0–S8 · Branch: `develop`

## Result

All Phase 1 stories in the backlog (sprints S0–S8) are implemented and merged through reviewed pull requests with green CI, except the release itself (ST-21.02). The test matrix is in [test-matrix.md](test-matrix.md).

| Suite                                        | Tests                                 | Result |
| -------------------------------------------- | ------------------------------------- | ------ |
| Unit: `@roshd/api`                           | 84 (20 files)                         | ✅     |
| Unit: `@roshd/validation`                    | 32 (7 files)                          | ✅     |
| Unit: `@roshd/ui`                            | 13                                    | ✅     |
| Unit: `@roshd/web`                           | 11                                    | ✅     |
| Unit: `@roshd/types`                         | 4                                     | ✅     |
| API e2e (real PostgreSQL `_test` DB)         | 89                                    | ✅     |
| Web e2e (Playwright, desktop + mobile)       | 198 passed, 2 viewport-specific skips | ✅     |
| Docker images (api, migrate, web)            | build + container smoke test          | ✅     |
| `pnpm verify` (lint, typecheck, test, build) | 20 tasks                              | ✅     |

## Coverage against the engineering rules (CLAUDE.md)

| Rule                                                         | Evidence                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Default deny, `@Public()` only where intended                | Every module's e2e suite has 401 cases for private routes                                              |
| Negative authorization tests for private resources           | Stranger 404 (requests, tickets, files, orders); 403 per missing permission in every admin area        |
| Validation on every request (Zod)                            | Invalid input → 400 cases in each e2e suite; shared schemas are unit-tested                            |
| Money as integers, deterministic financial tests             | Rials as `Decimal`/`bigint`/digit strings; order totals and pricing rules unit-tested                  |
| Payments only after server-side verification, idempotent     | Tampered, forged and cancelled returns fail; replayed callbacks are no-ops; paying twice → 409         |
| Audit of sensitive actions                                   | Auth, roles, content, catalog, files, requests, exports and payments recorded and viewable (admin)     |
| Private files never exposed directly                         | Signed, expiring URLs; content sniffing; tampered or expired signature → 403                           |
| Module boundaries                                            | Cross-module data only through exported services (taxonomy, search sources, stats counters)            |
| Loading / empty / error / success states                     | `AsyncBoundary` in the dashboard; server pages render empty and unavailable states (Playwright)        |
| RTL, responsive, no horizontal overflow                      | Playwright checks every public route and dashboard page on desktop and mobile                          |
| SEO: metadata, canonical, sitemap, JSON-LD, noindex for demo | Public route tests; Course/Report JSON-LD; sitemaps exclude demo and noindex records                   |
| No invented data                                             | Demo records only in the dev seed, labelled «نمونه نمایشی», noindex; unknown prices shown as «استعلام» |

## Known issues and gaps

| #   | Severity | Issue                                                                                                                                   | Plan                                                    |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Medium   | No real payment gateway: production keeps `PAYMENT_PROVIDER=disabled` (OQ-09)                                                           | ST-07.03 once the PSP is chosen                         |
| 2   | Medium   | Official privacy and terms texts are missing, so their links are hidden (OQ-21)                                                         | Publish when the texts are approved                     |
| 3   | Medium   | No automated accessibility audit (axe). Semantics, labels and keyboard paths are tested functionally only                               | Add `@axe-core/playwright` in Phase 2                   |
| 4   | Medium   | SMS/email providers not chosen; notifications are logged only (OQ-08)                                                                   | Adapter once the provider is chosen                     |
| 5   | Low      | Date filters (request export, audit) use the browser's Gregorian date picker                                                            | Jalali date picker component                            |
| 6   | Low      | Search is `ILIKE` without stemming or typo tolerance                                                                                    | Sufficient for current volume; OpenSearch adapter later |
| 7   | Low      | Home, About and Iran Sahamdar are refreshed every 5 minutes (ISR), so CMS edits appear with that delay                                  | On-demand revalidation from the API                     |
| 8   | Low      | Payment callback accepts GET only; some PSPs post back with POST                                                                        | With the real PSP adapter (ST-07.03)                    |
| 9   | Low      | Refund policy undefined; duplicate verified payments are flagged (`payment.duplicate`) for manual follow-up (OQ-23)                     | Business decision                                       |
| 10  | Low      | API runtime image is about 750 MB, and the migrate image contains the full workspace                                                    | Prune dependencies, dedicated migrate bundle            |
| 11  | Low      | Only same-origin cover images render (CSP `img-src 'self'`)                                                                             | By design until a media host is chosen                  |
| 12  | Info     | Real courses, research, opportunities and credentials are pending (OQ-17, OQ-22); the site shows labelled demo data only in development | Content entry through the new admin forms               |

No open issue is rated High or Critical.

## Manual checks performed

- Local run of the Docker images: migrations and the reference seed applied to a fresh database, API readiness (database and storage up), web pages served by a non-root user, and a real 404 for unknown routes.

Everything else listed above is covered by the automated suites. That includes the payment flow (cancel, tamper, success, replay in API e2e; the redirect to the mock gateway page in Playwright) and Persian text handling (ZWNJ equivalence in search, Persian digits in prices, dates and codes).
