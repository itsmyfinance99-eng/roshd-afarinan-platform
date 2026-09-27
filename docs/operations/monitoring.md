# Monitoring, error reporting and logs

How to find out that the platform is down or failing, and where to look when it is (ST-25.08).

## Uptime checks

nginx exposes the API health endpoints on the public origin, so any external uptime monitor (a hosted HTTP checker or a cron job on another host) can poll them. Check from **outside** the server; a check on the same host cannot see network or host outages.

| Check      | URL                                  | Healthy                                                                   | Suggested interval               |
| ---------- | ------------------------------------ | ------------------------------------------------------------------------- | -------------------------------- |
| Website    | `https://<site>/`                    | HTTP 200                                                                  | 1 min                            |
| API alive  | `https://<site>/api/v1/health/live`  | HTTP 200, `{"data":{"status":"ok"}}`                                      | 1 min                            |
| API ready  | `https://<site>/api/v1/health/ready` | HTTP 200; **503** names the failing dependency (`database`, `storage`, …) | 1 min                            |
| TLS expiry | `https://<site>/`                    | certificate valid for > 14 days                                           | daily (once HTTPS is configured) |

Alert after two consecutive failures to avoid paging on a single dropped request. `/health/*` requests are left out of the request log, so frequent polling does not flood it.

## Error reporting

- **API:** every 5xx response and every crash outside a request (uncaught exception or unhandled rejection) goes through the `ErrorReporter` port (`apps/api/src/modules/monitoring`). The only adapter today is `log` (`ERROR_REPORTER_DRIVER=log`): one structured `error` line with the logger context `ErrorReporter`. A hosted error tracker can be added later as another adapter behind the same port without touching callers.
- **Web:** server rendering and route errors are written by `apps/web/src/instrumentation.ts` (`onRequestError`) as one JSON line on stderr with `"source":"web"`.
- **What a report contains:** error name, message and the first 12 stack frames, request id, method, route pattern or path **without the query string**, status code and user id.
- **The request log keeps the path only.** Query strings carry mobile numbers (guest tracking), signed download signatures and search terms, so they are replaced with `?[REDACTED]` in both the API log (`requestSerializer`) and nginx (`log_format roshd`).
- **What it never contains:** request bodies, headers, cookies or query strings. Emails, mobile numbers, card-like numbers, tokens, JWTs, passwords and long keys are replaced in messages and stacks (`scrub` in `@roshd/types`).
- 4xx responses are expected client errors and are not reported.

## Tracing a user's error

- Every API response carries `X-Request-Id`, and every error body carries `error.requestId`. A well-formed id sent by the caller is reused.
- The web error page shows **کد پیگیری خطا** (the Next.js error digest), which appears as `digest` in the web error line.
- Search the logs for that value:

```bash
docker compose -f infra/docker/compose.app.yml logs api | grep '<request id>'
docker compose -f infra/docker/compose.app.yml logs web | grep '<digest>'
```

Log lines written inside a request include the request (`req.id`), so one id finds the request line, the error report and any warnings logged while handling it.

## Timeouts

A stalled database used to leave requests waiting forever. These bounds now apply (ST-26.05):

| Setting                         | Default | Effect                                                                             |
| ------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `DATABASE_POOL_SIZE`            | 10      | Connections per API instance; keep the total below the server's `max_connections`. |
| `DATABASE_CONNECT_TIMEOUT_MS`   | 5000    | Waiting for a free connection fails with 503 instead of hanging.                   |
| `DATABASE_STATEMENT_TIMEOUT_MS` | 15000   | The database cancels a long statement; the API answers 503.                        |
| `REQUEST_TIMEOUT_MS`            | 30000   | Node's own cap on a whole request, so a stuck handler cannot hold a socket.        |

Database outages, pool exhaustion and statement timeouts answer **503 SERVICE_UNAVAILABLE**, not 500, so they do not raise error reports. Verified locally against a proxy that stalls the connection: `/articles` answers 503 in about 2 s and login in about 5 s, and everything recovers without a restart.

## Log retention

- Containers log to Docker's `json-file` driver with rotation (`x-logging` in `infra/docker/compose.app.yml`): `LOG_MAX_SIZE` (default `20m`) per file and `LOG_MAX_FILES` (default `5`) files per service. That is about 100 MB per service; older lines are dropped.
- The API log level is `LOG_LEVEL` (`info` in production; `debug` only while investigating).
- Log lines contain user ids and request ids (personal data under the privacy policy), so keep them only as long as needed, restrict access to operators and never copy them to third-party services without the privacy review (OQ-21).
- Proposed retention: 14 days on the server, plus 90 days in a central log store if one is introduced. The period is an open decision (OQ-24). Audit events are stored in the database (`audit_logs`) and follow the backup policy, not log rotation.

## When an alert fires

1. Call `/api/v1/health/ready`. A 503 names the failing dependency: `database` → check the `postgres` container and disk space; `storage` → check the `app-storage` volume.
2. `docker compose -f infra/docker/compose.app.yml ps`. Containers restart automatically (`restart: unless-stopped`); a restart loop shows in `logs --tail 100 api`.
3. Look for `"level":50` (error) lines from `ErrorReporter` or `"source":"web"` around the alert time.
4. If data was lost or damaged, follow [backup-restore.md](backup-restore.md).
