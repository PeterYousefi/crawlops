/**
 * Reliability analytics computation (pure, testable).
 *
 * WHAT: Given an evaluation's lightweight run rows, compute the reliability
 *       summary the analytics endpoint returns.
 * WHY:  Keeping the math pure (no Prisma/HTTP) makes the metric rules explicit
 *       and unit-testable, and guarantees honest handling (null, not fake 0).
 *
 * Metric rules (mirrors the product spec):
 * - Only runs belonging to the evaluation (caller filters), newest first.
 * - Terminal runs = SUCCESS | PARTIAL | FAILED (RUNNING/PENDING excluded).
 * - successRate = SUCCESS terminal / all terminal; null when no terminal runs.
 * - averageScore = mean of runs that actually have a score; null when none.
 * - averageDurationMs = mean over terminal runs with a known duration; null when none.
 * - averageSourceCount = mean over terminal runs; null when no terminal runs.
 * - failureBreakdown = real persisted errorCategory of terminal FAILED/PARTIAL runs.
 */

import { RunStatus, type AnalyticsResponse, type AnalyticsRun } from '@crawlops/shared';

const TERMINAL: ReadonlySet<string> = new Set([
  RunStatus.SUCCESS,
  RunStatus.PARTIAL,
  RunStatus.FAILED,
]);

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeAnalytics(
  evaluationId: string,
  evaluationName: string,
  limit: number,
  runs: AnalyticsRun[], // already newest-first, already limited
): AnalyticsResponse {
  const terminal = runs.filter((r) => TERMINAL.has(r.status));

  const successCount = terminal.filter((r) => r.status === RunStatus.SUCCESS).length;
  const successRate = terminal.length > 0 ? successCount / terminal.length : null;

  const scores = runs.filter((r) => r.overallScore != null).map((r) => r.overallScore as number);
  const averageScore = mean(scores);

  const durations = terminal
    .filter((r) => typeof r.durationMs === 'number')
    .map((r) => r.durationMs as number);
  const averageDurationMs = mean(durations);

  const averageSourceCount = mean(terminal.map((r) => r.sourceCount));

  // Status counts across the whole window (all statuses that appear).
  const statusCounts: Record<string, number> = {};
  for (const r of runs) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

  // Failure breakdown: real persisted categories among terminal FAILED/PARTIAL.
  const failureMap = new Map<string, number>();
  for (const r of terminal) {
    if ((r.status === RunStatus.FAILED || r.status === RunStatus.PARTIAL) && r.errorCategory) {
      failureMap.set(r.errorCategory, (failureMap.get(r.errorCategory) ?? 0) + 1);
    }
  }
  const failureBreakdown = [...failureMap.entries()]
    .map(([category, count]) => ({ category: category as AnalyticsRun['errorCategory'] & string, count }))
    .sort((a, b) => b.count - a.count);

  return {
    evaluationId,
    evaluationName,
    window: { limit, totalRuns: runs.length, terminalRuns: terminal.length },
    summary: { successRate, averageScore, averageDurationMs, averageSourceCount },
    statusCounts,
    failureBreakdown,
    recentRuns: runs,
  };
}
