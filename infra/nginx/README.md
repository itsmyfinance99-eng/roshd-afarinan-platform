# Reverse proxy and client IP

Rate limits and the audit log need each visitor's own IP address. The Next.js `/api` rewrite does **not** add the visitor's address. It only passes through an `X-Forwarded-For` header that the client sent itself, which the client can forge. So in production:

1. Put a reverse proxy (this nginx config, or an equivalent) in front of both apps. It routes `/api/` **directly to the API** and everything else to the web app.
2. The proxy must **append** the client address: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.
3. Run the API with `TRUST_PROXY=1` (one trusted hop). Express then uses the right-most `X-Forwarded-For` entry, the one nginx added, so a value forged by the client is ignored.
4. Do not publish the API or web ports publicly. Only the proxy is reachable.
5. Set the same `INTERNAL_API_TOKEN` (≥ 32 characters) for the API and the web app. Server-side rendering reads carry it and are exempt from the per-visitor limit; mutations never are.

If there are more proxies in the chain (for example a CDN, then nginx), set `TRUST_PROXY` to the number of proxies that append to the header. With `TRUST_PROXY=0` in production, the API logs a warning at startup.

`infra/docker/compose.app.yml` wires this up: `proxy` (nginx, port 8080) → `api` / `web`.
