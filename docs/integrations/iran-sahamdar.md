# Iran Sahamdar integration

- Status: **boundary + mock only** (EPIC-17 · ST-17.01). The real adapter is Phase 6 (ST-17.02).
- Code: `apps/api/src/modules/iran-sahamdar/` · Port: `IranSahamdarClient` · Contract version `0.1.0-draft`

## Why no real client yet

The Iran Sahamdar API specification has not been supplied (OQ-06). Per the roadmap, **no endpoint, field name or auth scheme is guessed**. The port describes what _our_ platform needs (submit a project listing, read its status, withdraw it) in our own domain terms. When the spec arrives, a live adapter maps these DTOs to the external contract.

## Information required from Iran Sahamdar

| #   | Needed                                                       | Notes                                                           |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| 1   | API specification (OpenAPI or equivalent) and version policy | Endpoints, payloads, error model                                |
| 2   | Authentication scheme                                        | OAuth2 client credentials / API key / mTLS, and token lifetimes |
| 3   | Sandbox environment + test credentials                       | Required to run the contract tests against the live adapter     |
| 4   | Rate limits and SLAs                                         | Drives the retry/backoff and timeout values                     |
| 5   | Idempotency support                                          | Header or natural key, to avoid duplicate listings              |
| 6   | Webhooks or polling for status changes                       | Drives the synchronization strategy                             |
| 7   | Required project data and document formats                   | Maps to `InvestmentOpportunity` + `FileObject`                  |
| 8   | Legal/contractual terms for listing projects                 | Which projects may be listed and who approves them              |

## Assumptions (to be confirmed)

- Listings are created by staff after the internal review, never automatically.
- Our side is the source of truth for project data. Iran Sahamdar returns status only.

## Mapping placeholders

| Our DTO field                            | External field | Transformation          |
| ---------------------------------------- | -------------- | ----------------------- |
| `internalProjectId`                      | _TBD_          |                         |
| `title`, `summary`, `sector`, `province` | _TBD_          | sector code table _TBD_ |
| `requiredCapitalRials` (bigint)          | _TBD_          | unit/currency _TBD_     |
| `idempotencyKey`                         | _TBD_          |                         |
| `ListingStatus`                          | _TBD_          | status code table _TBD_ |

## Security

- Credentials come only from environment/secret storage. Never in code or logs.
- All outbound calls go through the adapter and are logged to `AuditLog` (`iran_sahamdar.*` actions) with request IDs, without sensitive payloads.
- TLS is required. Certificate pinning is to be decided with the provider.

## Error handling and resilience (live adapter requirements)

- Timeout per call (initial proposal 10s). Retries with exponential backoff **only for idempotent operations** and 5xx/network errors.
- A circuit breaker on repeated failures. `/health/ready` reports the integration as degraded without failing the whole API.
- Map external errors to our error codes. The raw payload goes to debug logs only when redacted.

## Synchronization strategy

- Submission is synchronous (receipt with `externalReference`). Status updates come by webhook (preferred) or scheduled polling, with idempotent handlers keyed on `externalReference` + status version.

## Contract tests

`iran-sahamdar-client.contract.spec.ts` defines the behaviour every implementation must satisfy. The live adapter must pass the same suite against the sandbox before it replaces the mock.
