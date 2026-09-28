/**
 * Failure taxonomy for CrawlOps.
 *
 * WHAT: A closed set of machine-readable failure categories plus a typed error
 *       class that carries a category and a human-readable message.
 * WHY:  CrawlOps is about reliability engineering. To report *why* an agent run
 *       failed, and to aggregate failures on the Failures page, every failure
 *       must map to a stable category rather than a free-text string.
 * HOW:  The orchestrator/adapters throw `CrawlOpsError` (or map foreign errors
 *       via `classifyError`), and the run record stores `errorCategory`.
 */

export const FailureCategory = {
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT: 'RATE_LIMIT',
  FIRECRAWL_ERROR: 'FIRECRAWL_ERROR',
  NO_RESULTS: 'NO_RESULTS',
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  INSUFFICIENT_SOURCES: 'INSUFFICIENT_SOURCES',
  PARSING_ERROR: 'PARSING_ERROR',
  EVALUATOR_FAILURE: 'EVALUATOR_FAILURE',
  NETWORK_FAILURE: 'NETWORK_FAILURE',
  AUTH_ERROR: 'AUTH_ERROR',
  /** Firecrawl Agent completed but returned no usable structured output. Retryable. */
  AGENT_EMPTY_RESULT: 'AGENT_EMPTY_RESULT',
  /** An AGENT run was requested without an expected schema (client error). */
  AGENT_SCHEMA_REQUIRED: 'AGENT_SCHEMA_REQUIRED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type FailureCategory = (typeof FailureCategory)[keyof typeof FailureCategory];

export interface CrawlOpsErrorOptions {
  category: FailureCategory;
  message: string;
  /** Whether a retry with the same or a different strategy might succeed. */
  retryable?: boolean;
  /** The original underlying error, kept for logs (never exposed to the browser). */
  cause?: unknown;
}

export class CrawlOpsError extends Error {
  readonly category: FailureCategory;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(options: CrawlOpsErrorOptions) {
    super(options.message);
    this.name = 'CrawlOpsError';
    this.category = options.category;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }
}

/**
 * The subset of FailureCategory values that exist in the PostgreSQL enum.
 * AGENT_EMPTY_RESULT / AGENT_SCHEMA_REQUIRED are API/taxonomy-level codes that
 * are NOT in the DB enum (adding them would require a schema migration), so
 * they must be mapped to a persistable value before writing to the database.
 */
export const PERSISTABLE_FAILURE_CATEGORIES: readonly FailureCategory[] = [
  FailureCategory.TIMEOUT,
  FailureCategory.RATE_LIMIT,
  FailureCategory.FIRECRAWL_ERROR,
  FailureCategory.NO_RESULTS,
  FailureCategory.INVALID_SCHEMA,
  FailureCategory.INSUFFICIENT_SOURCES,
  FailureCategory.PARSING_ERROR,
  FailureCategory.EVALUATOR_FAILURE,
  FailureCategory.NETWORK_FAILURE,
  FailureCategory.AUTH_ERROR,
  FailureCategory.UNKNOWN,
];

/**
 * Map any FailureCategory to a value the DB enum accepts. API-only categories
 * are mapped to their closest persistable equivalent; the precise code is kept
 * in the human-readable errorMessage by callers.
 */
export function toPersistableCategory(category: FailureCategory): FailureCategory {
  switch (category) {
    case FailureCategory.AGENT_EMPTY_RESULT:
      return FailureCategory.NO_RESULTS;
    case FailureCategory.AGENT_SCHEMA_REQUIRED:
      return FailureCategory.INVALID_SCHEMA;
    default:
      return (PERSISTABLE_FAILURE_CATEGORIES as FailureCategory[]).includes(category)
        ? category
        : FailureCategory.UNKNOWN;
  }
}

/**
 * Best-effort mapping of an arbitrary thrown value to a CrawlOpsError.
 * Adapters (e.g. the Firecrawl client) should classify precisely; this is the
 * safety net so nothing escapes as an uncategorised failure.
 */
export function classifyError(error: unknown): CrawlOpsError {
  if (error instanceof CrawlOpsError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return new CrawlOpsError({
      category: FailureCategory.TIMEOUT,
      message,
      retryable: true,
      cause: error,
    });
  }
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many')) {
    return new CrawlOpsError({
      category: FailureCategory.RATE_LIMIT,
      message,
      retryable: true,
      cause: error,
    });
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('network') ||
    lower.includes('fetch failed')
  ) {
    return new CrawlOpsError({
      category: FailureCategory.NETWORK_FAILURE,
      message,
      retryable: true,
      cause: error,
    });
  }

  return new CrawlOpsError({
    category: FailureCategory.UNKNOWN,
    message,
    retryable: false,
    cause: error,
  });
}
