/**
 * Structured logging for CrawlOps.
 *
 * WHAT: A pino-based JSON logger plus a helper to bind trace identifiers.
 * WHY:  Observability is a core differentiator. A single evaluation execution
 *       must be traceable across the API, orchestrator, Firecrawl adapter and
 *       evaluator using stable identifiers (requestId, runId, attemptId).
 * HOW:  Call `createLogger()` once, then `logger.child({ runId, attemptId })`
 *       to attach identifiers that appear on every subsequent log line.
 */

import { pino, type Logger } from 'pino';

export type { Logger };

export interface TraceContext {
  requestId?: string;
  runId?: string;
  attemptId?: string;
}

let rootLogger: Logger | undefined;

export function createLogger(): Logger {
  if (!rootLogger) {
    rootLogger = pino({
      level: process.env.LOG_LEVEL ?? 'info',
      // Keep raw JSON in production; pretty-printing is a dev-only concern
      // handled by piping through `pino-pretty` if desired.
      base: { service: 'crawlops' },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
  return rootLogger;
}

export function withTrace(logger: Logger, trace: TraceContext): Logger {
  return logger.child(trace);
}
