# QA Test Matrix

Legend: ✅ automated · 🟡 manual · ⬜ not yet covered

| Area       | Scenario                                           | Level      | Status |
| ---------- | -------------------------------------------------- | ---------- | ------ |
| Foundation | Health live/ready                                  | API e2e    | ✅     |
| Foundation | Invalid env fails boot                             | Unit       | ✅     |
| Foundation | Error envelope + request ID                        | API e2e    | ✅     |
| Auth       | Register / duplicate email 409                     | API e2e    | ✅     |
| Auth       | Login / wrong password generic 401                 | API e2e    | ✅     |
| Auth       | Refresh rotation + reuse detection                 | API e2e    | ✅     |
| Auth       | Private route without token 401                    | API e2e    | ✅     |
| RBAC       | User cannot change roles 403                       | API e2e    | ✅     |
| Rate limit | Login throttled 429                                | API e2e    | ✅     |
| Auth       | CSRF header required for cookie mutations          | API e2e    | ✅     |
| Auth       | Suspended user loses access immediately            | API e2e    | ✅     |
| RBAC       | Admin cannot grant admin; super_admin can          | API e2e    | ✅     |
| RBAC       | Self role change forbidden                         | Unit + e2e | ✅     |
| Audit      | Login, register, token reuse, role change recorded | API e2e    | ✅     |
| Web        | All public routes render RTL                       | Playwright | ⬜     |

This matrix is updated at the end of each story.
