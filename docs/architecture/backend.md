# Backend (apps/api)

## Module anatomy

```text
src/modules/<context>/
  <context>.module.ts        Nest module (the only public surface, via exports)
  <context>.controller.ts    transport only: parse → call service → return
  <context>.service.ts       application logic, authorization/ownership checks
  domain/                    pure policies, state machines, value objects (no Nest/Prisma)
  ports/                     interfaces + injection tokens for external providers
  adapters/                  provider implementations
  *.spec.ts                  unit tests next to the code
test/                        API e2e tests (supertest, real PostgreSQL)
```

## Request pipeline

`RequestIdMiddleware → pino-http logger → ThrottlerGuard → AuthGuard (default deny) → PermissionsGuard → ZodValidationPipe → Controller → Service → ResponseEnvelopeInterceptor`. Errors go to `AllExceptionsFilter`.

## Conventions

- Throw `AppException` subclasses (`NotFoundError`, `ConflictError`, `ForbiddenError`, …) from services. Never throw HTTP responses from domain code.
- Use `PrismaService` only inside the owning module's services.
- Write audit events through `AuditService.record()`.
- Put configuration in `AppConfig` (Zod-validated), injected with `@Inject(APP_CONFIG)`.
