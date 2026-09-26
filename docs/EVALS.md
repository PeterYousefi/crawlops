# CrawlOps — Evaluation Methodology

Evaluation is the heart of CrawlOps. We do **not** simply ask an LLM "is this good?". Evaluation has layers, starting with deterministic checks that need no LLM and cost nothing.

## Layer 1 — Deterministic checks *(planned, no LLM required)*

Each check returns `{ id, label, passed, critical, detail }`.

| Check | What it verifies |
| --- | --- |
| JSON schema validation | Output matches the user's expected JSON schema |
| Required fields | Declared required fields are present and non-empty |
| Malformed JSON | Output parses as valid JSON when a schema is expected |
| URL validity | Every source URL is a well-formed http/https URL |
| Duplicate sources | No duplicate source URLs |
| Source count | At least `minSources` usable sources were retrieved |
| Timeout | Execution stayed within the configured timeout |

**Status decision (rules-based):**
- All critical checks pass → `SUCCESS`
- Non-critical checks fail → `PARTIAL`
- A critical check fails (e.g. schema invalid, no results) → `FAILED`

## Layer 2 — Source grounding *(planned, optional LLM)*

When an LLM provider is configured, evaluate whether returned claims are supported by retrieved source content, producing:

```json
{
  "score": 0.87,
  "supportedClaims": 12,
  "unsupportedClaims": 2,
  "missingFields": [],
  "reasoningSummary": "concise explanation",
  "recommendation": "pass"
}
```

We store only a **concise** reasoning summary — never hidden chain-of-thought. The app runs fully without an LLM key; grounding is simply absent.

## Metric definitions (honest semantics)

- **Success rate** — `SUCCESS / total`. `PARTIAL` is not counted as success unless explicitly configured.
- **Latency** — wall-clock ms per run; we report avg, median, and p95.
- **Schema validity %** — share of runs whose output passed schema validation.
- **Grounded %** — share of runs with an LLM grounding score above threshold (only when the LLM evaluator ran).
- **overallScore** — a documented weighted pass ratio of checks. It is a **heuristic**, not an objective truth, and is labeled as such in the UI.

Metrics are always computed from stored execution records. We never fabricate them.

## Status

| Layer | State |
| --- | --- |
| Deterministic checks | tested locally end-to-end (real Firecrawl data) |
| LLM grounding (OpenAI provider) | planned (factory falls back to deterministic) |
| Metric aggregation | planned |

## Verified examples (real executions)

**Pass:** task "Find Firecrawl official homepage…" (SEARCH) returned 3 real
sources; all 5 deterministic checks passed (timeout, source count, non-empty
output, URL validity, no duplicates) → score 100%, recommendation `pass`,
status `SUCCESS`.

**Fail:** the same style of task with an expected schema requiring a missing
field produced `SUCCESS` on retrieval but a failing critical `schema_validation`
check → `missingFields=["nonexistentField"]`, recommendation `fail`, run status
`FAILED`, `errorCategory=INVALID_SCHEMA`. The real sources retrieved are still
recorded, so the failure is fully explainable.
