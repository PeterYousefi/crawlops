/**
 * Evaluator interface + shared evaluation types.
 *
 * WHAT: The `EvaluatorProvider` interface that all evaluators implement, plus
 *       the input/output shapes.
 * WHY:  The application must not depend on a specific evaluator. Deterministic
 *       evaluation works with no LLM; an OpenAI provider can be added later
 *       behind the same interface, and the app runs fully without it.
 * HOW:  The orchestrator calls `evaluator.evaluate(input)` and stores the result.
 */

import type {
  EvaluationCheck,
  EvaluationRecommendation,
  RunStatus,
} from '@crawlops/shared';

/** A source made available to the evaluator (subset of the stored Source). */
export interface EvaluableSource {
  url: string;
  title: string | null;
  description: string | null;
  content: string | null;
}

export interface EvaluationInput {
  /** The original task prompt (for context / future grounding). */
  taskPrompt: string;
  /** The normalized final output produced by the strategy (structured or text). */
  output: unknown;
  /** Sources retrieved during execution. */
  sources: EvaluableSource[];
  /** Optional expected JSON schema (JSON Schema object) for the output. */
  expectedSchema?: Record<string, unknown> | null;
  /** Minimum acceptable number of usable sources. */
  minSources: number;
  /** Whether the run hit its timeout. */
  timedOut: boolean;
}

export interface EvaluationOutput {
  overallScore: number; // 0..1 heuristic
  status: RunStatus; // SUCCESS | PARTIAL | FAILED
  recommendation: EvaluationRecommendation;
  checks: EvaluationCheck[];
  supportedClaims: number | null; // set by grounding evaluators only
  unsupportedClaims: number | null;
  missingFields: string[];
  reasoningSummary: string;
  evaluatorProvider: string;
}

export interface EvaluatorProvider {
  readonly name: string;
  evaluate(input: EvaluationInput): Promise<EvaluationOutput>;
}
