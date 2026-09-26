# Integrations

| Integration                   | Port                                         | Status                | Decision needed                                  |
| ----------------------------- | -------------------------------------------- | --------------------- | ------------------------------------------------ |
| Payment gateway (Iranian PSP) | `PaymentGateway`                             | Mock only             | OQ-09                                            |
| SMS / Email                   | `NotificationProvider`                       | Log adapter           | OQ-08                                            |
| Object storage                | `FileStorageProvider`                        | Local private disk    | OQ-10                                            |
| Search engine                 | `SearchProvider`                             | PostgreSQL            | Only when the scale requires it                  |
| Iran Sahamdar                 | `IranSahamdarClient`                         | Mock + contract tests | OQ-06 (see `docs/integrations/iran-sahamdar.md`) |
| AI provider                   | `AiProvider`, `RetrievalProvider`            | Interface only        | OQ-14                                            |
| Blockchain                    | `BlockchainNetworkAdapter`, `WalletProvider` | Interface only        | Business/legal model                             |

Every integration must have a timeout, a retry policy (idempotent calls only), an audit log for external calls, health reporting and a mock for tests.

## Site search (Phase 1)

`PostgresSearchProvider` is federated: each module that owns a public collection (CMS articles and knowledge, courses, research, investment opportunities) exposes `searchPublished(tokens, take)` over its own published records, so search never reads another module's tables. A query is split into words on spaces and ZWNJ (so «امکان سنجی» and «امکان‌سنجی» match alike, with Arabic ي/ك folded to Persian); every word must appear in the title or summary. Results are merged by a simple score (full title match, title prefix, summary match) and then by recency. An OpenSearch adapter can later replace the provider behind the same port.

## Notifications (ST-25.05)

`NotificationsService` (notifications module) stores **in-app notifications** (dashboard notification center and header badge) and optionally sends **emails** through the `NotificationProvider` port. Delivery is best-effort: the business action is already stored, so failures are logged and never thrown.

| Event                             | Recipients                                              | Channels       |
| --------------------------------- | ------------------------------------------------------- | -------------- |
| New service request               | Active users with `requests:read-all`                   | In-app         |
| Request status changed            | The requester (account); guests by email                | In-app + email |
| New ticket, user reply            | Active users with `tickets:read-all` (never the author) | In-app         |
| Staff answer (not internal notes) | Ticket owner                                            | In-app + email |
| Order paid                        | Buyer                                                   | In-app + email |

Real email/SMS delivery waits on the provider decision (OQ-08); until then emails go to the log provider.
