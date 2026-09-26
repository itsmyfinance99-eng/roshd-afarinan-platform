# QA Test Matrix

Legend: ✅ automated · 🟡 manual · ⬜ not yet covered

Automated suites: unit (Vitest), API e2e (Vitest + Supertest against a real PostgreSQL `_test` database) and web e2e (Playwright, desktop + mobile, with a fixture API for server components). CI runs all three on every pull request, plus the Docker image builds.

## Foundation

| Scenario                    | Level   | Status |
| --------------------------- | ------- | ------ |
| Health live/ready           | API e2e | ✅     |
| Invalid env fails boot      | Unit    | ✅     |
| Error envelope + request ID | API e2e | ✅     |

## Auth

| Scenario                                       | Level   | Status |
| ---------------------------------------------- | ------- | ------ |
| Register / duplicate email 409                 | API e2e | ✅     |
| Login / wrong password generic 401             | API e2e | ✅     |
| Refresh rotation + reuse detection             | API e2e | ✅     |
| Private route without token 401                | API e2e | ✅     |
| CSRF header required for cookie mutations      | API e2e | ✅     |
| Suspended user loses access immediately        | API e2e | ✅     |
| ra_session hint cookie not httpOnly, no secret | API e2e | ✅     |

## RBAC

| Scenario                                                                                                      | Level          | Status |
| ------------------------------------------------------------------------------------------------------------- | -------------- | ------ |
| User cannot change roles 403                                                                                  | API e2e        | ✅     |
| Admin cannot grant admin; super_admin can                                                                     | API e2e        | ✅     |
| Self role change forbidden                                                                                    | Unit + e2e     | ✅     |
| Suspension: immediate sign-out, login refused, old sessions stay dead after reactivation, audited with reason | API e2e        | ✅     |
| Suspension policy: no self, admin accounts need super_admin; 401/403 without users:manage-roles               | Unit + API e2e | ✅     |
| Web: suspend with reason and reactivate; control hidden for own/admin accounts                                | Playwright     | ✅     |

## Rate limit

| Scenario                                                                                                                         | Level      | Status |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| Login throttled 429                                                                                                              | API e2e    | ✅     |
| Per-visitor buckets behind a proxy; forged X-Forwarded-For ignored; SSR reads exempt by token, mutations never; real IP in audit | API e2e    | ✅     |
| Password reset: same answer for unknown email, single-use hashed token, expiry, superseded links, all sessions end               | API e2e    | ✅     |
| Password change keeps this device, ends others immediately; sign out everywhere; 401 anonymous                                   | API e2e    | ✅     |
| Web: forgot/reset/change password flows, mismatch and expired-link states, sign out everywhere                                   | Playwright | ✅     |

## Audit

| Scenario                                           | Level   | Status |
| -------------------------------------------------- | ------- | ------ |
| Login, register, token reuse, role change recorded | API e2e | ✅     |

## Requests

| Scenario                                                 | Level      | Status |
| -------------------------------------------------------- | ---------- | ------ |
| Guest submit + tracking code + notification              | API e2e    | ✅     |
| Honeypot / type-specific validation                      | Unit + e2e | ✅     |
| Owner-only access, stranger gets 404                     | API e2e    | ✅     |
| Staff-only status changes, invalid transition 409, audit | API e2e    | ✅     |

## Files

| Scenario                                                                        | Level          | Status |
| ------------------------------------------------------------------------------- | -------------- | ------ |
| Content sniffing: disguised exe / HTML / wrong extension → 415                  | Unit + API e2e | ✅     |
| Oversized → 413, empty → 400, unauthenticated → 401                             | API e2e        | ✅     |
| Signed URL: valid → bytes, tampered/expired → 403; attachment + nosniff headers | Unit + API e2e | ✅     |
| Stranger 404; staff read via linked request; attached file not deletable (409)  | API e2e        | ✅     |
| Guest cannot attach; foreign / wrong-purpose / reused attachments → 400         | API e2e        | ✅     |

## Tickets

| Scenario                                                                                  | Level          | Status |
| ----------------------------------------------------------------------------------------- | -------------- | ------ |
| Conversation: owner → OPEN, staff reply → ANSWERED, internal note keeps status            | Unit + API e2e | ✅     |
| Internal notes and staff names hidden from owner; requester shown to staff                | API e2e        | ✅     |
| Stranger 404; owner cannot write internal notes or set staff statuses (403); closed → 409 | API e2e        | ✅     |
| Only own service requests can be linked; attachments readable by support                  | API e2e        | ✅     |

