# ADR-0006: Testing strategy

- Status: Accepted
- Date: 2026-09-25

## Decision
| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest | Domain services, policies, pure functions, shared schemas, UI components (Testing Library) |
| API e2e | Vitest + Supertest against a real PostgreSQL (`DATABASE_URL` of a test DB) | Endpoints, auth, RBAC, negative authorization cases |
| Web e2e | Playwright (Chromium) | Smoke tests for key public pages, RTL, navigation, forms |
| Static | ESLint, `tsc --noEmit`, Prettier | Every package |

- `pnpm verify` runs lint, typecheck, test and build. It must be green before any commit is pushed.
- CI runs the same checks on every PR and on pushes to `develop`/`main`, with a PostgreSQL service container.
- The e2e database is reset (`prisma migrate reset --force`) before the API e2e suite runs.
- Financial calculations (Phase 4) require deterministic unit tests with edge cases.
