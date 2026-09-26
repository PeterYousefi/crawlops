/**
 * Core enumerations shared across the whole system (API, DB, orchestrator, web).
 * Kept as `const` objects + derived union types so they are usable as both
 * runtime values and TypeScript types, and align with Prisma enums.
 */

export const ExecutionStrategy = {
  AUTO: 'AUTO',
  SEARCH: 'SEARCH',
  SCRAPE: 'SCRAPE',
  CRAWL: 'CRAWL',
  AGENT: 'AGENT',
} as const;
export type ExecutionStrategy = (typeof ExecutionStrategy)[keyof typeof ExecutionStrategy];

export const RunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const AttemptStatus = {
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;
export type AttemptStatus = (typeof AttemptStatus)[keyof typeof AttemptStatus];

export const EvaluationRecommendation = {
  PASS: 'pass',
  PARTIAL: 'partial',
  FAIL: 'fail',
} as const;
export type EvaluationRecommendation =
  (typeof EvaluationRecommendation)[keyof typeof EvaluationRecommendation];
