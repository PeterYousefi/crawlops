# CrawlOps — Roadmap

Development is phased. We prove the core loop before building upward.

## Phase 0 — Firecrawl proof of concept
- [x] `packages/shared`: contracts, error taxonomy, logging, config
- [x] `packages/firecrawl`: v2 adapter, mock, typed error mapping, unit tests
- [ ] Real search + scrape against the live Firecrawl API — **blocked on `FIRECRAWL_API_KEY`**

## Phase 0.5 — Persistence proof
- [x] `packages/database`: full Prisma schema, client singleton, BlobStore, seed, verify script
- [x] docker-compose for local PostgreSQL
- [ ] Run migration + store a real Firecrawl result as a Run + read it back — **blocked on Docker install**

## Phase 0.75 — Evaluation proof
- [x] `packages/evaluation`: deterministic evaluator (timeout, source count, non-empty, URL validity, duplicates, schema) + factory with OpenAI fallback
- [x] `packages/orchestrator`: full TASK→FIRECRAWL→RESULT→EVAL→DB loop, bounded retries, JobRunner + Strategy abstractions
- [x] Unit tests: success, retry-then-fail, no-retry-on-auth (mocked)
- [ ] Run `verify-loop` against real Firecrawl + Postgres — **blocked on `FIRECRAWL_API_KEY` + Docker**

## Phase 1 — Local MVP app
- [ ] `apps/api`: Fastify endpoints + `/health`
- [ ] `apps/web`: typed hooks, Create-Evaluation and Run-Details pages
- [ ] Demo evaluation, run for real, view report
- [ ] Unit tests (Firecrawl mocked)

## Phase 2 — Reliability
- [ ] Bounded retries with strategy fallback
- [ ] Attempt tracking, failure categories
- [ ] Metrics aggregation, optional OpenAI grounding evaluator

## Phase 3 — Suites
- [ ] Evaluation suites, batch runs, historical/regression metrics

## Phase 4 — Production frontend
- [ ] Integrate Lovable-generated UI

## Phase 5 — Cloud
- [ ] Docker images, Azure (Container Apps, PostgreSQL, Service Bus, Key Vault, Blob, App Insights), Terraform, CI/CD

## Phase 6 — Advanced
- [ ] Firecrawl Agent + Interact, scheduled regression suites, notifications, provider comparisons, advanced tracing

## Legend
`[x]` implemented · `[ ]` planned. Real-API and deployed states are called out explicitly.
