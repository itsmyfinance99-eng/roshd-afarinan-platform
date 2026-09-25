# Security Baseline

| Area | Control | Phase |
|---|---|---|
| Passwords | argon2id (memory-hard). Minimum length 8, max 128 | 0 |
| Tokens | JWT access token (15 min, HS256, secret ≥ 32 chars) + opaque refresh token (30 days) stored as a SHA-256 hash. The refresh token rotates on every use. Reusing a revoked token revokes the whole family | 0 |
| Cookies | httpOnly, `SameSite=Lax`, `Secure` in production, path-scoped refresh cookie | 0 |
| CSRF | SameSite + required `X-Requested-With` header on cookie-authenticated mutations | 0 |
| AuthZ | Global guard, default deny. `@Public()` opt-out. RBAC permissions plus ownership checks in services | 0 |
| Role changes | Only `admin`/`super_admin` may assign roles. Only `super_admin` may grant `admin`/`super_admin`. All changes audited | 1 |
| Brute force | Throttling: 5 login attempts/min per IP+email bucket, global 120 req/min | 0 |
| Input | Zod validation on every input. Prisma parameterises queries. Raw SQL only through `Prisma.sql` tagged templates | 0 |
| Output | React escapes by default. CMS rich text is stored as sanitised Markdown/structured blocks, never raw HTML | 1 |
| Headers | `helmet` on the API. Security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) on web | 0/1 |
| Files | Private storage outside the web root. MIME allowlist + magic-byte sniffing + size limit. SHA-256 checksum. HMAC-signed expiring URLs. Ownership check before a URL is issued | 1 |
| Secrets | Never committed. `.env.example` documents them. CI uses GitHub secrets | 0 |
| Logging | Structured logs. Authorization headers, cookies, passwords and tokens are redacted | 0 |
| Audit | Login success/failure, logout, token reuse, role changes, content publish, file upload/delete, request status changes, payment events | 0/1 |
| Payments | `Order` + `PaymentAttempt`. The status comes only from the server-side verify call. Idempotent callback. A user return URL never marks a payment paid | 1 |
| Dependencies | `pnpm audit` in CI (non-blocking at first). Dependabot enabled | 0 |
| MFA | The data model is ready (`User.mfaEnabled`). Implementation deferred | 2+ |
| Backup | Documented backup/restore procedure and restore test. Pending a hosting decision (see open questions) | 1 |

## Mandatory negative tests (DoD)

- A user reads, updates or downloads another user's resource (request, ticket, file) and gets 404.
- A regular user changes their own role or another user's role and gets 403.
- A private file is fetched without a valid signature, or after the URL expired, and gets 403.
- A payment callback is replayed: the second call is a no-op and there is no double credit.
- An already-paid order is paid again: 409.
- A request with no access token hits a private route: 401.
