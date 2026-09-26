# Phase 1 QA report

Date: 2026-09-26 (updated after EPIC-25) · Scope: Phase 0 (foundation), Phase 1 (MVP) and Operational Readiness, sprints S0–S9 · Branch: `develop`

## Result

All Phase 1 stories in the backlog (sprints S0–S8) and all EPIC-25 Operational Readiness stories (S9, #159–#170) are implemented and merged through reviewed pull requests with green CI. Still open: the release itself (ST-21.02) and the adversarial security and performance audit (ST-21.03). The test matrix is in [test-matrix.md](test-matrix.md).

| Suite                                        | Tests                            | Result |
| -------------------------------------------- | -------------------------------- | ------ |
| Unit: `@roshd/api`                           | 91 (23 files)                    | ✅     |
| Unit: `@roshd/validation`                    | 36 (7 files)                     | ✅     |
| Unit: `@roshd/ui`                            | 13                               | ✅     |
| Unit: `@roshd/web`                           | 13                               | ✅     |
| Unit: `@roshd/types`                         | 10                               | ✅     |
| API e2e (real PostgreSQL `_test` DB)         | 130 (24 files)                   | ✅     |
| Web e2e (Playwright, desktop + mobile)       | 346, including 104 axe audits    | ✅     |
| Accessibility (axe, WCAG 2.1 A/AA)           | 0 serious or critical violations | ✅     |
| `pnpm audit`                                 | no known vulnerabilities         | ✅     |
| Docker images (api, migrate, web)            | build + container smoke test     | ✅     |
| `pnpm verify` (lint, typecheck, test, build) | all tasks                        | ✅     |

## Operational readiness (EPIC-25)

| Story    | Delivered                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| ST-25.01 | Rate limits and audit IPs per real visitor behind nginx (`TRUST_PROXY`); SSR reads exempt via internal token |
| ST-25.02 | Password change, recovery by email and sign out everywhere, with immediate revocation                        |
| ST-25.03 | Database and file backups with checksums, retention and a verified restore procedure                         |
| ST-25.04 | Account suspension and reactivation with immediate sign-out                                                  |
| ST-25.05 | In-app notification center and event notifications (email through the notification port)                     |
| ST-25.06 | Assigning requests and tickets to staff, "assigned to me" queues                                             |
| ST-25.07 | Public image library for content and catalog covers (raster only, same-origin)                               |
| ST-25.08 | ErrorReporter port, crash reporting, scrubbed logs, log rotation and a monitoring runbook                    |
| ST-25.09 | Automated axe audit of public and dashboard pages; contrast, label and title fixes                           |
| ST-25.10 | Per-account lockout, common-password rejection, literal search, safe Markdown URLs, secure compose defaults  |
| ST-25.11 | Email verification with one-time links and rate-limited resend                                               |

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
| 3   | Medium   | No automated accessibility audit (axe). Semantics, labels and keyboard paths are tested functionally only                               | Resolved: axe audit in Playwright (ST-25.09)            |
| 4   | Medium   | SMS/email providers not chosen; notifications and verification/reset emails are logged only (OQ-08)                                     | Adapter once the provider is chosen                     |
| 5   | Low      | Date filters (request export, audit) use the browser's Gregorian date picker                                                            | Jalali date picker component                            |
| 6   | Low      | Search is `ILIKE` without stemming or typo tolerance                                                                                    | Sufficient for current volume; OpenSearch adapter later |
| 7   | Low      | Home, About and Iran Sahamdar are refreshed every 5 minutes (ISR), so CMS edits appear with that delay                                  | On-demand revalidation from the API                     |
| 8   | Low      | Payment callback accepts GET only; some PSPs post back with POST                                                                        | With the real PSP adapter (ST-07.03)                    |
| 9   | Low      | Refund policy undefined; duplicate verified payments are flagged (`payment.duplicate`) for manual follow-up (OQ-23)                     | Business decision                                       |
| 10  | Low      | API runtime image is about 750 MB, and the migrate image contains the full workspace                                                    | Prune dependencies, dedicated migrate bundle            |
| 11  | Low      | Only same-origin cover images render (CSP `img-src 'self'`)                                                                             | Resolved: media library served same-origin (ST-25.07)   |
| 12  | Info     | Real courses, research, opportunities and credentials are pending (OQ-17, OQ-22); the site shows labelled demo data only in development | Content entry through the new admin forms               |

| 13 | Medium | The adversarial security and performance audit (ST-21.03) has not run yet; this report reflects the automated suites only | ST-21.03 before production use |
| 14 | Low | CSP keeps `script-src 'unsafe-inline'` (Next.js hydration); a nonce-based CSP would disable static rendering and ISR | Decision recorded in the security baseline |
| 15 | Low | Login lockout can be triggered by anyone who knows an email (15-minute lock; the reset link lifts it) | Accepted trade-off (ADR-0002 addendum) |
| 16 | Low | Email verification is recorded but gates nothing yet | Decide with OQ-08 |
| 17 | Info | Log retention period, uptime service and alert recipient are undecided; compose rotates logs (5 × 20 MB per service) | OQ-24 |

No open issue is rated High or Critical by the automated suites; ST-21.03 may change that.

## Manual checks performed

- Local run of the Docker images: migrations and the reference seed applied to a fresh database, API readiness (database and storage up), web pages served by a non-root user, and a real 404 for unknown routes.
- Error reporting: a throwing page in a local production build wrote one scrubbed JSON error line with the digest shown on the error page.
- `/mock-gateway` returns 404 in a production build without `ENABLE_MOCK_GATEWAY`.
- The search wildcard test was mutation-checked: with escaping disabled it fails.

Everything else listed above is covered by the automated suites. That includes the payment flow (cancel, tamper, success, replay in API e2e; the redirect to the mock gateway page in Playwright) and Persian text handling (ZWNJ equivalence in search, Persian digits in prices, dates and codes).
