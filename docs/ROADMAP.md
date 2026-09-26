# CrawlOps — Roadmap

Development is phased. We prove the core loop before building upward.

## Phase 0 — Firecrawl proof of concept ✅
- [x] `packages/shared`: contracts, error taxonomy, logging, config
- [x] `packages/firecrawl`: v2 adapter, mock, typed error mapping, unit tests
- [x] Real search + scrape against the live Firecrawl API (search 3 sources ~1.2s; scrape example.com 200; invalid key → AUTH_ERROR)

## Phase 0.5 — Persistence proof ✅
- [x] `packages/database`: full Prisma schema, client singleton, BlobStore, seed, verify script
- [x] docker-compose for local PostgreSQL (host port 5433)
- [x] Migration applied; real Firecrawl result stored as a Run and read back

## Phase 0.75 — Evaluation proof ✅
- [x] `packages/evaluation`: deterministic evaluator (timeout, source count, non-empty, URL validity, duplicates, schema) + factory with OpenAI fallback
- [x] `packages/orchestrator`: full TASK→FIRECRAWL→RESULT→EVAL→DB loop, bounded retries, JobRunner + Strategy abstractions
- [x] Unit tests: success, retry-then-fail, no-retry-on-auth (mocked)
- [x] `verify-loop` run against real Firecrawl + Postgres (5 sources, 5/5 checks, SUCCESS)

## Phase 1 — Local MVP app ✅
- [x] `apps/api`: Fastify endpoints (evaluations, runs) + `/health` with dependency status + SSRF guard + graceful degradation
- [x] `apps/web`: typed API client + hooks, Overview/Evaluations/Create/Run-Details pages (light theme, minimal)
- [x] Unit tests (Firecrawl mocked): 24 passing across the workspace
- [x] Demo evaluation run for real end-to-end via API + frontend; success and failure (INVALID_SCHEMA) paths both verified with real data

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
