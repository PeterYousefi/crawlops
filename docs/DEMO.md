# CrawlOps — Demo Script (2–3 minutes)

A developer-to-developer walkthrough for showing CrawlOps to Firecrawl engineers. Uses the real UI labels and routes. Keep it plain — this is an engineering demo, not a pitch.

Have ready:
- The app open at the **Overview** page.
- One evaluation with **several past runs** (for the reliability section).
- At least one **failed or partial** run to show (see the backup path if you don't want to trigger one live).

---

## 0:00–0:20 — Problem / what it is

> "Firecrawl does the web research — search, scrape, structured agent extraction. CrawlOps is the layer on top that asks a different question: did the research workflow actually satisfy its contract, and does it keep working over time? A call returning 200 doesn't mean the output was usable."

Point at the **Overview** / **Evaluations** list.

## 0:20–0:50 — Create an evaluation

Go to **Evaluations → New evaluation**.

> "An evaluation is a reusable contract: a research task, optionally an expected output schema, and a minimum number of sources."

- Enter a **Task**, e.g. *"Find the current pricing tiers for a product, with monthly price and seat limits."*
- Paste a small **JSON Schema** in *Expected output*.

> "I can paste a real JSON Schema, or just an example object — CrawlOps normalizes an example into a strict schema so validation is meaningful."

## 0:50–1:20 — AGENT structured research

Select **AGENT** and note the schema is required.

> "SEARCH is fast and lightweight. AGENT does structured, multi-source research through the Firecrawl Agent and needs a schema. Provenance for AGENT comes from the agent's execution trace — the pages it actually fetched."

Click **Create & run**. (It navigates to **Run Details**.)

## 1:20–1:50 — Run Details: provenance + evaluator

On **Run Details**:

> "Here's the full run: status, evaluator score, and the deterministic checks — timeout, source count, non-empty output, URL validity, duplicates, source authority, schema match. Each check is critical or non-critical."

Scroll to **Sources**:

> "Every source gets an authority badge — PRIMARY, SECONDARY, COMMUNITY, or UNKNOWN — plus a source-quality summary and primary-source share. This is a provenance estimate, not a truth score: PRIMARY means first-party/official, not 'guaranteed correct'."

## 1:50–2:20 — A failed or partial run

Open a **FAILED** or **PARTIAL** run.

> "This is the important part. CrawlOps separates 'the Firecrawl call completed' from 'the workflow met its contract.' Here the output didn't match the schema, so it's FAILED with errorCategory INVALID_SCHEMA and the missing fields recorded — but the real sources retrieved are still stored."

(Or, for a PARTIAL:) *"Sources came back, but none was recognized as PRIMARY, so the non-critical authority check failed and the run is PARTIAL — not a hard failure."*

## 2:20–2:50 — Reliability analytics

Go to **Evaluations → [the evaluation with history] → Evaluation Details**.

> "Because every run is persisted, CrawlOps shows reliability over time for this evaluation: success rate, average score, duration, sources, average primary-source share, a failure breakdown, and the run history. This page re-runs nothing — zero Firecrawl calls, zero OpenAI calls. It's observational, not a forecast."

## 2:50–3:00 — Closing

> "So: Firecrawl retrieves; CrawlOps gives the workflow a contract, grades every run deterministically, records provenance and failures, and tracks whether reliability holds up across runs."

---

## Backup demo path (no live AGENT run)

A live AGENT run can be slow or hit rate limits. To keep the demo tight, use **existing persisted runs** instead:

1. **Skip the live run.** After creating the evaluation (or even before), go straight to **Runs**.
2. Open a **successful run** that already has structured output and mixed sources — use it for the Run Details + Source quality section (1:20–1:50).
3. Open a **failed/partial run** from the list for the failure section (1:50–2:20).
4. Open an **Evaluation Details** page that already has multiple runs for the reliability section (2:20–2:50).

This covers every talking point using data already in the database, with no new Firecrawl usage. If you do want one live run, trigger a **SEARCH** run (fast, one Firecrawl call) rather than AGENT.
