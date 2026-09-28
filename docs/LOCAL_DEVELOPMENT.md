# CrawlOps — Local Development

Concise, runnable setup for the monorepo. Every command below is a real script that exists in this repo.

## 1. Prerequisites

- **Node ≥ 20** (see `engines` in the root `package.json`).
- **pnpm 9** (the repo pins `pnpm@9.15.9` via `packageManager`; `corepack enable` will provide it).
- **Docker** — for the local PostgreSQL container.
- **A Firecrawl API key** — required only to execute real runs. The app builds, type-checks, and tests without one.

## 2. Install

```bash
pnpm install
```

This installs the whole workspace (apps + packages).

## 3. Environment variables

```bash
cp .env.example .env
```

Then edit `.env`. The variables that matter locally:

| Variable | Required | Notes |
| --- | --- | --- |
| `FIRECRAWL_API_KEY` | for real runs | Get one at firecrawl.dev. Leave empty to build/test without executing runs. |
| `DATABASE_URL` | for persistence | Defaults to the local Docker PostgreSQL on port 5433 (below). |
| `EVALUATOR_PROVIDER` | no | `deterministic` (default). No API key needed. |
| `LOG_LEVEL` | no | `info` by default. |

`.env` and `.env.*` are gitignored (except `.env.example`). Never commit real secrets.

## 4. PostgreSQL setup

Start the local database (published on host port **5433** to avoid clashing with a local/Homebrew PostgreSQL on 5432; the container listens on 5432 internally):

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

The default local connection string (already in `.env.example`) is:

```
postgresql://crawlops:crawlops@localhost:5433/crawlops?schema=public
```

To stop it later:

```bash
docker compose -f infrastructure/docker/docker-compose.yml down
```

## 5. Prisma (schema, client, migrations)

The Prisma CLI needs `DATABASE_URL` **exported in the shell** (this repo uses a `prisma.config.ts` that does not auto-load `.env` for CLI commands):

```bash
export DATABASE_URL="postgresql://crawlops:crawlops@localhost:5433/crawlops?schema=public"
```

Then, from the database package:

```bash
# apply existing migrations to the local DB
pnpm --filter @crawlops/database migrate:deploy

# generate the Prisma client
pnpm --filter @crawlops/database generate

# create a new migration during schema development
pnpm --filter @crawlops/database migrate

# open Prisma Studio (DB browser)
pnpm --filter @crawlops/database studio
```

Migrations are **explicit** — the app never runs them automatically on startup.

## 6. Run the app (dev)

Two terminals:

```bash
# terminal 1 — API (tsx watch, hot reload)
pnpm --filter @crawlops/api dev      # http://localhost:4000

# terminal 2 — web (Vite dev server)
pnpm --filter @crawlops/web dev      # http://localhost:5173
```

Health checks:

```bash
curl http://localhost:4000/api/health   # liveness — always 200
curl http://localhost:4000/api/ready     # readiness — 200 only if PostgreSQL is reachable
```

## 7. Testing & checks

```bash
pnpm typecheck                       # type-check every package (Turborepo)
pnpm test                            # run all unit/integration tests (Vitest)
pnpm --filter @crawlops/web build    # production web build
pnpm format                          # Prettier
```

Tests use the Firecrawl **mock** and never call the paid API.

## 8. Docker (production images)

Build the exact images used in production:

```bash
# API image (multi-stage, Debian-slim, non-root, bundled with esbuild)
docker build -f apps/api/Dockerfile -t crawlops-api:local .

# Web image (Vite build baked in; VITE_API_URL is a build arg)
docker build -f apps/web/Dockerfile \
  --build-arg VITE_API_URL=http://localhost:4000 \
  -t crawlops-web:local .
```

Run the API image against the local database (macOS: `host.docker.internal` reaches the host):

```bash
docker run --rm -p 4090:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://crawlops:crawlops@host.docker.internal:5433/crawlops?schema=public" \
  -e FIRECRAWL_API_KEY="$FIRECRAWL_API_KEY" \
  crawlops-api:local
```

## 9. Notes

- Optional dependencies (OpenAI, etc.) must never block the app from running — the deterministic evaluator is the default and needs no key.
- Do not use production connection strings locally. Production database and registry credentials live only in the deployment environment, never in this repo.
