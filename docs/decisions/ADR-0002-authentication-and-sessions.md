# ADR-0002: Authentication and sessions

- Status: Accepted
- Date: 2026-09-25

## Context

Web, a future PWA/mobile app and partner integrations must all share one identity per person. The roadmap leaves the choice between Auth.js and an independent auth service open.

## Decision

Authentication lives **inside the API** (`auth` module), with no third-party identity SaaS:

- Passwords are hashed with **argon2id**.
- **Access token:** a JWT (HS256, 15 minutes) with `sub`, `roles` and `sid` (session id).
- **Refresh token:** an opaque random 256-bit value (30 days). Only its SHA-256 hash is stored in `RefreshToken`. It **rotates** on every refresh. Presenting a revoked token revokes the whole session family (reuse detection).
- **Web delivery:** httpOnly cookies (`ra_at`, `ra_rt`), `SameSite=Lax`, `Secure` in production. The browser talks to the API through the web origin (a Next.js rewrite), so the cookies are first-party.
- **Other clients:** send `X-Auth-Transport: token` and receive the tokens in the response body (no cookies), then use `Authorization: Bearer`. Browsers never receive tokens in the body.
- **Session hint:** a non-secret, non-httpOnly `ra_session=1` cookie (same lifetime as the refresh token) lets the web UI and the Next.js proxy know a session probably exists. It is never used for authorization.
- **Web refresh:** the browser client retries a 401 once after `POST /auth/refresh` (single-flight), so the 15-minute access token renews transparently.
- **CSRF:** SameSite=Lax plus a required `X-Requested-With` header on cookie-authenticated mutations.
- **Login identifier:** email (required) or mobile (optional, unique). OTP/SMS login waits on OQ-08/OQ-20.
- **MFA:** schema flag reserved (`mfaEnabled`). Implemented later.

## Consequences

- No dependency on an external identity provider. The client owns user data.
- The API is the single source of truth for sessions, and web and mobile share it.
- Next.js does not need Auth.js. Middleware (proxy) only checks that a cookie is present for UX redirects. The API enforces authorization.

## Update (ST-25.02): password recovery and session revocation

- **Reset links**: 256-bit random token, only its SHA-256 is stored, 30-minute lifetime (`PASSWORD_RESET_TTL_MINUTES`), single use (conditional update), and a newer request invalidates older links. The request endpoint answers the same whether or not the account exists.
- **Revocation**: `User.sessionsRevokedAt`. Access tokens carry a millisecond issue time (`iatMs`), and the guard rejects any token issued at or before that instant, so revocation is immediate even though access tokens live 15 minutes. Refresh tokens of the user are revoked at the same time.
- A password **reset** and **sign out everywhere** end every session. A password **change** ends every other session and issues a fresh session to the current device. All of these are audited, and the account owner is notified by email.
- **Suspension** (ST-25.04) sets `sessionsRevokedAt` as well. Refresh tokens created before `sessionsRevokedAt` are refused, so a session never revives after the account is reactivated or the password is changed.

## Addendum: per-account lockout (ST-25.10)

The per-IP login throttle does not stop guessing spread across many addresses. Each account now counts consecutive wrong passwords (`User.failedLoginCount`, incremented atomically) and refuses sign-in for `LOGIN_LOCK_MINUTES` after `LOGIN_MAX_FAILURES` failures (`User.lockedUntil`, 429 with the remaining minutes). A successful sign-in or a password reset clears the state. A locked account is refused before the password is checked. Trade-off: anyone who knows an email can lock that account for 15 minutes; the short lock and the reset link (which lifts it) keep that nuisance small. Unknown emails never lock.

## Addendum: session revocation and the refresh replay window (ST-26.08)

- **Logout now ends the access token as well.** `sid` is the refresh-token family, so the guard
  loads the user through the family's active token: one query answers both "is this session still
  alive?" and "what is the account's state?". Logging out (or reuse detection) revokes the family,
  and the access token stops working immediately instead of lasting up to 15 more minutes.
- **A rotation raced within 20 seconds is replayed, not punished.** Two tabs can present the same
  refresh token milliseconds apart; that is a race, not theft. Within the window the caller that
  arrives second rotates from the live successor and receives a usable pair, so the session
  survives. Outside the window, or when the successor is already gone, reuse detection still
  revokes the whole family. The trade-off is deliberate: a stolen token replayed within those
  seconds works once, while the previous behaviour logged real users out of every device.
