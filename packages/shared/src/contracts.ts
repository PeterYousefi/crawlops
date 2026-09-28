/**
 * API contracts (single source of truth).
 *
 * WHAT: Zod schemas + inferred TypeScript types for every API request/response.
 * WHY:  The API and the web frontend (and later the Lovable-generated UI) must
 *       agree on shapes without drift. Defining them once here means the server
 *       validates with the same schema the client types against.
 * HOW:  The Fastify API imports these to validate input and shape output; the
 *       web data hooks import the inferred types. Errors use a single envelope.
 */

import { z } from 'zod';
import {
  ExecutionStrategy,
  RunStatus,
  AttemptStatus,
  EvaluationRecommendation,
} from './enums.js';
import { FailureCategory } from './errors.js';

// ---- Primitives ----

export const strategySchema = z.nativeEnum(ExecutionStrategy);
export const runStatusSchema = z.nativeEnum(RunStatus);
export const attemptStatusSchema = z.nativeEnum(AttemptStatus);
export const failureCategorySchema = z.nativeEnum(FailureCategory);

/**
 * A user-supplied JSON schema describing the expected result shape.
 * Stored as opaque JSON; validated structurally by the deterministic evaluator.
 */
export const expectedSchema = z.record(z.unknown()).nullable().optional();

// ---- Evaluation (the reusable test definition) ----

export const createEvaluationSchema = z.object({
  name: z.string().min(1).max(200),
  taskPrompt: z.string().min(1).max(4000),
  startingUrls: z.array(z.string().url()).max(20).default([]),
  strategy: strategySchema.default(ExecutionStrategy.SEARCH),
  expectedSchema,
  maxRetries: z.number().int().min(0).max(5).default(2),
  maxFirecrawlCalls: z.number().int().min(1).max(20).default(5),
  // Up to 180s to accommodate the AGENT (structured research) strategy, which
  // is slower than SEARCH. SEARCH keeps its own smaller default.
  timeoutMs: z.number().int().min(1000).max(180_000).default(30_000),
  /** Minimum number of usable sources for a run to be considered grounded. */
  minSources: z.number().int().min(0).max(50).default(1),
});
export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;

export const evaluationSchema = createEvaluationSchema.extend({
  id: z.string(),
  createdAt: z.string(),
});
export type Evaluation = z.infer<typeof evaluationSchema>;

// ---- Sources ----

export const sourceSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  rank: z.number().int().nullable(),
  contentRef: z.string().nullable(),
  retrievedAt: z.string(),
});
export type Source = z.infer<typeof sourceSchema>;

// ---- Deterministic checks ----

export const evaluationCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  critical: z.boolean(),
  detail: z.string(),
});
export type EvaluationCheck = z.infer<typeof evaluationCheckSchema>;

// ---- Evaluation result ----

export const evaluationResultSchema = z.object({
  id: z.string(),
  overallScore: z.number().min(0).max(1),
  status: runStatusSchema,
  recommendation: z.nativeEnum(EvaluationRecommendation),
  checks: z.array(evaluationCheckSchema),
  supportedClaims: z.number().int().nullable(),
  unsupportedClaims: z.number().int().nullable(),
  missingFields: z.array(z.string()),
  reasoningSummary: z.string(),
  evaluatorProvider: z.string(),
  createdAt: z.string(),
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

// ---- Execution attempts ----

export const executionAttemptSchema = z.object({
  id: z.string(),
  attemptNumber: z.number().int(),
  strategy: strategySchema,
  status: attemptStatusSchema,
  errorCategory: failureCategorySchema.nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  firecrawlCallCount: z.number().int(),
});
export type ExecutionAttempt = z.infer<typeof executionAttemptSchema>;

// ---- Runs ----

export const runSchema = z.object({
  id: z.string(),
  evaluationId: z.string(),
  status: runStatusSchema,
  strategy: strategySchema,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  attemptCount: z.number().int(),
  errorCategory: failureCategorySchema.nullable(),
  createdAt: z.string(),
});
export type Run = z.infer<typeof runSchema>;

/** Full run report returned by GET /api/runs/:id. */
export const runReportSchema = runSchema.extend({
  evaluation: evaluationSchema,
  attempts: z.array(executionAttemptSchema),
  sources: z.array(sourceSchema),
  evaluationResult: evaluationResultSchema.nullable(),
  /** The normalized final output (structured or text), stored per run. */
  finalOutput: z.unknown().nullable(),
});
export type RunReport = z.infer<typeof runReportSchema>;

/**
 * Lightweight run row for lists (GET /api/runs). Extends the base run with the
 * joined evaluation name and the evaluation result's overall score, so the
 * Runs list / Overview can render without an extra fetch per row.
 */
export const runListItemSchema = runSchema.extend({
  evaluationName: z.string(),
  overallScore: z.number().min(0).max(1).nullable(),
});
export type RunListItem = z.infer<typeof runListItemSchema>;

// ---- Metrics ----

export const metricsSchema = z.object({
  totalRuns: z.number().int(),
  successCount: z.number().int(),
  partialCount: z.number().int(),
  failureCount: z.number().int(),
  successRate: z.number().min(0).max(1),
  avgLatencyMs: z.number().nullable(),
  medianLatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  avgRetries: z.number().nullable(),
  schemaValidPct: z.number().min(0).max(1).nullable(),
  failureCategories: z.record(z.number().int()),
});
export type Metrics = z.infer<typeof metricsSchema>;

// ---- Response envelope ----

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    category: failureCategorySchema.optional(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export function ok<T>(data: T): { data: T } {
  return { data };
}
