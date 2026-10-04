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

File responses are the only exception (`@RawResponse()`): signed file downloads, CSV exports
(`GET /service-requests/export`) and the files of a calculation run
(`GET /financial-models/:id/runs/:runId/export`, xlsx / PDF / HTML) return the file itself. Their
errors still use the error envelope.
CSV exports are UTF-8 with a BOM (so Excel shows Persian correctly), use CRLF line endings, neutralise
spreadsheet formulas in user text and interpret `from`/`to` as inclusive days in Iran time.

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
- Browsers receive httpOnly cookies (`ra_at` access on `/`, `ra_rt` refresh scoped to `/api/v1/auth`; `Secure` in production, `SameSite=Lax`). The response body contains the user but **never** the tokens.
- Non-browser clients (mobile, partners) send `X-Auth-Transport: token`. They get `accessToken` + `refreshToken` in the body and no cookies, then call with `Authorization: Bearer <accessToken>` and refresh or log out with `{ "refreshToken": "..." }` in the body.
- Authorization re-reads the user's status and roles from the database on every request, so suspension and role revocation apply immediately.
- State-changing requests authenticated by cookie must send the `X-Requested-With: XMLHttpRequest` header (CSRF defence together with SameSite).

## Idempotency

Payment callbacks and any endpoint that creates money-moving side effects must be idempotent. Payment callbacks are keyed on the provider reference plus the attempt ID.

`GET /payments/callback/:attemptId` is the gateway return URL. It verifies server-to-server with the reference stored at initiation (never one taken from the query), completes the attempt at most once, and answers with a `303` redirect to `/dashboard/orders/:id?payment=paid|failed`. The `payment` hint is only a message cue for the page, which always reads the order status from the API. Prices are never accepted from clients: orders are priced on the server from published catalog records.

## Telling the site a published collection changed

The public site caches its pages (ISR), so an editorial change would otherwise appear only after
the window. Publishing, editing a published record, or archiving one therefore calls the
`SiteCache` port (`apps/api/src/modules/publishing`), which POSTs to the web app:

```
POST {WEB_BASE_URL}/internal/revalidate
x-internal-token: <INTERNAL_API_TOKEN>
{ "tags": ["content"] }
```

Tags are `content`, `pages`, `courses`, `research` and `investments`; the web route refuses an
unknown tag, a path that is not site-relative, and any caller without the token. The call is
best-effort by contract and bounded by a timeout: the editor's change is already saved, so an
unreachable site only means the page refreshes on its own schedule instead. Editing a **draft**
invalidates nothing, because a draft is not on the public site. With no `INTERNAL_API_TOKEN`
configured the port is a no-op (local API-only work and tests).

## OpenAPI

Swagger UI is served at `/docs` (disabled in production unless `SWAGGER_ENABLED=true`). Schemas are generated from Zod (`z.toJSONSchema`).
