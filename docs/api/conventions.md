# API Conventions

## Versioning

Every endpoint lives under `/api/v1`. Breaking changes need a new version prefix and an ADR.

## Response envelope

Success:

```json
{
  "data": { "...": "..." },
  "meta": { "requestId": "c0a8...", "page": 1, "pageSize": 20, "total": 134 }
}
```

`meta.page`, `meta.pageSize` and `meta.total` appear only on paginated list endpoints.

Error:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "اطلاعات ارسالی معتبر نیست.",
    "details": [{ "path": "email", "message": "ایمیل معتبر نیست." }],
    "requestId": "c0a8..."
  }
}
```

### Error codes

| HTTP | code                     | Meaning                                                                    |
| ---- | ------------------------ | -------------------------------------------------------------------------- |
| 400  | `VALIDATION_FAILED`      | Request body, query or params failed schema validation                     |
| 400  | `BAD_REQUEST`            | Semantically invalid request                                               |
| 401  | `UNAUTHENTICATED`        | Missing or invalid credentials                                             |
| 403  | `FORBIDDEN`              | Authenticated but not allowed                                              |
| 404  | `NOT_FOUND`              | Resource does not exist or the caller may not see it                       |
| 409  | `CONFLICT`               | Uniqueness or state conflict (e.g. email taken, invalid status transition) |
| 413  | `PAYLOAD_TOO_LARGE`      | Upload too large                                                           |
| 415  | `UNSUPPORTED_MEDIA_TYPE` | File type not allowed                                                      |
| 429  | `RATE_LIMITED`           | Too many requests                                                          |
| 500  | `INTERNAL_ERROR`         | Unexpected error. Details are never leaked                                 |
| 503  | `SERVICE_UNAVAILABLE`    | Dependency down (readiness)                                                |

For private resources the API returns `404` rather than `403` when disclosing existence would leak information (e.g. another user's ticket).

## Request ID

The API echoes `X-Request-Id` when the client sends one (max 128 safe chars). Otherwise it generates a UUID. The ID is returned in the `X-Request-Id` response header, in `meta.requestId`/`error.requestId`, and in every log line.

## Pagination, sorting and filtering

- `?page=1&pageSize=20`. `pageSize` is capped at 100.
- `?sort=publishedAt:desc`. Allowed fields are whitelisted per endpoint.
- Filters are plain query params (`?category=economy&status=published`). Each endpoint validates them with Zod.

## Naming

- Resource paths are plural and kebab-case (`/api/v1/service-requests`).
- JSON fields are camelCase. Dates are ISO-8601 UTC strings. Money is an integer in **Rials**, sent as a string to avoid precision loss (`"amount": "125000000"`), with the unit in the field doc.
- Public read endpoints never return unpublished content.

## Authentication

- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Web clients receive httpOnly cookies (`ra_at` access, `ra_rt` refresh; `Secure` in production, `SameSite=Lax`).
- Other clients send `Authorization: Bearer <accessToken>` and refresh with the `refreshToken` in the body.
- State-changing requests authenticated by cookie must send the `X-Requested-With: XMLHttpRequest` header (CSRF defence together with SameSite).

## Idempotency

Payment callbacks and any endpoint that creates money-moving side effects must be idempotent. Payment callbacks are keyed on the provider reference plus the attempt ID.

## OpenAPI

Swagger UI is served at `/docs` (disabled in production unless `SWAGGER_ENABLED=true`). Schemas are generated from Zod (`z.toJSONSchema`).