## CMS

| Scenario                                                                            | Level      | Status |
| ----------------------------------------------------------------------------------- | ---------- | ------ |
| Drafts/archived are 404 publicly; publish keeps first date; audit                   | API e2e    | ✅     |
| Unique slug per kind; PATCH never wipes omitted fields                              | Unit + e2e | ✅     |
| Non-editors 401/403 on editorial API                                                | API e2e    | ✅     |
| Sitemap excludes noindex and demo content                                           | API e2e    | ✅     |
| Typed page sections; unknown/malformed sections 400; drafts visible to editors only | API e2e    | ✅     |
| Page editing 401/403 without `cms:write`; publishing needs `cms:publish`            | API e2e    | ✅     |

## Learning

| Scenario                                                                               | Level          | Status |
| -------------------------------------------------------------------------------------- | -------------- | ------ |
| Drafts/archived courses 404 publicly; price leaves the API as a digit string           | API e2e        | ✅     |
| Pricing invariant (free ⇒ no price, paid ≠ 0) on create and partial update             | Unit + API e2e | ✅     |
| Only COURSE categories / existing instructors; duplicate slug 409                      | API e2e        | ✅     |
| Catalog management 401/403 without `catalog:manage`; sitemap excludes noindex and demo | API e2e        | ✅     |

## Research

| Scenario                                                                               | Level          | Status |
| -------------------------------------------------------------------------------------- | -------------- | ------ |
| Drafts/archived 404 publicly; category/search filters; Solar Hijri year; reserved slug | Unit + API e2e | ✅     |
| Management 401/403 without `catalog:manage`; sitemap excludes noindex and demo         | API e2e        | ✅     |

## Investment

| Scenario                                                                                  | Level          | Status |
| ----------------------------------------------------------------------------------------- | -------------- | ------ |
| Drafts/archived 404; sector/stage/province filters; amount as digit string, never 0       | Unit + API e2e | ✅     |
| Management 401/403 (investor, support); interest stored as INVESTMENT request + reference | API e2e        | ✅     |

## Search

| Scenario                                                                                | Level          | Status |
| --------------------------------------------------------------------------------------- | -------------- | ------ |
| Only published records; typed hits; all words required; space/ZWNJ equivalence; ranking | Unit + API e2e | ✅     |
| Type filter; short/invalid queries 400                                                  | API e2e        | ✅     |

## Orders

| Scenario                                                                              | Level   | Status |
| ------------------------------------------------------------------------------------- | ------- | ------ |
| Server-side pricing (client price ignored); free/unpriced/unpublished courses refused | API e2e | ✅     |
| Stranger 404 on read/pay/cancel; finance reads but cannot act; user 403 on all orders | API e2e | ✅     |

## Payments

| Scenario                                                                                 | Level          | Status |
| ---------------------------------------------------------------------------------------- | -------------- | ------ |
| Paid only after server verify; cancelled/tampered/forged returns fail; replay is a no-op | Unit + API e2e | ✅     |
| Paying or cancelling a paid order 409; payment events audited; paid email sent           | API e2e        | ✅     |

## Admin

| Scenario                                                                                 | Level          | Status |
| ---------------------------------------------------------------------------------------- | -------------- | ------ |
| Request export: BOM, CRLF, labels, formula injection neutralised, mobile keeps leading 0 | Unit + API e2e | ✅     |
| Export filters (type, status, Iran-time day range) shared with the staff list; audited   | Unit + API e2e | ✅     |
| Export 401 anonymous, 403 for user/editor/finance, no audit on denial                    | API e2e        | ✅     |
| User search by name/email/Persian-digit mobile and role filter                           | API e2e        | ✅     |
| Support/editor/finance/expert 403 on user list and role changes; anonymous 401           | API e2e        | ✅     |
| Audit viewer: prefix/actor/entity filters, Iran-time days, actor details, newest first   | API e2e        | ✅     |
| Audit metadata redaction (token, password, hash, …) at any depth                         | Unit + API e2e | ✅     |
| Audit log 401 anonymous; 403 for user/support/editor/finance/expert                      | API e2e        | ✅     |
| Dashboard stats equal live DB counts (requests, open tickets, active users)              | API e2e        | ✅     |
| Each stats section only with its permission; none for users; 401 anonymous               | Unit + API e2e | ✅     |

