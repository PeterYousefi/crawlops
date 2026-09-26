# CrawlOps — API Contract

All request/response shapes are defined once as Zod schemas in `packages/shared/src/contracts.ts` and shared by the Fastify API and the web frontend.

## Response envelope

Success: `{ "data": <payload> }`
Error: `{ "error": { "code": string, "category"?: FailureCategory, "message": string } }`

## Endpoints

> ✅ = targeted for MVP · ⏳ = later phase

| Method | Path | Purpose | State |
| --- | --- | --- | --- |
| GET | `/api/health` | Liveness + dependency status (Firecrawl/DB reachability) | ✅ planned |
| POST | `/api/evaluations` | Create an evaluation (test definition) | ✅ planned |
| GET | `/api/evaluations` | List evaluations | ✅ planned |
| GET | `/api/evaluations/:id` | Get one evaluation | ✅ planned |
| POST | `/api/evaluations/:id/run` | Execute a run; returns `runId` | ✅ planned |
| GET | `/api/runs/:id` | Full run report | ✅ planned |
| GET | `/api/runs/:id/attempts` | Attempt history | ✅ planned |
| GET | `/api/runs/:id/sources` | Retrieved sources | ✅ planned |
| GET | `/api/runs/:id/evaluation` | Evaluation result | ✅ planned |
| GET | `/api/metrics` | Aggregate reliability metrics | ⏳ Phase 2 |
| POST/GET | `/api/suites`, `/api/suites/:id/run`, `/api/suites/:id/history` | Evaluation suites | ⏳ Phase 3 |

## Key payloads

See `packages/shared/src/contracts.ts` for the authoritative schemas:
- `createEvaluationSchema` — input to `POST /api/evaluations`
- `runReportSchema` — output of `GET /api/runs/:id` (run + evaluation + attempts + sources + result + final output)
- `metricsSchema` — output of `GET /api/metrics`

## Status

Contracts are **implemented** in the shared package. The health, evaluations
(create/list/get/run), and runs (report/attempts/sources/evaluation) endpoints
are **implemented** in `apps/api` and tested (health + graceful degradation).
User-supplied URLs pass an **SSRF guard** before use. Metrics and suites remain
in later phases.

Run the API locally:

```bash
pnpm --filter @crawlops/api dev   # http://localhost:4000
curl http://localhost:4000/api/health
```
