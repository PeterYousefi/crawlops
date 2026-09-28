# CrawlOps — Deployment

> **Status:** deployed to **Azure Container Apps**. `crawlops-web` (nginx) and `crawlops-api` (Fastify) run as separate scale-to-zero containers, pulling private images from Azure Container Registry, backed by an Azure PostgreSQL Flexible Server. This document describes local dev, the production container image, and the high-level deployment process. It contains **no credentials, connection strings, or subscription identifiers** — those live only in the deployment environment.

## Local development

```bash
pnpm install
cp .env.example .env            # set FIRECRAWL_API_KEY

# Local PostgreSQL (host port 5433 to avoid clashing with a local pg on 5432)
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Apply migrations (Prisma CLI needs DATABASE_URL in the shell)
export DATABASE_URL="postgresql://crawlops:crawlops@localhost:5433/crawlops?schema=public"
pnpm --filter @crawlops/database exec prisma migrate deploy

# Run API + web (separate terminals)
pnpm --filter @crawlops/api dev      # http://localhost:4000 (tsx, hot reload)
pnpm --filter @crawlops/web dev      # http://localhost:5173 (proxies /api -> 4000)
```

The local TypeScript workflow is unchanged (`tsx`, hot reload). Docker/local Postgres support is retained.

## Production container (API)

The API ships as a single container image built from `apps/api/Dockerfile`:

- **Multi-stage**, **Debian-slim** Node 20 base (not Alpine — avoids Prisma/OpenSSL/musl issues).
- Builder stage installs the monorepo with pnpm and **bundles** the API + all `@crawlops/*` packages into `dist/server.js` with esbuild.
- Runtime stage installs only `@prisma/client` + `prisma`, runs `prisma generate` **inside the Linux image** (produces the `debian-openssl-3.0.x` query engine), copies the bundle, and runs as a **non-root** user.
- Entry point: `node dist/server.js` (no `tsx` in production).

Build and run it locally against the local Postgres:

```bash
# build the exact production image
docker build -f apps/api/Dockerfile -t crawlops-api:local .

# run it (macOS: host.docker.internal reaches the host Postgres on 5433)
docker run --rm -p 4090:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://crawlops:crawlops@host.docker.internal:5433/crawlops?schema=public" \
  -e FIRECRAWL_API_KEY="$FIRECRAWL_API_KEY" \
  -e WEB_ORIGIN="https://<your-frontend-origin>" \
  crawlops-api:local

curl http://localhost:4090/api/health   # liveness (always 200)
curl http://localhost:4090/api/ready    # readiness (200 only if Postgres reachable)
```

**Verified locally:** the production image starts, connects to Postgres, reports healthy/ready, runs a full real Firecrawl evaluation to `SUCCESS`, and enforces CORS to `WEB_ORIGIN`.

## Health & readiness

| Endpoint | Purpose | Behaviour |
| --- | --- | --- |
| `GET /api/health` | Liveness | Always 200; never depends on external services. A transient Firecrawl/DB outage must not restart the container. Reports dependency status for observability. |
| `GET /api/ready` | Readiness | 200 only when PostgreSQL is reachable; 503 otherwise. Firecrawl is not treated as critical for readiness. |

## Database / Prisma in the cloud

- **SSL:** Azure Database for PostgreSQL requires TLS. The connection string must include `?sslmode=require`. No code change is needed — Prisma reads it from `DATABASE_URL`:
  ```
  postgresql://<user>:<password>@<server>.postgres.database.azure.com:5432/crawlops?sslmode=require
  ```
- **Linux engine:** `schema.prisma` sets `binaryTargets = ["native", "debian-openssl-3.0.x"]` so the client works both locally and in the Debian-slim container.
- **Migrations are explicit, never automatic.** The app does **not** run migrations on startup (no destructive surprises). Run them as a deliberate step against the remote DB:
  ```bash
  export DATABASE_URL="postgresql://<user>:<pw>@<server>.postgres.database.azure.com:5432/crawlops?sslmode=require"
  pnpm --filter @crawlops/database exec prisma migrate deploy
  ```

## Cloud filesystem limitation (important)

`LocalBlobStore` writes to the local filesystem (`./storage`). Azure Container Apps has an **ephemeral, per-replica filesystem**, so persisted blobs would be lost on restart and unreadable across replicas.

For the current MVP this is **not a problem**: the SEARCH strategy stores source URLs/titles/metadata in PostgreSQL and does **not** persist large page content, so the BlobStore is effectively unused at runtime. The deployed MVP therefore does not depend on any persistent local filesystem state.

**Deferred:** an `AzureBlobStore` (behind the existing `BlobStore` interface) will be added when SCRAPE/CRAWL workflows need to persist large page content. Until then, do not rely on `LocalBlobStore` for cloud functionality.

## Cloud topology: Azure (deployed)

| Concern | Azure service | State |
| --- | --- | --- |
| Frontend hosting | Azure Container Apps — `crawlops-web` (nginx static SPA) | deployed |
| API container | Azure Container Apps — `crawlops-api` (Fastify), scale-to-zero | deployed |
| Image registry | Azure Container Registry (private, token-scoped pull) | deployed |
| Database | Azure PostgreSQL Flexible Server | deployed |
| Secrets | Container Apps secrets (database URL, Firecrawl key) | deployed |
| Object storage | Azure Blob Storage | deferred (SEARCH/AGENT persist URLs/metadata, not large blobs) |
| Queue / IaC / CI-CD | Service Bus / Terraform / GitHub Actions | not implemented |

Both web and API scale to zero when idle. The frontend is served as a static SPA by nginx (not Azure Static Web Apps, which was unavailable in the target region).

## Deployment process (high level)

Deployments are **image-only** so probes, secrets, ingress, and scale settings are preserved:

1. Build the platform-correct image and push it to the private ACR.
2. Update the Container App to the new image tag.

The web image bakes `VITE_API_URL` at build time; the API reads `DATABASE_URL`, `FIRECRAWL_API_KEY`, and `WEB_ORIGIN` from Container App secrets/env at runtime. Exact commands, tags, and identifiers are intentionally **not** stored in this repository.

Portability: business logic depends on interfaces (`FirecrawlClient`, `EvaluatorProvider`, `BlobStore`, `JobRunner`), so moving clouds means swapping infrastructure, not rewriting the app.

## Status

| Item | State |
| --- | --- |
| Local Postgres via Docker | tested locally |
| API production Dockerfile | tested locally + deployed |
| Frontend production build (`VITE_API_URL`) | tested locally + deployed |
| Azure Container Apps (web + api), ACR, PostgreSQL Flexible Server | deployed |
| Object storage, queue, CI/CD, Terraform | not implemented |
