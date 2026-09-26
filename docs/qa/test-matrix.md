# QA Test Matrix

Legend: ✅ automated · 🟡 manual · ⬜ not yet covered

| Area       | Scenario                                                                                  | Level                  | Status |
| ---------- | ----------------------------------------------------------------------------------------- | ---------------------- | ------ |
| Foundation | Health live/ready                                                                         | API e2e                | ✅     |
| Foundation | Invalid env fails boot                                                                    | Unit                   | ✅     |
| Foundation | Error envelope + request ID                                                               | API e2e                | ✅     |
| Auth       | Register / duplicate email 409                                                            | API e2e                | ✅     |
| Auth       | Login / wrong password generic 401                                                        | API e2e                | ✅     |
| Auth       | Refresh rotation + reuse detection                                                        | API e2e                | ✅     |
| Auth       | Private route without token 401                                                           | API e2e                | ✅     |
| RBAC       | User cannot change roles 403                                                              | API e2e                | ✅     |
| Rate limit | Login throttled 429                                                                       | API e2e                | ✅     |
| Auth       | CSRF header required for cookie mutations                                                 | API e2e                | ✅     |
| Auth       | Suspended user loses access immediately                                                   | API e2e                | ✅     |
| RBAC       | Admin cannot grant admin; super_admin can                                                 | API e2e                | ✅     |
| RBAC       | Self role change forbidden                                                                | Unit + e2e             | ✅     |
| Audit      | Login, register, token reuse, role change recorded                                        | API e2e                | ✅     |
| Web        | All public routes render RTL                                                              | Playwright             | ✅     |
| Web        | Mobile drawer, Esc, focus return                                                          | Playwright             | ✅     |
| Web        | Forms: client + server validation, CSRF header, tracking code                             | Playwright             | ✅     |
| Web        | Rate-limit / 404 tracking messages                                                        | Playwright             | ✅     |
| Web        | No horizontal overflow (desktop + mobile)                                                 | Playwright             | ✅     |
| Web        | Submit disabled until hydration (no PII in URL)                                           | Playwright             | ✅     |
| Web        | Private routes redirect to login (proxy), safe next path (no open redirect)               | Playwright + unit      | ✅     |
| Web        | Login/register errors, session refresh failure → login                                    | Playwright             | ✅     |
| Web        | Role-based dashboard menu; staff status change                                            | Playwright             | ✅     |
| Auth       | ra_session hint cookie not httpOnly, no secret                                            | API e2e                | ✅     |
| CMS        | Drafts/archived are 404 publicly; publish keeps first date; audit                         | API e2e                | ✅     |
| CMS        | Unique slug per kind; PATCH never wipes omitted fields                                    | Unit + e2e             | ✅     |
| CMS        | Non-editors 401/403 on editorial API                                                      | API e2e                | ✅     |
| CMS        | Sitemap excludes noindex and demo content                                                 | API e2e                | ✅     |
| Web        | Unknown article returns HTTP 404 (not soft 404)                                           | Integration            | ✅     |
| Web        | Markdown renders without raw HTML / unsafe URLs                                           | Unit (schema) + manual | 🟡     |
| Web        | Content editor parses tags/references, blocks invalid slug                                | Playwright             | ✅     |
| Files      | Content sniffing: disguised exe / HTML / wrong extension → 415                            | Unit + API e2e         | ✅     |
| Files      | Oversized → 413, empty → 400, unauthenticated → 401                                       | API e2e                | ✅     |
| Files      | Signed URL: valid → bytes, tampered/expired → 403; attachment + nosniff headers           | Unit + API e2e         | ✅     |
| Files      | Stranger 404; staff read via linked request; attached file not deletable (409)            | API e2e                | ✅     |
| Files      | Guest cannot attach; foreign / wrong-purpose / reused attachments → 400                   | API e2e                | ✅     |
| Web        | Upload UI, client-side type check, request attachments                                    | Playwright             | ✅     |
| Web        | Dashboard pages have no horizontal overflow on mobile                                     | Playwright             | ✅     |
| Tickets    | Conversation: owner → OPEN, staff reply → ANSWERED, internal note keeps status            | Unit + API e2e         | ✅     |
| Tickets    | Internal notes and staff names hidden from owner; requester shown to staff                | API e2e                | ✅     |
| Tickets    | Stranger 404; owner cannot write internal notes or set staff statuses (403); closed → 409 | API e2e                | ✅     |
| Tickets    | Only own service requests can be linked; attachments readable by support                  | API e2e                | ✅     |
| Web        | Ticket create / closed state / staff internal note                                        | Playwright             | ✅     |

| Learning | Drafts/archived courses 404 publicly; price leaves the API as a digit string | API e2e | ✅ |
| Learning | Pricing invariant (free ⇒ no price, paid ≠ 0) on create and partial update | Unit + API e2e | ✅ |
| Learning | Only COURSE categories / existing instructors; duplicate slug 409 | API e2e | ✅ |
| Learning | Catalog management 401/403 without `catalog:manage`; sitemap excludes noindex and demo | API e2e | ✅ |
| Web | Training filters as links, Persian prices, Course JSON-LD, enrollment request (TRAINING) | Playwright | ✅ |
| Web | Unknown or malformed course slug returns HTTP 404 | Playwright | ✅ |
| Admin | Request export: BOM, CRLF, labels, formula injection neutralised, mobile keeps leading 0 | Unit + API e2e | ✅ |
| Admin | Export filters (type, status, Iran-time day range) shared with the staff list; audited | Unit + API e2e | ✅ |
| Admin | Export 401 anonymous, 403 for user/editor/finance, no audit on denial | API e2e | ✅ |
| Web | Export downloads the file, shows row count/errors, hidden without permission | Playwright | ✅ |
| Admin | User search by name/email/Persian-digit mobile and role filter | API e2e | ✅ |
| Admin | Support/editor/finance/expert 403 on user list and role changes; anonymous 401 | API e2e | ✅ |
| Web | Role editor: shared policy locks own account, admin roles and `user`; server errors shown | Playwright | ✅ |
| Web | User management hidden without `users:read`; read-only without `users:manage-roles` | Playwright | ✅ |
| Research | Drafts/archived 404 publicly; category/search filters; Solar Hijri year; reserved slug | Unit + API e2e | ✅ |
| Research | Management 401/403 without `catalog:manage`; sitemap excludes noindex and demo | API e2e | ✅ |
| Web | Research listing with category links, Report JSON-LD, order CTA, noindex demo, real 404 | Playwright | ✅ |
| Requests | Guest submit + tracking code + notification | API e2e | ✅ |
| Requests | Honeypot / type-specific validation | Unit + e2e | ✅ |
| Requests | Owner-only access, stranger gets 404 | API e2e | ✅ |
| Requests | Staff-only status changes, invalid transition 409, audit | API e2e | ✅ |

This matrix is updated at the end of each story.
