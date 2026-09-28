/**
 * Execution strategies.
 *
 * WHAT: The `Strategy` interface plus the SEARCH implementation. A strategy
 *       turns a task into retrieved sources + a normalized output using the
 *       FirecrawlClient.
 * WHY:  CrawlOps supports multiple execution approaches (SEARCH/SCRAPE/CRAWL/
 *       AGENT/AUTO). Each is a strategy behind one interface so the orchestrator
 *       and retry logic stay strategy-agnostic. Only SEARCH is built for the MVP.
 * HOW:  `strategy.execute(context)` returns sources, output, and call count.
 */

import { CrawlOpsError, FailureCategory, type ExecutionStrategy } from '@crawlops/shared';
import { normalizeToJsonSchema } from '@crawlops/evaluation';
import type { FirecrawlClient, NormalizedSource } from '@crawlops/firecrawl';

export interface StrategyContext {
  taskPrompt: string;
  startingUrls: string[];
  /** Max Firecrawl calls this strategy may make (cost cap). */
  maxFirecrawlCalls: number;
  /** Max search results (cost cap). */
  maxSearchResults: number;
  timeoutMs: number;
  /** The evaluation's expected output schema (JSON Schema or example shape). */
  expectedSchema?: Record<string, unknown> | null;
  /** Cost cap in Firecrawl credits for agent-based extraction. */
  maxAgentCredits?: number;
}

export interface StrategyOutput {
  sources: NormalizedSource[];
  /** Normalized final output (structured or text). Kept small for storage. */
  output: unknown;
  firecrawlCallCount: number;
}

export interface Strategy {
  readonly kind: ExecutionStrategy;
  execute(client: FirecrawlClient, context: StrategyContext): Promise<StrategyOutput>;
}

/**
 * SEARCH strategy: one Firecrawl search call. Cheapest, single round-trip.
 * The "output" is a compact summary of what was found — the deterministic
 * evaluator judges source count / validity; richer extraction comes later.
 */
export class SearchStrategy implements Strategy {
  readonly kind = 'SEARCH' as const;

  async execute(client: FirecrawlClient, context: StrategyContext): Promise<StrategyOutput> {
    const search = await client.search(context.taskPrompt, {
      limit: context.maxSearchResults,
      timeoutMs: context.timeoutMs,
    });

    const output = {
      query: search.query,
      resultCount: search.sources.length,
      topResults: search.sources.slice(0, 5).map((s) => ({
        title: s.title,
        url: s.url,
      })),
    };

    return {
      sources: search.sources,
      output,
      firecrawlCallCount: 1,
    };
  }
}

/**
 * AGENT strategy: structured extraction via Firecrawl's research agent.
 *
 * Hands the task + the evaluation's expected schema to Firecrawl's agent, which
 * researches real sources and returns a schema-shaped object (Firecrawl-native;
 * no LLM on our side, no fabricated values). The object becomes the run's final
 * output, which the deterministic evaluator then validates against the same
 * schema. If a field cannot be supported from sources, the agent omits it and
 * the evaluator fails honestly.
 */
export class AgentStrategy implements Strategy {
  readonly kind = 'AGENT' as const;

  async execute(client: FirecrawlClient, context: StrategyContext): Promise<StrategyOutput> {
    if (!context.expectedSchema) {
      // Structured extraction needs a target schema to be meaningful.
      throw new Error('AGENT strategy requires an expected output schema.');
    }
    // Normalize a pasted example object into a strict JSON Schema so the agent
    // is asked for the exact fields the user expects (same normalization the
    // evaluator uses, so extraction and validation agree).
    const schema = normalizeToJsonSchema(context.expectedSchema);

    const result = await client.agentExtract(context.taskPrompt, {
      schema,
      urls: context.startingUrls.length > 0 ? context.startingUrls : undefined,
      maxCredits: context.maxAgentCredits,
      timeoutMs: context.timeoutMs,
    });

    // A "completed" agent run with null/empty structured output is NOT a usable
    // success. Treat it as a RETRYABLE error so the orchestrator retries; if
    // every attempt is empty, the run fails with a clear AGENT_EMPTY_RESULT
    // (never mislabelled INVALID_SCHEMA — there was no output to validate).
    if (!result.completed || result.data == null) {
      throw new CrawlOpsError({
        category: FailureCategory.AGENT_EMPTY_RESULT,
        message: !result.completed
          ? 'Firecrawl Agent did not complete with a usable result.'
          : 'Firecrawl Agent completed but returned empty structured output.',
        retryable: true,
      });
    }

    // The final output is exactly what Firecrawl returned. We do NOT synthesize
    // or fill any fields ourselves. Sources are the real pages the agent fetched
    // (from its execution trace), not arbitrary output fields.
    return {
      sources: result.sources,
      output: result.data,
      firecrawlCallCount: 1,
    };
  }
}

export function selectStrategy(kind: ExecutionStrategy): Strategy {
  switch (kind) {
    case 'SEARCH':
      return new SearchStrategy();
    case 'AGENT':
      return new AgentStrategy();
    // AUTO currently maps to SEARCH (cheapest). SCRAPE/CRAWL are planned.
    case 'AUTO':
      return new SearchStrategy();
    default:
      throw new Error(`Strategy ${kind} is not implemented yet.`);
  }
}
