# syntax=docker/dockerfile:1

# =============================================================================
# CrawlOps API — production image
#
# Strategy:
#  - Stage "builder": install the whole monorepo with pnpm, bundle the API + all
#    @crawlops/* workspace packages into a single dist/server.js with esbuild.
#  - Stage "runtime": Debian-slim Node (OpenSSL 3, matches Prisma
#    debian-openssl-3.0.x). Install ONLY @prisma/client at runtime and run
#    `prisma generate` INSIDE the Linux image so the correct Linux query engine
#    is produced natively. Run as a non-root user with `node dist/server.js`.
#
# Debian-slim (not Alpine) is used deliberately to avoid Prisma/OpenSSL/musl
# compatibility issues.
# =============================================================================

# ---- Stage 1: builder ----
FROM node:20-bookworm-slim AS builder
WORKDIR /repo

# pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy manifests first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/firecrawl/package.json packages/firecrawl/
COPY packages/evaluation/package.json packages/evaluation/
COPY packages/orchestrator/package.json packages/orchestrator/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
# apps/web manifest is needed so the frozen lockfile stays consistent, even
# though we don't build the web app in this image.
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

# Copy the rest of the sources needed to build the API bundle.
COPY packages/ packages/
COPY apps/api/ apps/api/

# Generate the Prisma client (for types during bundling) and build the bundle.
RUN pnpm --filter @crawlops/database exec prisma generate
RUN pnpm --filter @crawlops/api build

# ---- Stage 2: runtime ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# OpenSSL is required by the Prisma query engine at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install only the runtime deps that must remain external to the bundle:
# @prisma/client (loads a native engine) and prisma (to generate it here).
COPY apps/api/package.runtime.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# Bring in the Prisma schema and generate the client for THIS (Linux) platform.
COPY packages/database/prisma ./prisma
RUN npx prisma generate --schema ./prisma/schema.prisma

# The bundled server.
COPY --from=builder /repo/apps/api/dist ./dist

# Run as a non-root user.
RUN useradd --system --uid 1001 --create-home appuser \
  && chown -R appuser:appuser /app
USER appuser

ENV PORT=4000 HOST=0.0.0.0
EXPOSE 4000

# Liveness/readiness are served by the app at /api/health and /api/ready.
CMD ["node", "dist/server.js"]
