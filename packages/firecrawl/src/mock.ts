/**
 * In-memory mock FirecrawlClient.
 *
 * WHAT: A deterministic FirecrawlClient implementation for tests and local dev
 *       without an API key.
 * WHY:  Cost safety — normal unit tests must never call the paid Firecrawl API.
 *       Also lets the orchestrator and API be developed before a key exists.
 * HOW:  Construct with canned responses, or let it return sensible defaults.
 *       Configure it to throw a specific CrawlOpsError to test failure paths.
 */

import { CrawlOpsError } from '@crawlops/shared';
import type {
  AgentExtractParams,
  AgentExtractResult,
  FirecrawlClient,
  ScrapeParams,
  ScrapeResult,
  SearchParams,
  SearchResult,
} from './types.js';

export interface MockConfig {
  searchResult?: Partial<SearchResult>;
  scrapeResult?: Partial<ScrapeResult>;
  agentExtractResult?: Partial<AgentExtractResult>;
  /**
   * A sequence of agentExtract results returned one-per-call (to test retry
   * behavior, e.g. [empty, valid]). Takes precedence over agentExtractResult.
   */
  agentExtractSequence?: Array<Partial<AgentExtractResult>>;
  /** If set, calls reject with this error (to exercise failure handling). */
  throwOn?: { search?: CrawlOpsError; scrape?: CrawlOpsError; agentExtract?: CrawlOpsError };
}

export class MockFirecrawlClient implements FirecrawlClient {
  private agentCallIndex = 0;
  constructor(private readonly config: MockConfig = {}) {}

  async search(query: string, _params: SearchParams = {}): Promise<SearchResult> {
    if (this.config.throwOn?.search) throw this.config.throwOn.search;
    return {
      query,
      sources: [
        {
          url: 'https://example.com/pricing',
          title: 'Example Pricing',
          description: 'Pricing details for Example.',
          rank: 1,
          content: null,
        },
      ],
      creditsUsed: 0,
      durationMs: 5,
      ...this.config.searchResult,
    };
  }

  async scrape(url: string, _params: ScrapeParams = {}): Promise<ScrapeResult> {
    if (this.config.throwOn?.scrape) throw this.config.throwOn.scrape;
    return {
      url,
      title: 'Example Page',
      description: 'A mock page.',
      markdown: '# Example\n\nMock content.',
      statusCode: 200,
      creditsUsed: 0,
      durationMs: 5,
      ...this.config.scrapeResult,
    };
  }

  async agentExtract(_prompt: string, _params: AgentExtractParams): Promise<AgentExtractResult> {
    if (this.config.throwOn?.agentExtract) throw this.config.throwOn.agentExtract;
    const base: AgentExtractResult = {
      data: { example: 'mock structured output' },
      completed: true,
      sources: [
        { url: 'https://example.com/source', title: null, description: null, rank: 1, content: null },
      ],
      creditsUsed: 0,
      durationMs: 5,
    };
    if (this.config.agentExtractSequence && this.config.agentExtractSequence.length > 0) {
      const i = Math.min(this.agentCallIndex, this.config.agentExtractSequence.length - 1);
      this.agentCallIndex += 1;
      return { ...base, ...this.config.agentExtractSequence[i] };
    }
    return { ...base, ...this.config.agentExtractResult };
  }

  async ping(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Mock Firecrawl client (no network).' };
  }
}
