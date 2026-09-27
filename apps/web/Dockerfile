# syntax=docker/dockerfile:1

# =============================================================================
# CrawlOps Web — production static image (nginx)
#
# Stage "builder": install the pnpm monorepo and build apps/web with Vite.
#   VITE_API_URL is a build ARG baked into the bundle at build time (Vite inlines
#   import.meta.env.VITE_API_URL). It must be provided at build time.
# Stage "runtime": nginxinc/nginx-unprivileged (runs as non-root, listens 8080)
#   serving the built dist/ with SPA fallback (see nginx.conf).
# =============================================================================

# ---- Stage 1: builder ----
FROM node:20-bookworm-slim AS builder
WORKDIR /repo

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Manifests first for layer caching. The web app depends on @crawlops/shared via
# workspace:*, so the whole workspace is installed from the root.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/firecrawl/package.json packages/firecrawl/
COPY packages/evaluation/package.json packages/evaluation/
COPY packages/orchestrator/package.json packages/orchestrator/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

# Sources needed to build the web app (+ shared, which it imports).
COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm --filter @crawlops/web build

# ---- Stage 2: runtime (nginx, non-root) ----
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# Custom server config (SPA fallback, port 8080).
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
# Built static assets.
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
# Base image already runs as the non-root "nginx" user and starts nginx.
