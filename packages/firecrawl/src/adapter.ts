/**
 * Firecrawl v2 SDK adapter.
 *
 * WHAT: The single place that imports the `firecrawl` SDK and maps its calls +
 *       errors into CrawlOps' normalized types and failure taxonomy.
 * WHY:  Keeps vendor coupling contained. Adds cost caps (limit), hard timeouts,
 *       and precise error classification (auth / rate-limit / API / network).
 * HOW:  `new FirecrawlAdapter(apiKey)` then `.search()` / `.scrape()` / `.ping()`.
 */

import Firecrawl, { SdkError } from 'firecrawl';
import { CrawlOpsError, FailureCategory } from '@crawlops/shared';
import type {
  FirecrawlClient,
  NormalizedSource,
  ScrapeParams,
  ScrapeResult,
  SearchParams,
  SearchResult,
} from './types.js';

/** Rejects if the given promise does not settle within `ms`. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new CrawlOpsError({
          category: FailureCategory.TIMEOUT,
          message: `${label} timed out after ${ms}ms`,
          retryable: true,
        }),
      );
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Maps a Firecrawl SdkError (or any thrown value) to a categorized CrawlOpsError. */
export function mapFirecrawlError(error: unknown): CrawlOpsError {
  if (error instanceof CrawlOpsError) return error;

  if (error instanceof SdkError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return new CrawlOpsError({
        category: FailureCategory.AUTH_ERROR,
        message: 'Firecrawl authentication failed. Check FIRECRAWL_API_KEY.',
        retryable: false,
        cause: error,
      });
    }
    if (status === 429) {
      return new CrawlOpsError({
        category: FailureCategory.RATE_LIMIT,
        message: 'Firecrawl rate limit exceeded.',
        retryable: true,
        cause: error,
      });
    }
    return new CrawlOpsError({
      category: FailureCategory.FIRECRAWL_ERROR,
      message: `Firecrawl API error${status ? ` (status ${status})` : ''}: ${error.message}`,
      retryable: status !== undefined && status >= 500,
      cause: error,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('fetch failed') ||
    lower.includes('network')
  ) {
    return new CrawlOpsError({
      category: FailureCategory.NETWORK_FAILURE,
      message: `Network failure reaching Firecrawl: ${message}`,
      retryable: true,
      cause: error,
    });
  }

  return new CrawlOpsError({
    category: FailureCategory.FIRECRAWL_ERROR,
    message,
    retryable: false,
    cause: error,
  });
}

// The SDK's search web[] entries are either lightweight results or full Documents.
interface RawWebResult {
  url?: string;
  title?: string;
  description?: string;
  position?: number;
  markdown?: string;
  metadata?: { title?: string; description?: string; sourceURL?: string; url?: string };
}

function normalizeWebEntry(entry: RawWebResult, index: number): NormalizedSource {
  const url = entry.url ?? entry.metadata?.sourceURL ?? entry.metadata?.url ?? '';
  return {
    url,
    title: entry.title ?? entry.metadata?.title ?? null,
    description: entry.description ?? entry.metadata?.description ?? null,
    rank: entry.position ?? index + 1,
    content: entry.markdown ?? null,
  };
}

export class FirecrawlAdapter implements FirecrawlClient {
  private readonly client: Firecrawl;
  private readonly defaultTimeoutMs: number;

  constructor(apiKey: string, opts: { defaultTimeoutMs?: number } = {}) {
    if (!apiKey) {
      throw new CrawlOpsError({
        category: FailureCategory.AUTH_ERROR,
        message: 'FIRECRAWL_API_KEY is required to construct FirecrawlAdapter.',
      });
    }
    this.client = new Firecrawl({ apiKey });
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 30_000;
  }

  async search(query: string, params: SearchParams = {}): Promise<SearchResult> {
    const started = Date.now();
    const limit = params.limit ?? 5;
    const timeoutMs = params.timeoutMs ?? this.defaultTimeoutMs;

    try {
      const req: Record<string, unknown> = { limit, sources: ['web'] };
      if (params.scrapeContent) {
        req.scrapeOptions = { formats: ['markdown'] };
      }
      const data = await withTimeout(
        this.client.search(query, req as never),
        timeoutMs,
        'Firecrawl search',
      );

      const web = (data.web ?? []) as RawWebResult[];
      const sources = web
        .map((entry, i) => normalizeWebEntry(entry, i))
        .filter((s) => s.url.length > 0);

      return {
        query,
        sources,
        creditsUsed: null,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      throw mapFirecrawlError(error);
    }
  }

  async scrape(url: string, params: ScrapeParams = {}): Promise<ScrapeResult> {
    const started = Date.now();
    const timeoutMs = params.timeoutMs ?? this.defaultTimeoutMs;
    try {
      const doc = await withTimeout(
        this.client.scrape(url, { formats: ['markdown'] }),
        timeoutMs,
        'Firecrawl scrape',
      );
      const metadata = doc.metadata ?? {};
      return {
        url,
        title: metadata.title ?? null,
        description: metadata.description ?? null,
        markdown: doc.markdown ?? null,
        statusCode: typeof metadata.statusCode === 'number' ? metadata.statusCode : null,
        creditsUsed: typeof metadata.creditsUsed === 'number' ? metadata.creditsUsed : null,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      throw mapFirecrawlError(error);
    }
  }

  async ping(): Promise<{ ok: boolean; message: string }> {
    try {
      // A tiny search is the cheapest authenticated round-trip available.
      await withTimeout(
        this.client.search('firecrawl', { limit: 1 } as never),
        this.defaultTimeoutMs,
        'Firecrawl ping',
      );
      return { ok: true, message: 'Firecrawl reachable and authenticated.' };
    } catch (error) {
      const mapped = mapFirecrawlError(error);
      return { ok: false, message: `${mapped.category}: ${mapped.message}` };
    }
  }
}
