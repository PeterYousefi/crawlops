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
  AgentExtractParams,
  AgentExtractResult,
  FirecrawlClient,
  NormalizedSource,
  ScrapeParams,
  ScrapeResult,
  SearchParams,
  SearchResult,
} from './types.js';

/**
 * Is the agent's structured output effectively empty/unusable? A "completed"
 * agent run with null/empty data is NOT a usable success.
 */
export function isEmptyStructuredOutput(data: unknown): boolean {
  if (data == null) return true;
  if (typeof data === 'string') return data.trim().length === 0;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') return Object.keys(data as object).length === 0;
  return false;
}

/**
 * Filter provenance URLs to real content pages: http(s), and not obvious asset
 * noise (images, fonts, CDNs). Best-effort — keeps genuine sources, drops junk.
 */
export function isLikelyProvenanceUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|mp4|pdf)(\?|$)/i.test(url)) return false;
  if (/(cdn|assets?|static|media|fonts?)\./i.test(url)) return false;
  return true;
}

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

  async agentExtract(prompt: string, params: AgentExtractParams): Promise<AgentExtractResult> {
    const started = Date.now();
    const timeoutMs = params.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutSeconds = Math.ceil(timeoutMs / 1000);
    try {
      const req: Record<string, unknown> = {
        prompt,
        schema: params.schema,
        model: 'spark-1-mini', // cheapest agent model
        timeout: timeoutSeconds,
      };
      if (params.maxCredits != null) req.maxCredits = params.maxCredits;
      if (params.urls && params.urls.length > 0) req.urls = params.urls;

      // Start the job so we get a jobId, then poll to completion. This lets us
      // fetch the execution trace afterwards for REAL source provenance.
      const startRes = await this.client.startAgent(req as never);
      const jobId = startRes.id;

      const deadline = started + timeoutMs;
      let status: { status?: string; data?: unknown; creditsUsed?: number } = {};
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        status = (await this.client.getAgentStatus(jobId)) as typeof status;
        if (status.status && status.status !== 'processing') break;
      }
      const completed = status.status === 'completed';

      // Provenance: pull the URLs the agent actually fetched from its trace.
      const sources = await this.collectAgentSources(jobId);

      const data = status.data ?? null;
      return {
        data: isEmptyStructuredOutput(data) ? null : data,
        completed,
        sources,
        creditsUsed: typeof status.creditsUsed === 'number' ? status.creditsUsed : null,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      throw mapFirecrawlError(error);
    }
  }

  /**
   * Fetch the agent's execution trace and derive REAL source provenance from
   * the tools it invoked: the pages it scraped (tool_call params.url/urls) and,
   * as a fallback, URLs surfaced in tool results (search hits). Best-effort —
   * a trace failure must not fail the run, but yields zero sources.
   */
  private async collectAgentSources(jobId: string): Promise<NormalizedSource[]> {
    try {
      const trace = (await this.client.getAgentTrace(jobId)) as {
        events?: Array<{ type?: string; parameters?: unknown; result?: unknown }>;
      };
      const events = trace.events ?? [];
      const fetched = new Set<string>(); // pages the agent chose to scrape
      const seen = new Set<string>(); // any page URL found in results (fallback)

      const grabInto = (target: Set<string>, v: unknown, depth = 0): void => {
        if (depth > 8 || v == null) return;
        if (typeof v === 'string') {
          const m = v.match(/https?:\/\/[^\s"')<>]+/g);
          if (m) for (const u of m) target.add(u);
          return;
        }
        if (Array.isArray(v)) {
          for (const x of v) grabInto(target, x, depth + 1);
          return;
        }
        if (typeof v === 'object') {
          for (const x of Object.values(v as Record<string, unknown>)) grabInto(target, x, depth + 1);
        }
      };

      for (const e of events) {
        if (e.type === 'tool_call.started') {
          const p = (e.parameters ?? {}) as { url?: unknown; urls?: unknown };
          if (typeof p.url === 'string') grabInto(fetched, p.url);
          if (Array.isArray(p.urls)) grabInto(fetched, p.urls);
        } else if (e.type === 'tool_call.finished') {
          grabInto(seen, e.result);
        }
      }

      // Prefer explicitly-fetched pages; fall back to result URLs if none.
      const chosen = fetched.size > 0 ? [...fetched] : [...seen];
      const pages = chosen.filter(isLikelyProvenanceUrl);
      return pages.map((url, i) => ({
        url,
        title: null,
        description: null,
        rank: i + 1,
        content: null,
      }));
    } catch {
      return [];
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
