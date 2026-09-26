/**
 * Application context — dependency wiring with graceful degradation.
 *
 * WHAT: Builds the shared dependencies (config, prisma, blobstore, evaluator,
 *       and — only if a key exists — the Firecrawl client + orchestrator).
 * WHY:  Optional dependencies must not stop the app from starting. If
 *       FIRECRAWL_API_KEY is missing, the API still boots and /health reports it;
 *       run endpoints return a clear error instead of crashing.
 * HOW:  `buildContext()` is called once at startup; routes read from it.
 */

import { loadConfig, createLogger, type Config, type Logger } from '@crawlops/shared';
import { prisma, LocalBlobStore, type BlobStore } from '@crawlops/database';
import { FirecrawlAdapter, type FirecrawlClient } from '@crawlops/firecrawl';
import { createEvaluator, type EvaluatorProvider } from '@crawlops/evaluation';
import { Orchestrator } from '@crawlops/orchestrator';

export interface AppContext {
  config: Config;
  logger: Logger;
  prisma: typeof prisma;
  blobs: BlobStore;
  evaluator: EvaluatorProvider;
  /** Present only when FIRECRAWL_API_KEY is configured. */
  firecrawl: FirecrawlClient | null;
  /** Present only when Firecrawl is available (needs a client to run). */
  orchestrator: Orchestrator | null;
}

export function buildContext(): AppContext {
  const config = loadConfig();
  const logger = createLogger();
  const blobs = new LocalBlobStore();
  const evaluator = createEvaluator(config);

  let firecrawl: FirecrawlClient | null = null;
  let orchestrator: Orchestrator | null = null;

  if (config.firecrawlApiKey) {
    firecrawl = new FirecrawlAdapter(config.firecrawlApiKey, {
      defaultTimeoutMs: config.firecrawlTimeoutMs,
    });
    orchestrator = new Orchestrator({
      prisma,
      firecrawl,
      evaluator,
      blobs,
      maxSearchResults: config.maxSearchResults,
      logger,
    });
  } else {
    logger.warn('FIRECRAWL_API_KEY not set — run endpoints will return a clear error.');
  }

  return { config, logger, prisma, blobs, evaluator, firecrawl, orchestrator };
}
