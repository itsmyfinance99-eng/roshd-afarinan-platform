# System Overview

## Purpose

Roshd Afarinan is a service-oriented platform. It carries a user along one value chain:

```text
Training → Knowledge → Research → Feasibility → Project → Financing → Investment → Iran Sahamdar
```

The home page puts four journeys first: **Training**, **Feasibility**, **Research** and **Iran Sahamdar**.

## Topology

```text
                 ┌──────────────────────────────┐
 Browser ──────► │ apps/web  (Next.js, RTL)     │
                 │  - public site (SSR/ISR)     │
                 │  - dashboard shell           │
                 │  - /api/* rewrite ──────────┐│
                 └──────────────────────────────┘│
                                                 ▼
 Mobile / PWA (future) ───────────────► ┌──────────────────────────┐
                                        │ apps/api (NestJS)        │
                                        │  /api/v1/*  + /docs      │
                                        │  modular monolith        │
                                        └───┬───────┬───────┬──────┘
                                            │       │       │
                                     PostgreSQL   Redis   Object storage
                                     (Prisma)   (future)  (local → S3)
```

- **Same-origin browser calls.** The browser calls `/api/v1/*` on the web origin, and Next.js rewrites the call to the API. Auth cookies are httpOnly and first-party, and CORS is not needed for the web client.
- **Server components** call the API directly with `API_INTERNAL_URL`.
- **Other clients** (mobile, partners) call the API with `Authorization: Bearer`.

## Repository layout

```text
apps/
  web/            Next.js App Router, public site + dashboard shell
  api/            NestJS modular monolith
packages/
  tsconfig/       shared TS configs
  eslint-config/  shared flat ESLint configs
  types/          shared TS types (envelope, roles, enums)
  validation/     shared Zod schemas (API contracts)
  ui/             shared React UI components + design tokens
docs/             architecture, product, api, security, decisions, qa, backlog
infra/            docker, nginx, scripts, ci
```

`prisma/` lives inside `apps/api/prisma` because only the API owns the database.

## Backend module boundaries (`apps/api/src/modules`)

| Module                                                                        | Phase 1 status                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `auth`, `users`, `rbac`, `audit`                                              | Implemented                                      |
| `cms` (pages, articles, categories, authors, knowledge, media, SEO)           | Implemented                                      |
| `search`                                                                      | Implemented (PostgreSQL provider)                |
| `files`                                                                       | Implemented (local private storage, signed URLs) |
| `service-requests` (contact, feasibility request, research order, consulting) | Implemented (request intake only)                |
| `tickets`                                                                     | Implemented (basic)                              |
| `orders`, `payments`                                                          | Order + PaymentAttempt + mock gateway            |
| `learning`                                                                    | Implemented (catalog + editorial API)            |
| `research`                                                                    | Catalog                                          |
| `investment`                                                                  | Catalog (presentation only, no transactions)     |
| `notifications`                                                               | Port + console/log adapter                       |
| `feasibility`                                                                 | Skeleton: state machine contract + ports         |
| `financial-engine`                                                            | Interfaces only                                  |
| `iran-sahamdar`                                                               | Client interface + mock provider                 |
| `ai`                                                                          | Interfaces only                                  |
| `blockchain`                                                                  | Interfaces only                                  |

Rules:

1. Controllers only map transport ↔ service. Business logic lives in services and domain policies.
2. A module talks to another module only through that module's exported service or port.
3. External systems sit behind ports (`PaymentGateway`, `FileStorageProvider`, `NotificationProvider`, `SearchProvider`, `IranSahamdarClient`, `AiProvider`, `BlockchainNetworkAdapter`).

## Cross-cutting concerns

| Concern    | Implementation                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Config     | Environment variables validated with Zod at boot. Boot fails fast on invalid config                              |
| Logging    | Structured JSON logs (pino) with a request ID. Secrets and PII are redacted                                      |
| Errors     | A global exception filter returns the standard error envelope                                                    |
| Validation | Zod schemas from `@roshd/validation`, used by both the API and web forms                                         |
| AuthN      | argon2id password hashes. A short-lived JWT access token plus a rotating opaque refresh token (hashed in the DB) |
| AuthZ      | A global guard, default deny. `@Public()` opts out. `@Permissions()` checks RBAC. Services check ownership       |
| Audit      | `AuditLog` table for security and business events                                                                |
| Rate limit | `@nestjs/throttler`, with stricter limits on auth endpoints                                                      |
| API docs   | OpenAPI at `/docs`, generated from Zod schemas                                                                   |
| Health     | `/api/v1/health/live` and `/api/v1/health/ready` (the latter checks the DB)                                      |

## Frontend

- Next.js App Router, TypeScript and Tailwind CSS v4. Design tokens are CSS variables in `@roshd/ui/tokens.css`.
- `<html lang="fa" dir="rtl">`, with Vazirmatn self-hosted through `@fontsource-variable`. No runtime dependency on an external CDN.
- Institutional copy lives in `apps/web/src/content` (a typed content layer). Collections (articles, knowledge, courses, research, investment) come from the CMS API.
- SEO: the Metadata API, canonical URLs, Open Graph, JSON-LD, `sitemap.ts` and `robots.ts`.

## Deployment

Each app has a Docker image. `docker-compose.yml` provides PostgreSQL and Redis for local development. CI (GitHub Actions) runs lint, typecheck, unit tests, e2e tests against a PostgreSQL service, and build.
