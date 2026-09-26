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
| Firecrawl v2 client (search/scrape) + typed error taxonomy | implemented, unit-tested (mocked) |
| Firecrawl PoC against real API | **blocked on `FIRECRAWL_API_KEY`** |
| PostgreSQL persistence layer (Prisma schema, client, BlobStore) | implemented, typechecked |
| Persistence proof against real Postgres | **blocked on Docker install** |
| Deterministic evaluator (7 checks, rules-based status) | implemented, unit-tested |
| Orchestrator (full loop + bounded retries) | implemented, unit-tested (mocked) |
| Full core-loop proof against real Firecrawl + Postgres | **blocked on `FIRECRAWL_API_KEY` + Docker** |
| Fastify API (health, evaluations, runs) + SSRF guard | implemented, tested (health + degradation) |
| Web starter (typed client, hooks, Overview/Evaluations/Create/Run pages) | implemented, builds |
| OpenAI evaluator (optional) | planned |
| Azure deployment | planned |

## Local setup

Requires Node 20+, pnpm, and (for persistence) Docker.

```bash
pnpm install
cp .env.example .env   # then fill in FIRECRAWL_API_KEY
```

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
