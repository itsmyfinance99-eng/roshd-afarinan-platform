# syntax=docker/dockerfile:1.7
# API image (NestJS). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t roshd-api .                  # runtime (default)
#   docker build -f apps/api/Dockerfile --target migrate -t roshd-api-migrate .
# Configuration comes only from environment variables at run time (see .env.example).

# Pinned by digest (ST-26.10, finding I-11) so a rebuild cannot silently pick up a
# different base; update the digest and the tag together.
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

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
# A second bundle for the migration job: the same code plus the Prisma CLI and tsx, which are
# devDependencies and therefore absent from the production bundle (ST-27.06).
RUN pnpm --filter @roshd/api deploy --legacy /out-migrate

# ── prune: what each image genuinely never loads ──────────────────────────────────
# `@prisma/client` declares the Prisma CLI as a peer dependency, so even a --prod deploy drags in
# the CLI, Studio, the query engines, PGlite, TypeScript and React — about half the image, none of
# which the server touches: the generated client sits in dist/ and queries go through
# @prisma/adapter-pg. The migration job is the mirror image — it needs Prisma and tsx, but no test,
# lint or bundler toolchain. Nothing under @prisma is dropped there: the CLI loads Studio and
# @prisma/dev eagerly, so pruning either breaks `prisma migrate deploy` outright.
#
# Entries are pnpm store directory names, so a scope is spelled with "+" and globs are allowed.
# @swc is listed package by package: @swc/helpers is a runtime dependency of fontkit, which
# PDFKit uses to write the PDF of a calculation run (ST-34.09), and must stay.
# @swc is listed package by package: @swc/helpers is a runtime dependency of fontkit, which
# PDFKit uses to write the PDF of a calculation run (ST-34.09), and must stay.
# CI starts the runtime image and calls /health/live, and runs the migration job against a fresh
# database, so a wrong entry here breaks the build instead of production (ST-27.06).
FROM build AS prune
ARG RUNTIME_DROP="prisma @prisma+studio-core @prisma+engines @prisma+dev @prisma+config typescript effect @electric-sql+pglite elkjs react react-dom scheduler @types+* esbuild @esbuild+* rollup @rollup+* rolldown @rolldown+* vite @vitejs+* vitest @vitest+* eslint @eslint+* @typescript-eslint+* turbo @turbo+* @swc+core @swc+core-* @swc+cli @swc+counter @swc+types unplugin-swc @nestjs+cli @nestjs+testing supertest pino-pretty tsx"
ARG MIGRATE_DROP="vitest @vitest+* eslint @eslint+* @typescript-eslint+* supertest @nestjs+cli @nestjs+testing @swc+core @swc+core-* @swc+cli @swc+counter @swc+types unplugin-swc pino-pretty turbo @turbo+* rolldown @rolldown+* vite @vitejs+* rollup @rollup+* playwright @playwright+* swagger-ui-dist"
RUN set -eu; cd /out/node_modules/.pnpm; for name in ${RUNTIME_DROP}; do rm -rf ${name}@*; done; rm -rf /out/node_modules/prisma /out/node_modules/typescript /out/node_modules/tsx
RUN set -eu; cd /out-migrate/node_modules/.pnpm; for name in ${MIGRATE_DROP}; do rm -rf ${name}@*; done

# ── one-off job: apply migrations and seed reference data (roles/permissions) ──────
FROM ${NODE_IMAGE} AS migrate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune --chown=node:node /out-migrate ./
# prisma.config.ts and prisma/seed.ts import from src/ (the env loader, the argon2 options and the
# generated client), and the CLI reads them as TypeScript, so the sources have to be here.
COPY --from=build --chown=node:node /repo/apps/api/src ./src
USER node
# Binaries are called directly: pnpm would try to re-check dependencies at run time.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/tsx prisma/seed.ts"]

# ── runtime ──────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=4000 STORAGE_LOCAL_DIR=/app/storage
WORKDIR /app
COPY --from=prune --chown=node:node /out ./
# Private uploads live outside the web root and on a volume.
RUN mkdir -p /app/storage && chown node:node /app/storage
VOLUME ["/app/storage"]
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health/live > /dev/null || exit 1
CMD ["node", "dist/main.js"]
