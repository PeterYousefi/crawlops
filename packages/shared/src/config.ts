/**
 * Environment configuration + cost/safety caps.
 *
 * WHAT: Parses process.env into a typed, validated config object with defaults.
 * WHY:  Secrets must come from env (never hardcoded), and cost caps must be
 *       enforced consistently. Optional dependencies (OpenAI) must not break
 *       startup when absent.
 * HOW:  `loadConfig()` validates with Zod; callers that need Firecrawl/DB check
 *       the specific field and degrade gracefully if it is missing.
 */

import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  logLevel: z.string().default('info'),

  // Optional at load time so the app can start and report health degradation.
  firecrawlApiKey: z.string().optional(),
  databaseUrl: z.string().optional(),

  evaluatorProvider: z.enum(['deterministic', 'openai']).default('deterministic'),
  openaiApiKey: z.string().optional(),
  openaiEvaluatorModel: z.string().default('gpt-4o-mini'),

  // Cost/safety caps.
  maxFirecrawlCallsPerRun: z.coerce.number().int().min(1).max(50).default(5),
  maxSearchResults: z.coerce.number().int().min(1).max(20).default(5),
  maxRetries: z.coerce.number().int().min(0).max(5).default(2),
  firecrawlTimeoutMs: z.coerce.number().int().min(1000).max(120_000).default(30_000),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse({
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    firecrawlApiKey: env.FIRECRAWL_API_KEY || undefined,
    databaseUrl: env.DATABASE_URL || undefined,
    evaluatorProvider: env.EVALUATOR_PROVIDER,
    openaiApiKey: env.OPENAI_API_KEY || undefined,
    openaiEvaluatorModel: env.OPENAI_EVALUATOR_MODEL,
    maxFirecrawlCallsPerRun: env.MAX_FIRECRAWL_CALLS_PER_RUN,
    maxSearchResults: env.MAX_SEARCH_RESULTS,
    maxRetries: env.MAX_RETRIES,
    firecrawlTimeoutMs: env.FIRECRAWL_TIMEOUT_MS,
  });
}
