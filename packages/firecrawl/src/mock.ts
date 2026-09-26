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
  FirecrawlClient,
  ScrapeParams,
  ScrapeResult,
  SearchParams,
  SearchResult,
} from './types.js';

export interface MockConfig {
  searchResult?: Partial<SearchResult>;
  scrapeResult?: Partial<ScrapeResult>;
  /** If set, calls reject with this error (to exercise failure handling). */
  throwOn?: { search?: CrawlOpsError; scrape?: CrawlOpsError };
}

export class MockFirecrawlClient implements FirecrawlClient {
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

  async ping(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Mock Firecrawl client (no network).' };
  }
}
