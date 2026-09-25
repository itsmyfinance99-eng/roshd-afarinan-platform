# Project Rules — Roshd Afarinan Platform

This is a modular, API-first platform, not a simple corporate website. It links Training, Knowledge, Research, Feasibility, Project, Financing, Investment and Iran Sahamdar.
Read `docs/architecture/system-overview.md` and `docs/product/implementation-plan.md` before large changes.

## Language
The product language is Persian (fa-IR) and the UI is RTL.
Source code identifiers, commit messages and technical docs stay in English. Product/backlog docs may be Persian.
Show numbers to users with Persian digits (`Intl.NumberFormat('fa-IR')`) and use ZWNJ (نیم‌فاصله) correctly.

## Architecture
Use a modular monolith with explicit domain boundaries (`apps/api/src/modules/<context>`).
Do not introduce microservices unless a documented ADR justifies them.
A module may use another module only through its exported service or port, never its Prisma models directly.
Heavy future capabilities (feasibility workflow, financial engine, Iran Sahamdar, AI, blockchain) start as interfaces/ports only. Do not implement them until their milestone.

## Frontend (apps/web)
Use TypeScript and the Next.js App Router.
Prefer server components. Use client components only when interactivity requires them.
Reuse `@roshd/ui` components and the design tokens. Do not hard-code colors or spacing outside the tokens.
Keep content out of presentation. Institutional copy lives in `apps/web/src/content`, and collections come from the CMS API.

## Backend (apps/api)
Validate every request with Zod schemas from `@roshd/validation`.
Never put business logic in controllers. Controllers map transport to services.
Keep domain/service logic testable and independent of HTTP.
Every response uses the standard envelope (see `docs/api/conventions.md`).

## Security
Default deny: every route needs authentication unless it is explicitly marked `@Public()`.
Authorization-check every private resource, including ownership checks.
Never expose private files directly. Use signed, expiring URLs.
Never commit secrets. Use `.env` (git-ignored) and document every variable in `.env.example`.
Hash passwords with argon2id.

## Database
All schema changes require a Prisma migration (`pnpm db:migrate:dev --name <change>`).
Never modify the production schema manually.
Use seed data only for development and test. Mark demo records with `isDemo = true` and show a "نمونه نمایشی" badge in the UI.

## API
Use versioned contracts (`/api/v1/...`).
Keep external providers behind adapters/interfaces (`PaymentGateway`, `FileStorageProvider`, `NotificationProvider`, `SearchProvider`, `IranSahamdarClient`, `AiProvider`, `BlockchainNetworkAdapter`).
Never guess the real Iran Sahamdar API. Use the mock provider until the specification arrives.

## Testing
Every business-critical feature needs tests, including negative authorization tests.
Financial calculations need deterministic unit tests that cover edge cases.
Before every commit run `pnpm verify` (lint, typecheck, test, build). All checks must pass.

## UX
Every asynchronous page or interaction needs loading, empty, error and success states.
The product must stay fully responsive (mobile, tablet, desktop).

## Accessibility
Use semantic HTML, keyboard navigation, accessible labels and adequate contrast (WCAG 2.1 AA).

## SEO
Public content needs metadata, a canonical URL, sitemap support and structured data where it applies.

## AI
AI output is advisory and reviewable.
Never overwrite expert-approved data automatically.
Apply authorization before retrieval.

## Business rules
Do not invent business rules, prices, certifications, customers, financial figures or project outcomes.
Record unknowns in `docs/product/open-questions.md`.

## Git workflow
- `main` is production and `develop` is integration. Never commit directly to either.
- Branch from `develop`: `feature/<story-id>-<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.
- Commits follow Conventional Commits (`feat(api): ...`), which commitlint enforces.
- Open a PR into `develop` only when `pnpm verify` is green. Reference the story (`Closes #N`).
- Never force-push, reset or rewrite `main`/`develop` without explicit permission from the owner.

## Documentation
Before a large architectural change, create or update an ADR in `docs/decisions`.
Keep `docs/backlog/backlog.yaml` as the backlog source of truth. Sync it with `pnpm backlog:sync`.
