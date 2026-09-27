# ADR-0003: API contracts, validation and error model

- Status: Accepted
- Date: 2026-09-25

## Decision

- The URI is versioned (`/api/v1`).
- **Zod 4** schemas in `@roshd/validation` are the single contract source. The API validates with a `ZodValidationPipe`. The web reuses the same schemas in React Hook Form. OpenAPI schemas are generated with `z.toJSONSchema`.
- Every response uses the standard envelope (`{ data, meta }` or `{ error }`). A global exception filter maps known exceptions, Prisma errors (unique → 409, not found → 404) and Zod errors to stable error codes. Unknown errors become `INTERNAL_ERROR` and no details leak.
- Each request gets a request ID (header echo or UUID) that flows through logs and responses.
- Money is an integer number of Rials, serialised as a string.

## Consequences

- The client and server can't drift apart because they share schemas.
- We don't depend on `class-validator` or on DTO class duplication.
