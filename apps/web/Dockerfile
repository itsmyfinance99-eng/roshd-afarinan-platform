# syntax=docker/dockerfile:1.7
# Web image (Next.js standalone). Build from the repository root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://example.ir \
#     --build-arg API_INTERNAL_URL=http://api:4000 -t roshd-web .
# A demo server adds --build-arg NEXT_PUBLIC_DEMO_MODE=true to show the "sample data" notice.
# NEXT_PUBLIC_* values and the /api rewrite target are fixed at build time.

# Pinned by digest (ST-26.10, finding I-11) so a rebuild cannot silently pick up a
# different base; update the digest and the tag together.
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

FROM ${NODE_IMAGE} AS build
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
# Demo content is opt-in: only a demo server passes true (ST-26.10, finding I-12).
ARG NEXT_PUBLIC_DEMO_MODE=false
ARG API_INTERNAL_URL=http://api:4000
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE} \
    API_INTERNAL_URL=${API_INTERNAL_URL}
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@roshd/web

FROM ${NODE_IMAGE} AS runtime
ARG API_INTERNAL_URL=http://api:4000
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    API_INTERNAL_URL=${API_INTERNAL_URL}
WORKDIR /app
# Standalone output keeps the monorepo layout: the server lives in apps/web.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/robots.txt > /dev/null || exit 1
CMD ["node", "apps/web/server.js"]
