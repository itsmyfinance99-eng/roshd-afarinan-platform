# QA Test Matrix

Legend: ✅ automated · 🟡 manual · ⬜ not yet covered

| Area       | Scenario                                                                    | Level                  | Status |
| ---------- | --------------------------------------------------------------------------- | ---------------------- | ------ |
| Foundation | Health live/ready                                                           | API e2e                | ✅     |
| Foundation | Invalid env fails boot                                                      | Unit                   | ✅     |
| Foundation | Error envelope + request ID                                                 | API e2e                | ✅     |
| Auth       | Register / duplicate email 409                                              | API e2e                | ✅     |
| Auth       | Login / wrong password generic 401                                          | API e2e                | ✅     |
| Auth       | Refresh rotation + reuse detection                                          | API e2e                | ✅     |
| Auth       | Private route without token 401                                             | API e2e                | ✅     |
| RBAC       | User cannot change roles 403                                                | API e2e                | ✅     |
| Rate limit | Login throttled 429                                                         | API e2e                | ✅     |
| Auth       | CSRF header required for cookie mutations                                   | API e2e                | ✅     |
| Auth       | Suspended user loses access immediately                                     | API e2e                | ✅     |
| RBAC       | Admin cannot grant admin; super_admin can                                   | API e2e                | ✅     |
| RBAC       | Self role change forbidden                                                  | Unit + e2e             | ✅     |
| Audit      | Login, register, token reuse, role change recorded                          | API e2e                | ✅     |
| Web        | All public routes render RTL                                                | Playwright             | ✅     |
| Web        | Mobile drawer, Esc, focus return                                            | Playwright             | ✅     |
| Web        | Forms: client + server validation, CSRF header, tracking code               | Playwright             | ✅     |
| Web        | Rate-limit / 404 tracking messages                                          | Playwright             | ✅     |
| Web        | No horizontal overflow (desktop + mobile)                                   | Playwright             | ✅     |
| Web        | Submit disabled until hydration (no PII in URL)                             | Playwright             | ✅     |
| Web        | Private routes redirect to login (proxy), safe next path (no open redirect) | Playwright + unit      | ✅     |
| Web        | Login/register errors, session refresh failure → login                      | Playwright             | ✅     |
| Web        | Role-based dashboard menu; staff status change                              | Playwright             | ✅     |
| Auth       | ra_session hint cookie not httpOnly, no secret                              | API e2e                | ✅     |
| CMS        | Drafts/archived are 404 publicly; publish keeps first date; audit           | API e2e                | ✅     |
| CMS        | Unique slug per kind; PATCH never wipes omitted fields                      | Unit + e2e             | ✅     |
| CMS        | Non-editors 401/403 on editorial API                                        | API e2e                | ✅     |
| CMS        | Sitemap excludes noindex and demo content                                   | API e2e                | ✅     |
| Web        | Unknown article returns HTTP 404 (not soft 404)                             | Integration            | ✅     |
| Web        | Markdown renders without raw HTML / unsafe URLs                             | Unit (schema) + manual | 🟡     |
| Web        | Content editor parses tags/references, blocks invalid slug                  | Playwright             | ✅     |

| Requests | Guest submit + tracking code + notification | API e2e | ✅ |
| Requests | Honeypot / type-specific validation | Unit + e2e | ✅ |
| Requests | Owner-only access, stranger gets 404 | API e2e | ✅ |
| Requests | Staff-only status changes, invalid transition 409, audit | API e2e | ✅ |

This matrix is updated at the end of each story.
