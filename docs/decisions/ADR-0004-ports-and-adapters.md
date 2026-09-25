# ADR-0004: External providers behind ports and adapters

- Status: Accepted
- Date: 2026-09-25

## Decision
Every external dependency is reached through a TypeScript interface (port) plus a Nest injection token. The concrete adapter is chosen by configuration.

| Port | Phase 1 adapter | Later adapters |
|---|---|---|
| `PaymentGateway` | `MockPaymentGateway` (dev/test only; disabled in production) | Iranian PSP (OQ-09) |
| `FileStorageProvider` | `LocalDiskStorage` (private directory) | S3-compatible (OQ-10) |
| `NotificationProvider` | `LogNotificationProvider` | SMS/email providers (OQ-08) |
| `SearchProvider` | `PostgresSearchProvider` | OpenSearch/Elastic |
| `IranSahamdarClient` | `MockIranSahamdarClient` | Real client after the spec arrives (OQ-06) |
| `AiProvider`, `RetrievalProvider` | none (interface only) | Phase 7 |
| `BlockchainNetworkAdapter`, `WalletProvider` | none (interface only) | Phase 8 |
| `FinancialCalculator` | none (interface only) | Phase 4 (pure domain library) |

## Consequences
- Business logic never imports a vendor SDK.
- Tests use the mock adapters, and contract tests pin the port behaviour.
- A production boot with a mock payment gateway fails fast.
