# CrawlOps — Deployment

> **Status:** local-first. No cloud resources are provisioned yet (cost = ~$0 during development). This document describes the intended path; nothing here is deployed.

## Local development

```bash
pnpm install
cp .env.example .env            # set FIRECRAWL_API_KEY
docker compose -f infrastructure/docker/docker-compose.yml up -d   # PostgreSQL (planned)
pnpm --filter @crawlops/database migrate                            # (planned)
pnpm dev
```

## Containerization *(planned)*

Each deployable app (`api`, `web`) gets its own Dockerfile. The orchestrator runs in-process with the API for the MVP.

## Cloud target: Azure *(planned, Phase 5)*

Kept cloud-neutral in the application; Azure specifics live in `infrastructure/azure/terraform`.

| Concern | Azure service |
| --- | --- |
| Containers | Azure Container Apps |
| Registry | Azure Container Registry |
| Database | Azure Database for PostgreSQL |
| Queue | Azure Service Bus |
| Secrets | Azure Key Vault |
| Object storage | Azure Blob Storage |
| Observability | Azure Application Insights |
| IaC | Terraform |
| CI/CD | GitHub Actions |

Portability: business logic depends on interfaces (`FirecrawlClient`, `EvaluatorProvider`, `BlobStore`, `JobRunner`), so moving to another cloud means swapping infrastructure modules, not rewriting the app.

## Status

| Item | State |
| --- | --- |
| Local Postgres via Docker | planned (blocked: Docker not installed) |
| Dockerfiles | planned |
| Azure Terraform | planned (Phase 5) |
| CI/CD | planned (Phase 5) |
