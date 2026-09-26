/**
 * Evaluator factory.
 *
 * WHAT: Chooses an EvaluatorProvider based on config.
 * WHY:  The rest of the app should ask for "the evaluator" without knowing which
 *       provider is active. If an LLM provider is requested but no key exists,
 *       we fall back to deterministic rather than crashing — optional deps must
 *       never block the app.
 * HOW:  `createEvaluator(config)` returns a provider. Only 'deterministic' is
 *       implemented today; 'openai' is planned (Phase 2) and currently falls
 *       back with a warning.
 */

import { createLogger, type Config } from '@crawlops/shared';
import { DeterministicEvaluator } from './deterministic.js';
import type { EvaluatorProvider } from './types.js';

export function createEvaluator(config: Pick<Config, 'evaluatorProvider' | 'openaiApiKey'>): EvaluatorProvider {
  const logger = createLogger();

  if (config.evaluatorProvider === 'openai') {
    if (!config.openaiApiKey) {
      logger.warn(
        'EVALUATOR_PROVIDER=openai but OPENAI_API_KEY is missing; falling back to deterministic evaluator.',
      );
      return new DeterministicEvaluator();
    }
    // Phase 2: return new OpenAIEvaluator(...). Deterministic for now.
    logger.warn('OpenAI evaluator not yet implemented; using deterministic evaluator.');
    return new DeterministicEvaluator();
  }

  return new DeterministicEvaluator();
}
