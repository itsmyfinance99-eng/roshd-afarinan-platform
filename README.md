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
