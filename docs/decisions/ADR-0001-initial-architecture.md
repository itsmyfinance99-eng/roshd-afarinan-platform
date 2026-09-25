# ADR-0001: Initial architecture (modular monolith in a pnpm/Turborepo monorepo)

- Status: Accepted
- Date: 2026-09-25

## Context

The platform must ship an MVP quickly (public site, CMS, auth, requests, dashboard). It must also be ready for heavy modules later: LMS, feasibility workflow, financial engine, investment, Iran Sahamdar, AI and blockchain. The team is small. Operational simplicity matters more than independent scaling right now.

## Decision

- **Monorepo** with pnpm workspaces + Turborepo: `apps/web`, `apps/api`, `packages/*`.
- **Backend:** NestJS (TypeScript) **modular monolith**. Each bounded context is a Nest module under `src/modules/<context>` with an explicit public API (exported services/ports).
- **Frontend:** Next.js App Router + TypeScript + Tailwind CSS v4 + an internal `@roshd/ui` package.
- **Database:** PostgreSQL with Prisma ORM and versioned migrations. The API owns the schema (`apps/api/prisma`).
- **Contracts:** shared Zod schemas in `@roshd/validation`, used for API validation, web forms and OpenAPI generation.
- **Versions (pinned for stability):** Node 24 LTS, TypeScript 5.9, NestJS 11, Next.js 16, Prisma 7, Zod 4, ESLint 9, Vitest 4. Newer majors (NestJS 12, Prisma 8, TypeScript 7) come in only through a dedicated upgrade story, once the ecosystem supports them.

## Consequences

- One deployable backend. A module can move out into a service later if an ADR justifies it.
- Boundaries are kept by convention plus lint rules and review. A module never imports another module's internals.
- One CI pipeline and one version of shared contracts.

## Alternatives considered

- **Microservices:** rejected for now because of operational overhead with no scaling need yet.
- **Next.js-only (API routes as the backend):** rejected because the platform needs a long-lived API for mobile/PWA/partners, background jobs and clear domain modules.
- **Headless SaaS CMS:** rejected because of vendor lock-in and data-ownership requirements (see ADR-0005).
