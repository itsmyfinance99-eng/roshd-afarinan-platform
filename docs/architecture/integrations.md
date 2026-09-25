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
