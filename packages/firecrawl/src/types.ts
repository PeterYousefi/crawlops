/**
 * Normalized Firecrawl types used across CrawlOps.
 *
 * WHAT: CrawlOps-internal shapes that the rest of the app depends on, decoupled
 *       from the raw Firecrawl SDK types.
 * WHY:  If Firecrawl changes its SDK shape, only the adapter changes — the
 *       orchestrator, evaluator and DB layer keep working against these types.
 * HOW:  The adapter maps SDK responses (SearchData, Document) into these.
 */

/** A single normalized source discovered/retrieved from the web. */
export interface NormalizedSource {
  url: string;
  title: string | null;
  description: string | null;
  /** 1-based ranking/order in the result set, when available. */
  rank: number | null;
  /** Full page content (markdown), present only when scraped. */
  content: string | null;
}

export interface SearchResult {
  query: string;
  sources: NormalizedSource[];
  /** Firecrawl credits consumed, when the API reports it. */
  creditsUsed: number | null;
  /** Wall-clock duration of the call, measured by the adapter. */
  durationMs: number;
}

export interface ScrapeResult {
  url: string;
  title: string | null;
  description: string | null;
  markdown: string | null;
  statusCode: number | null;
  creditsUsed: number | null;
  durationMs: number;
}

export interface SearchParams {
  /** Max results to return. Capped by the caller for cost safety. */
  limit?: number;
  /** When true, also scrape each result to markdown (more credits). */
  scrapeContent?: boolean;
  /** Hard timeout in milliseconds. */
  timeoutMs?: number;
}

export interface ScrapeParams {
  timeoutMs?: number;
}

export interface AgentExtractParams {
  /** JSON Schema describing the structured output to produce. */
  schema: Record<string, unknown>;
  /** Optional starting URLs to constrain/seed the research. */
  urls?: string[];
  /** Cost cap in Firecrawl credits. */
  maxCredits?: number;
  /** Hard timeout in milliseconds. */
  timeoutMs?: number;
}

export interface AgentExtractResult {
  /** The structured object Firecrawl's agent produced (schema-shaped) or null. */
  data: unknown;
  /** Whether the agent job completed successfully. */
  completed: boolean;
  /** Source URLs the agent cited/used, when reported. */
  sources: NormalizedSource[];
  creditsUsed: number | null;
  durationMs: number;
}

/**
 * The abstraction the rest of CrawlOps depends on.
 * The real adapter wraps the Firecrawl SDK; the mock implements it for tests.
 */
export interface FirecrawlClient {
  search(query: string, params?: SearchParams): Promise<SearchResult>;
  scrape(url: string, params?: ScrapeParams): Promise<ScrapeResult>;
  /**
   * Structured extraction: hand a research task + JSON Schema to Firecrawl's
   * agent and get back a schema-shaped object synthesized from real sources.
   * Firecrawl-native — no LLM on our side.
   */
  agentExtract(prompt: string, params: AgentExtractParams): Promise<AgentExtractResult>;
  /** Lightweight reachability/auth probe used by the /health endpoint. */
  ping(): Promise<{ ok: boolean; message: string }>;
}
