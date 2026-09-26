# syntax=docker/dockerfile:1.7
# API image (NestJS). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t roshd-api .                  # runtime (default)
#   docker build -f apps/api/Dockerfile --target migrate -t roshd-api-migrate .
# Configuration comes only from environment variables at run time (see .env.example).

ARG NODE_IMAGE=node:24-alpine

# ── workspace build ──────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
# Builds @roshd/types and @roshd/validation first, then Prisma client + API (turbo graph).
RUN pnpm turbo run build --filter=@roshd/api
# Self-contained production bundle: dist + prisma + production node_modules only.
RUN pnpm --filter @roshd/api deploy --prod --legacy /out

# ── one-off job: apply migrations and seed reference data (roles/permissions) ──────
FROM build AS migrate
WORKDIR /repo/apps/api
ENV NODE_ENV=production
USER node
# Binaries are called directly: pnpm would try to re-check dependencies at run time.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/tsx prisma/seed.ts"]

# ── runtime ──────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=4000 STORAGE_LOCAL_DIR=/app/storage
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Private uploads live outside the web root and on a volume.
RUN mkdir -p /app/storage && chown node:node /app/storage
VOLUME ["/app/storage"]
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health/live > /dev/null || exit 1
CMD ["node", "dist/main.js"]
