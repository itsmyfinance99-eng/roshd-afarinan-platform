# Handoff note — 2026-10-02

A snapshot for whoever (person or agent) picks the project up next. Engineering rules live in [CLAUDE.md](../CLAUDE.md); this note only records state, context and gotchas that the code and git history do not show.

## Where things stand

| Item      | State                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `main`    | Release **v0.3.0** (UI v2 "Copper & Graphite", 2026-10-02). Tags `v0.1.0`, `v0.2.0`, `v0.3.0`, each with a GitHub Release.                                         |
| `develop` | Same content as `main` right after the release.                                                                                                                    |
| Backlog   | Every Phase 1 story is closed. The remaining open issues (about 43) are Phase 2+ stories, epics and `needs:decision` questions.                                    |
| Open PRs  | None.                                                                                                                                                              |
| Releases  | `develop` → `main` with a merge commit, a SemVer tag and a GitHub Release from the CHANGELOG section (ADR-0007). Each release needs the owner's explicit approval. |

## What to do next

1. **Phase 2 needs a business decision first.** Do not pick a direction alone; ask the owner. Candidates: real payment gateway (OQ-09), SMS/email provider and OTP login (OQ-08, OQ-20, D1 in `design/INTEGRATION.md`), LMS, feasibility workflow, financial engine, Iran Sahamdar adapter (OQ-06), AI, analytics (OQ-24), PWA.
2. **Content the owner still owes:** official About text and licences (OQ-17), privacy/terms (OQ-21), real courses and prices (OQ-22), refund policy (OQ-23), free first consultation (OQ-25), working hours, an SVG logo (OQ-16), domain (OQ-19). All are in [open-questions.md](product/open-questions.md).

## Design (v2)

- Raw handoff: `design/claude-design/` (verbatim, do not edit). Prompt that produced it: `design/prompts/claude-design-v2-copper-graphite.md`.
- Integration map, decisions D1–D20 and the coverage checklist (all ticked): [design/INTEGRATION.md](../design/INTEGRATION.md).
- Design-system rules for code: [docs/architecture/frontend.md](architecture/frontend.md#design-system-v2-copper--graphite).
- Repo facts beat prototype placeholders: real contact details, real email + password auth, real form submission and tracking codes, no invented claims.

## Tooling and environment gotchas

- **GitHub account.** The repo is `itsmyfinance99-eng/roshd-afarinan-platform`. Several `gh` accounts are logged in on the dev machine; if `gh`/`git fetch` says "Repository not found", the active account is the wrong one: `gh auth switch --user itsmyfinance99-eng`.
- **Branch flow.** Branch from `develop`, Conventional Commits, PR into `develop` after `pnpm verify`. CI must be green before merge.
- **Local e2e.** Build web, then `PLAYWRIGHT_CHANNEL=msedge pnpm exec playwright test --workers=1` in `apps/web`. Nothing may listen on `127.0.0.1:4000` during the run (the compiled `/api` rewrite would hit a real API). Playwright runs with `reducedMotion: 'reduce'`.
- **API e2e** uses a separate `*_test` database; load `TEST_DATABASE_URL`, `JWT_ACCESS_SECRET` and `FILE_URL_SECRET` from `.env` first.
- **Windows.** Use `127.0.0.1` rather than `localhost` for Postgres (`localhost:5433` hangs on IPv6). Keep `--concurrency=1` / `--workers=1`; memory is tight.
- **Local web build on Windows** fails with `EPERM … symlink` in `.next/standalone` (`output: 'standalone'` with pnpm) unless Windows Developer Mode is on or the shell is elevated. It is an environment issue, not a code issue; CI on Linux builds normally.
- **`.claude/launch.json`** is modified locally and intentionally not committed: it adds `web-public`/`api-public` (demo on `0.0.0.0:3000`/`4000`), `mock-api` (4100), `web-mock` (3300) and `web-prod-mock` (3400). `web` and `web-public` share port 3000, so only one runs at a time.
- **Port 80 on the dev machine** is a Caddy instance serving a different project. Leave it alone.

## Public demo

- The dev machine's public IP is dynamic and inbound port forwarding from the modem never worked reliably, so a stable public demo needs either a domain on Cloudflare (named tunnel) or a server (OQ-10, OQ-19).
- Without a domain, only temporary links work: a Cloudflare quick tunnel (`*.trycloudflare.com`) or `localhost.run` over SSH. Both change on every restart.
- cloudflared does not use `HTTPS_PROXY` when it requests a quick tunnel; on this network that request only succeeds through the VPN proxy. The working route was registering the tunnel through the proxy and running `cloudflared tunnel run --credentials-file … --url http://127.0.0.1:3000 <id>`.
- `NEXT_PUBLIC_SITE_URL` is compiled into the web build, and the API needs a matching `WEB_BASE_URL`, so rebuild the web app with the public URL before sharing a link. A production web build only serves `/mock-gateway` with `ENABLE_MOCK_GATEWAY=true`.
- Plain-HTTP demos need `COOKIE_SECURE=false` in production mode. Never print the seeded admin password; it is `SEED_SUPER_ADMIN_PASSWORD` in `.env`.
