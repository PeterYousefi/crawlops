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

import type { ExecutionStrategy } from '@crawlops/shared';
import type { FirecrawlClient, NormalizedSource } from '@crawlops/firecrawl';

export interface StrategyContext {
  taskPrompt: string;
  startingUrls: string[];
  /** Max Firecrawl calls this strategy may make (cost cap). */
  maxFirecrawlCalls: number;
  /** Max search results (cost cap). */
  maxSearchResults: number;
  timeoutMs: number;
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

export function selectStrategy(kind: ExecutionStrategy): Strategy {
  switch (kind) {
    case 'SEARCH':
      return new SearchStrategy();
    // AUTO/SCRAPE/CRAWL/AGENT are planned. AUTO currently maps to SEARCH.
    case 'AUTO':
      return new SearchStrategy();
    default:
      throw new Error(`Strategy ${kind} is not implemented yet.`);
  }
}
