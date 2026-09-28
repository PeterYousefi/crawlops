# CrawlOps

**CrawlOps is an evaluation and reliability layer for web research workflows.**

It runs [Firecrawl](https://firecrawl.dev)-powered research tasks, validates structured outputs against explicit contracts, records provenance and failures, and measures reliability across repeated runs.

CrawlOps is **not** a crawler or a Firecrawl replacement. Firecrawl handles web search, scraping, and structured research. CrawlOps sits *above* it as evaluation, observability, and regression infrastructure: it asks "did this research workflow actually satisfy its contract, and does it keep working over time?"

## Links

- **Live demo:** https://crawlops-web.redfield-5f7e6fbf.canadacentral.azurecontainerapps.io
- **Demo video:** https://youtu.be/1shisrFzWMs
- **Presentation:** [docs/CrawlOps-presentation.pdf](docs/CrawlOps-presentation.pdf)

> The live demo is a scale-to-zero deployment, so the first request may take a few seconds to cold-start.

![CrawlOps reliability analytics](docs/images/reliability-analytics.png)

---

## 1. Why CrawlOps exists

A web-research API call returning `200 OK` does not mean the workflow is production-reliable. The call can succeed while the *result* is unusable.

CrawlOps detects, records, and reports on exactly these gaps:

- empty structured result
- output that does not match the required schema
- insufficient sources retrieved
- malformed source URLs
- duplicate sources
- weak or unknown source provenance
- rate limiting and other execution failures
- reliability regressions across repeated runs

Each research workflow gets an explicit **contract** (task + optional expected schema + minimum sources), and **every run is graded against it** by a deterministic evaluator.

## 2. What it does

- **SEARCH** strategy for lightweight retrieval
- **AGENT** strategy for structured, multi-source research (Firecrawl Agent)
- **JSON Schema contracts** for expected output, plus **example-shape normalization** (paste an example object; CrawlOps turns it into a strict schema)
- **Deterministic evaluation** (no LLM required): timeout, source count, non-empty output, URL validity, duplicates, source authority, schema match
- **Bounded retries** and **failure classification** (e.g. `INVALID_SCHEMA`, `RATE_LIMIT`, `NO_RESULTS`)
- **Source provenance** captured from the Firecrawl Agent execution trace
- **Source Authority** classification (provenance estimate: `PRIMARY` / `SECONDARY` / `COMMUNITY` / `UNKNOWN`)
- **Persisted** runs, attempts, and sources in PostgreSQL
- **Run Details** view: status, score, checks, attempts, sources, output
- **Per-evaluation reliability analytics**: historical success rate, average score / duration / sources / primary-source share, failure breakdown, and run history

CrawlOps does **not** currently do: autonomous scheduling, CI/CD integration, statistical forecasting, automatic verification of whether a source's *claims* are true, or multi-user authentication.

## 3. SEARCH vs AGENT

| | SEARCH | AGENT |
| --- | --- | --- |
| Speed | Fast | Slower |
| Firecrawl usage | Lower | Higher |
| Output shape | Search/retrieval result | Structured object |
| Expected schema | Optional | Required |
| Provenance | Search result URLs | Real pages fetched, from the agent trace |

Choosing **SEARCH** with a structured schema the search shape cannot satisfy will correctly fail evaluation (`INVALID_SCHEMA`). That is intentional — the contract was not met — not a bug.

## 4. How evaluation works

```
Research task
      ↓
SEARCH / AGENT (Firecrawl)
      ↓
Sources + output
      ↓
Deterministic checks
      ↓
SUCCESS / PARTIAL / FAILED
      ↓
Persist run (+ attempts, sources)
      ↓
Reliability analytics
```

Status semantics:

- **FAILED** — at least one **critical** check failed.
- **PARTIAL** — all critical checks passed, but at least one **non-critical** quality check failed.
- **SUCCESS** — all checks passed.

Current deterministic checks:

| Check | Critical? | Meaning |
| --- | --- | --- |
| Completed within timeout | critical | The run did not exceed its timeout. |
| Retrieved enough sources | critical | Source count ≥ the configured minimum. |
| Produced a non-empty result | critical | Output is present and non-empty. |
| Output matches expected schema | critical* | Validates against the schema (*only when a schema is provided). |
| All source URLs are valid | non-critical | Every source URL is a well-formed http(s) URL. |
| No duplicate sources | non-critical | No repeated source URLs. |
| Used authoritative sources | **non-critical** | At least one `PRIMARY` source. Estimates **provenance, not factual truth**. |

Because Source Authority is non-critical, a run with good output but weak sources becomes **PARTIAL**, never a hard **FAILED**.

## 5. Source Authority

Each source URL is classified into one of four buckets:

- **PRIMARY** — recognized first-party/official/vendor domain, or government/academic (`.gov`, `.edu`, …).
- **SECONDARY** — known news, publication, or comparison site.
- **COMMUNITY** — community/social discussion platform (e.g. Reddit, Q&A, social).
- **UNKNOWN** — not enough deterministic information to classify confidently.

Classification is **deterministic**, **URL/domain-based**, **conservative**, uses **no LLM**, and makes **no extra network call**. Hostname matching is boundary-safe, so `docs.github.com` maps to `github.com` (PRIMARY) while a lookalike such as `evilgithub.com` does not.

Limitations, stated plainly: a `PRIMARY` source is **not** automatically factually correct, a `COMMUNITY` source is **not** automatically wrong, and `UNKNOWN` simply means CrawlOps cannot confidently classify the domain. This is a **provenance estimate, not a truth score**.

![Source quality summary](docs/images/source-quality.png)

## 6. Reliability analytics

CrawlOps analyzes **already-persisted runs** — it never re-runs anything to build analytics. For a given evaluation it reports:

- success rate (SUCCESS / terminal runs)
- average score
- average duration
- average sources
- average primary-source share
- failure categories
- recent run history

Loading the analytics page consumes **zero Firecrawl calls and zero OpenAI calls**. Metrics are observational; CrawlOps does not claim statistical significance or forecast future behavior.

## 7. Architecture

```mermaid
flowchart TD
    Browser["Browser"] --> Web["React / Vite (crawlops-web)"]
    Web --> API["Fastify API (crawlops-api)"]
    API --> DB[("PostgreSQL / Prisma")]
    API --> FC["Firecrawl (external research provider)"]
```

Production topology (Azure):

```mermaid
flowchart LR
    subgraph ACA["Azure Container Apps (scale 0 → 1)"]
      W["crawlops-web (nginx)"]
      A["crawlops-api (Fastify)"]
    end
    ACR["Azure Container Registry (private images)"] --> W
    ACR --> A
    W --> A
    A --> PG[("Azure PostgreSQL Flexible Server")]
    A --> FC["Firecrawl"]
```

- `crawlops-web` and `crawlops-api` are **separate containers**.
- Both **scale to zero** when idle.
- PostgreSQL stores evaluation / run / attempt / source history.
- Firecrawl is the **external** research provider.

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 8. Technology stack

**Frontend:** React, Vite, TypeScript, Tailwind CSS, react-router
**Backend:** Fastify, TypeScript, Zod
**Data:** PostgreSQL, Prisma
**Research:** Firecrawl (SDK v2)
**Monorepo / build:** pnpm workspaces, Turborepo
**Deployment:** Docker, Azure Container Apps, Azure Container Registry, Azure PostgreSQL Flexible Server
**Testing:** Vitest (unit/integration), plus browser smoke verification for UI

## 9. Repository structure

```
apps/
  api/          # Fastify API: routes, serializers, health/readiness, SSRF guard
  web/          # React + Vite UI: evaluations, runs, reliability analytics
packages/
  shared/       # Zod contracts, enums, error taxonomy, source-authority rules, logging
  evaluation/   # Deterministic evaluator (checks → SUCCESS/PARTIAL/FAILED)
  orchestrator/ # Execution loop, SEARCH/AGENT strategies, bounded retries
  firecrawl/    # Firecrawl client interface + v2 adapter + mock
  database/     # Prisma schema and client
infrastructure/
  docker/       # local PostgreSQL (docker-compose)
docs/           # ARCHITECTURE, DEMO, LOCAL_DEVELOPMENT, and reference docs
```

## 10. Local development

**Prerequisites:** Node ≥ 20, pnpm 9, Docker (for local PostgreSQL), and a Firecrawl API key.

```bash
pnpm install
cp .env.example .env          # then set FIRECRAWL_API_KEY

# Start local PostgreSQL (host port 5433 to avoid clashing with a local pg on 5432)
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Apply the schema (Prisma CLI needs DATABASE_URL exported in the shell)
export DATABASE_URL="postgresql://crawlops:crawlops@localhost:5433/crawlops?schema=public"
pnpm --filter @crawlops/database exec prisma migrate deploy

# Run API and web (separate terminals)
pnpm --filter @crawlops/api dev    # http://localhost:4000
pnpm --filter @crawlops/web dev    # http://localhost:5173
```

The Docker PostgreSQL is published on host port **5433** (the container listens on 5432 internally). Full details: [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md).

## 11. Running tests

```bash
pnpm typecheck                       # type-check every package
pnpm test                            # run all unit/integration tests (Vitest); never calls paid Firecrawl
pnpm --filter @crawlops/web build    # production web build

# Optional: build the production API image exactly as deployed
docker build -f apps/api/Dockerfile -t crawlops-api:local .
```

## 12. Example workflow

1. Open **Evaluations → New evaluation**.
2. Enter a research task, e.g. *"Find the current pricing tiers for a product, with monthly price and seat limits."*
3. Select **AGENT** (structured research).
4. Paste a JSON Schema for the expected output:
   ```json
   {
     "type": "object",
     "required": ["productName", "tiers"],
     "properties": {
       "productName": { "type": "string" },
       "tiers": {
         "type": "array",
         "items": {
           "type": "object",
           "required": ["name", "monthlyPrice"],
           "properties": {
             "name": { "type": "string" },
             "monthlyPrice": { "type": "string" }
           }
         }
       }
     }
   }
   ```
5. **Create & run**.
6. Open **Run Details** to inspect output, sources (with authority badges), and the deterministic checks.
7. Run the same evaluation again later.
8. Open **Evaluation Details** for that evaluation.
9. Review its **reliability history**: success rate, averages, primary-source share, and failure breakdown.

## 13. Failure honesty

CrawlOps deliberately separates two very different questions:

> **Did the Firecrawl call complete?** vs. **Did the research workflow satisfy its contract?**

Examples of the second question failing even when the first succeeds:

- Agent returns empty `data` → CrawlOps **retries** (bounded).
- Output violates the JSON Schema → `FAILED`, `errorCategory = INVALID_SCHEMA`, missing fields recorded.
- Sources are present but none is recognized as `PRIMARY` → the run is **PARTIAL** (non-critical authority check failed), and the real sources are still recorded.

This contract-level honesty — recording *why* a workflow did or did not meet its bar — is the core of the project.

## 14. Production / deployment

The production deployment runs on:

- **Azure Container Apps** — `crawlops-web` and `crawlops-api` as separate, scale-to-zero containers.
- **Private Azure Container Registry** — images are pulled with a registry-scoped token.
- **Azure PostgreSQL Flexible Server** — evaluation/run/source history.
- **App secrets** — database URL and Firecrawl key are stored as Container App secrets, never in the image.

Deployment is image-based (build → push to ACR → update the Container App image), which preserves probes, secrets, ingress, and scale settings. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the high-level process. No credentials, connection strings, or subscription identifiers are stored in this repository.

## 15. Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — component boundaries, evaluation lifecycle, SEARCH/AGENT flows, provenance, persistence, analytics, production topology
- [`docs/DEMO.md`](docs/DEMO.md) — a 2–3 minute walkthrough script
- [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md) — detailed local setup and commands
- [`docs/API.md`](docs/API.md) — API contract reference
- [`docs/EVALS.md`](docs/EVALS.md) — evaluation methodology and metric definitions

## License

MIT