## Notifications

| Scenario                                                                                            | Level      | Status |
| --------------------------------------------------------------------------------------------------- | ---------- | ------ |
| New request → staff with requests:read-all; status change → owner in-app + email; guest by email    | API e2e    | ✅     |
| Ticket created/replied → support; staff answer → owner (internal notes never); no self-notification | API e2e    | ✅     |
| Unread count, mark read, mark all; other users' notifications 404; anonymous 401                    | API e2e    | ✅     |
| Web: bell count, open marks read and follows dashboard links only, mark all, unread filter          | Playwright | ✅     |

## Infra

| Scenario                                                                                           | Level             | Status |
| -------------------------------------------------------------------------------------------------- | ----------------- | ------ |
| API and web images build in CI (multi-stage, non-root); migrate image applies migrations           | CI + manual smoke | ✅     |
| Backup + restore drill: counts match, non-empty target refused, corrupted dump refused by checksum | Manual drill      | 🟡     |

## Web

| Scenario                                                                                     | Level                  | Status |
| -------------------------------------------------------------------------------------------- | ---------------------- | ------ |
| All public routes render RTL                                                                 | Playwright             | ✅     |
| Mobile drawer, Esc, focus return                                                             | Playwright             | ✅     |
| Forms: client + server validation, CSRF header, tracking code                                | Playwright             | ✅     |
| Rate-limit / 404 tracking messages                                                           | Playwright             | ✅     |
| No horizontal overflow (desktop + mobile)                                                    | Playwright             | ✅     |
| Submit disabled until hydration (no PII in URL)                                              | Playwright             | ✅     |
| Private routes redirect to login (proxy), safe next path (no open redirect)                  | Playwright + unit      | ✅     |
| Login/register errors, session refresh failure → login                                       | Playwright             | ✅     |
| Role-based dashboard menu; staff status change                                               | Playwright             | ✅     |
| Unknown article returns HTTP 404 (not soft 404)                                              | Integration            | ✅     |
| Markdown renders without raw HTML / unsafe URLs                                              | Unit (schema) + manual | 🟡     |
| Content editor parses tags/references, blocks invalid slug                                   | Playwright             | ✅     |
| Upload UI, client-side type check, request attachments                                       | Playwright             | ✅     |
| Dashboard pages have no horizontal overflow on mobile                                        | Playwright             | ✅     |
| Ticket create / closed state / staff internal note                                           | Playwright             | ✅     |
| Training filters as links, Persian prices, Course JSON-LD, enrollment request (TRAINING)     | Playwright             | ✅     |
| Unknown or malformed course slug returns HTTP 404                                            | Playwright             | ✅     |
| Export downloads the file, shows row count/errors, hidden without permission                 | Playwright             | ✅     |
| Role editor: shared policy locks own account, admin roles and `user`; server errors shown    | Playwright             | ✅     |
| User management hidden without `users:read`; read-only without `users:manage-roles`          | Playwright             | ✅     |
| Research listing with category links, Report JSON-LD, order CTA, noindex demo, real 404      | Playwright             | ✅     |
| Investment GET filters without JS, no-offer notice, interest form, noindex demo, real 404    | Playwright             | ✅     |
| Catalog forms (courses, research, investments): typed payload, draft → publish, field errors | Playwright             | ✅     |
| Catalog pages denied and hidden without `catalog:manage`; category add only with `cms:write` | Playwright             | ✅     |
| Audit page labels, filters, reversed-range guard; hidden without `audit:read`                | Playwright             | ✅     |
| Staff stats cards, status breakdown, error + retry; no section or request for users          | Playwright             | ✅     |
| Buy button (sign-in first), order page trusts API status, cancel, mock gateway no redirect   | Playwright             | ✅     |
| Search results with type links, excerpts, demo labels, empty/short/unavailable states        | Playwright             | ✅     |
| About falls back to content layer; page editor prefill, reorder, validation, publish         | Playwright             | ✅     |

This matrix is updated at the end of each story. Phase summaries: [phase-1-qa-report.md](phase-1-qa-report.md).
