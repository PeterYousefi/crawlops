# CrawlOps

**An evaluation and observability platform for AI web-research agents, built on [Firecrawl](https://firecrawl.dev).**

Most tools that use an AI agent to research the web just show you the answer. CrawlOps measures **how well the research actually worked**: did it find usable sources, did the output match the required schema, how long did it take, how many retries were needed, what failed, and is reliability improving over time.

Think of it as testing and observability infrastructure for AI web-research agents.

> **Status:** early development. Feature states are tracked honestly below and in [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Why it exists

AI web-research agents are non-deterministic and fail in messy ways: no results, rate limits, malformed output, unsupported claims. Shipping them responsibly means being able to answer "how often does this actually work, and why does it fail?" CrawlOps captures every execution — sources, attempts, retries, failure categories, latency, and evaluation scores — so an engineer can trust (or debug) the agent.

## What makes it different

1. **Evaluation** — we don't just retrieve web data, we measure whether retrieval worked (deterministic checks now, optional LLM grounding later).
2. **Reliability** — we record failures, retries, and recovery behavior as first-class data.
3. **Observability** — a single agent execution is fully traceable and understandable to a human.

---

## The core loop

```
TASK → FIRECRAWL → RESULT → EVALUATION → DATABASE → READ RESULT BACK
```

Everything else (suites, analytics, cloud deployment) is built on top of this loop.

## Technology stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript |
| Monorepo | pnpm workspaces + Turborepo |
| API | Fastify |
| Web data | Firecrawl SDK v2 (`firecrawl` npm, v4.x) |
| Database | PostgreSQL + Prisma |
| Validation / contracts | Zod (shared package) |
| Evaluation | Deterministic engine (LLM provider optional) |
| Logging | pino (structured, trace IDs) |
| Local infra | Docker (PostgreSQL) |
| Frontend | React starter (final UI via Lovable) |

## Repository structure

```
apps/
  api/                # Fastify API
  web/                # React starter (Lovable UI later)
packages/
  shared/             # Zod contracts, enums, error taxonomy, logging, config
  firecrawl/          # FirecrawlClient interface + v2 adapter + mock
  evaluation/         # EvaluatorProvider interface + deterministic evaluator
  orchestrator/       # execution loop, strategies, job runner
  database/           # Prisma schema, client, migrations, seed
infrastructure/
  docker/             # local PostgreSQL
  azure/terraform/    # cloud (Phase 5)
docs/                 # ARCHITECTURE, EVALS, API, DEPLOYMENT, ROADMAP
```

## Feature status

| Capability | State |
| --- | --- |
| Firecrawl v2 client (search/scrape) + typed error taxonomy | **tested against real Firecrawl API** |
| PostgreSQL persistence layer (Prisma schema, client, BlobStore) | **tested with local PostgreSQL** |
| Deterministic evaluator (7 checks, rules-based status) | implemented, unit-tested |
| Orchestrator (full loop + bounded retries) | **tested locally end-to-end** |
| Fastify API (health, evaluations, runs) + SSRF guard | **tested locally end-to-end** |
| Web starter (typed client, hooks, Overview/Evaluations/Create/Run pages) | **tested locally against real API** |
| OpenAI evaluator (optional) | planned |
| Azure deployment | planned |

### Verified end-to-end (real dependencies)

The complete loop was run locally against the **real Firecrawl API** and a **local PostgreSQL** (Docker):

```
Task:     "Find Firecrawl official homepage and return its title and description."
Strategy: SEARCH
Result:   SUCCESS in 835 ms, 1 attempt, 1 Firecrawl call
Sources:  3 real results, top = https://www.firecrawl.dev/
Eval:     deterministic, 5/5 checks passed, score 100%, recommendation "pass"
Stored:   Run + ExecutionAttempt + 3 Source rows + EvaluationResult in PostgreSQL
```

Failure handling is real too: an evaluation with an expected schema requiring a
field the output lacks yields `status=FAILED`, `errorCategory=INVALID_SCHEMA`,
and `missingFields=["…"]`, while still recording the real sources retrieved.

## Local setup

Requires Node 20+, pnpm, and (for persistence) Docker.

```bash
pnpm install
cp .env.example .env                  # then fill in FIRECRAWL_API_KEY

# start local PostgreSQL (host port 5433 to avoid clashing with a local pg)
docker compose -f infrastructure/docker/docker-compose.yml up -d

# apply migrations (DATABASE_URL must be set in the shell for the Prisma CLI)
export DATABASE_URL="postgresql://crawlops:crawlops@localhost:5433/crawlops?schema=public"
pnpm --filter @crawlops/database exec prisma migrate deploy

# run API + web (in separate terminals)
pnpm --filter @crawlops/api dev       # http://localhost:4000
pnpm --filter @crawlops/web dev       # http://localhost:5173 (proxies /api -> 4000)
```

> **Port note:** the Docker PostgreSQL is published on host port **5433** because
> port 5432 is commonly occupied by a local/Homebrew PostgreSQL. The container
> still listens on 5432 internally.

### Environment configuration

See [`.env.example`](.env.example). The only mandatory secret for real execution is `FIRECRAWL_API_KEY`. Everything else has safe defaults; optional dependencies (OpenAI, Redis, cloud) must never block the app from running.

### Run the Firecrawl proof of concept

```bash
FIRECRAWL_API_KEY=fc-... pnpm --filter @crawlops/firecrawl poc
```

### Running tests

```bash
pnpm test        # all packages; never calls the paid Firecrawl API
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design and diagram
- [`docs/EVALS.md`](docs/EVALS.md) — evaluation methodology and metric definitions
- [`docs/API.md`](docs/API.md) — API contract
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — cloud deployment overview
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased plan

## Cost & safety

CrawlOps uses paid APIs, so cost controls are built in: capped Firecrawl calls per run, capped search results, bounded retries, strict timeouts, no auto-running benchmark suites, and mocked Firecrawl in normal tests. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#cost--security).

## License

MIT
