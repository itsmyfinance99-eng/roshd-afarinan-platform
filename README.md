# پلتفرم رشدآفرینان صنعت و معدن

Roshd Afarinan Sanat va Madan platform, a modular, API-first platform that links
**training → knowledge → research → feasibility → project → financing → investment → Iran Sahamdar**.

|                        |                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------- |
| Architecture           | [docs/architecture/system-overview.md](docs/architecture/system-overview.md)      |
| Plan (phase 0/1)       | [docs/product/implementation-plan.md](docs/product/implementation-plan.md)        |
| Backlog (EPIC → STORY) | [docs/backlog/backlog.yaml](docs/backlog/backlog.yaml) → GitHub Issues/Milestones |
| Decisions              | [docs/decisions](docs/decisions)                                                  |
| Open questions         | [docs/product/open-questions.md](docs/product/open-questions.md)                  |
| Engineering rules      | [CLAUDE.md](CLAUDE.md) · [CONTRIBUTING.md](CONTRIBUTING.md)                       |
| UI design handoff      | [design/INTEGRATION.md](design/INTEGRATION.md)                                    |

## Stack

pnpm + Turborepo monorepo · NestJS 11 API · Next.js 16 web · PostgreSQL 16 + Prisma 7 · Zod 4 contracts · Vitest / Supertest / Playwright · GitHub Actions.

```text
apps/api        NestJS modular monolith (/api/v1, Swagger at /docs)
apps/web        Next.js App Router (RTL, fa-IR)
packages/*      shared tsconfig, eslint-config, types, validation, ui
docs/           architecture, product, api, security, decisions, qa, backlog
design/         Claude Design handoff (visual reference)
infra/          docker, scripts, ci
```

## Local development

Prerequisites: Node 24 (`.nvmrc`), pnpm 11, Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d                          # PostgreSQL :5433 (dev + _test DB), Redis :6380
pnpm --filter @roshd/api db:migrate:deploy    # apply migrations
pnpm --filter @roshd/api db:seed              # roles, permissions (idempotent)
pnpm --filter @roshd/api db:seed:demo         # optional: demo articles, knowledge, courses, research, opportunities (isDemo, dev only)
pnpm dev                                      # API on http://localhost:4000
```

- API health: `GET http://localhost:4000/api/v1/health/ready`
- API docs: <http://localhost:4000/docs>

> On Windows, use `127.0.0.1` rather than `localhost` in connection strings. `localhost` may resolve to IPv6 first.

## Setup from scratch (checklist)

1. Install Node 24, pnpm 11 (`corepack enable`) and Docker.
2. `git clone` the repository, then `pnpm install`.
3. `cp .env.example .env` and set `JWT_ACCESS_SECRET` and `FILE_URL_SECRET` (each `openssl rand -base64 48`).
4. `docker compose up -d`, then `pnpm --filter @roshd/api db:migrate:deploy` and `pnpm --filter @roshd/api db:seed`.
5. `pnpm dev`: web on <http://localhost:3000>, API on <http://localhost:4000>.
6. Optional: `pnpm --filter @roshd/api db:seed:demo` for labelled demo content. To try online payment locally, keep `PAYMENT_PROVIDER` empty (mock gateway outside production).

## Docker images

Both apps have multi-stage, non-root images (`apps/api/Dockerfile`, `apps/web/Dockerfile`). The build context is the repository root.

```bash
docker build -f apps/api/Dockerfile -t roshd-api .                     # API runtime
docker build -f apps/api/Dockerfile --target migrate -t roshd-migrate . # migrations + roles/permissions seed
docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://api:4000 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://example.ir -t roshd-web .    # web (standalone)
```

- Run the `migrate` image once per release, before starting the new API. It applies migrations and seeds reference data (never demo data).
- The API reads all configuration from environment variables (see `.env.example`), and private uploads live in the `/app/storage` volume. In production the payment gateway stays `disabled` until a PSP is chosen (OQ-09).
- `NEXT_PUBLIC_*` and `API_INTERNAL_URL` are fixed when the web image is built, because the `/api` rewrite is compiled in.
- Full stack in containers: `JWT_ACCESS_SECRET=… FILE_URL_SECRET=… INTERNAL_API_TOKEN=… docker compose -f infra/docker/compose.app.yml up --build` (site on :8080 behind nginx).
- **Production needs a reverse proxy** so rate limits and audit logs see each visitor's real IP: see [infra/nginx/README.md](infra/nginx/README.md).

## Quality gate

```bash
pnpm verify        # lint + typecheck + unit tests + build (must be green before every push)
pnpm test:e2e      # API e2e against TEST_DATABASE_URL (database name must end with _test)
pnpm format        # prettier
```

## Database changes

```bash
pnpm --filter @roshd/api db:migrate:dev --name <change>   # creates + applies a migration
```

Never edit an applied migration and never change a production schema by hand.

---

© Roshd Afarinan Sanat va Madan Yazd. All rights reserved. Proprietary, not open source.
