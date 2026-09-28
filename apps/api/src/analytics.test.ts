import { describe, it, expect } from 'vitest';
import type { AnalyticsRun } from '@crawlops/shared';
import { computeAnalytics } from './analytics.js';

function run(over: Partial<AnalyticsRun>): AnalyticsRun {
  return {
    id: Math.random().toString(36).slice(2),
    strategy: 'SEARCH',
    status: 'SUCCESS',
    overallScore: 1,
    durationMs: 1000,
    sourceCount: 3,
    errorCategory: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('computeAnalytics', () => {
  // A. No runs.
  it('no runs -> null metrics, no divide-by-zero', () => {
    const a = computeAnalytics('e1', 'Eval', 20, []);
    expect(a.window.totalRuns).toBe(0);
    expect(a.window.terminalRuns).toBe(0);
    expect(a.summary.successRate).toBeNull();
    expect(a.summary.averageScore).toBeNull();
    expect(a.summary.averageDurationMs).toBeNull();
    expect(a.summary.averageSourceCount).toBeNull();
    expect(a.failureBreakdown).toEqual([]);
    expect(a.recentRuns).toEqual([]);
  });

  // B. One SUCCESS run.
  it('one SUCCESS run -> successRate 1, correct averages', () => {
    const a = computeAnalytics('e1', 'Eval', 20, [
      run({ status: 'SUCCESS', overallScore: 0.9, durationMs: 2000, sourceCount: 4 }),
    ]);
    expect(a.summary.successRate).toBe(1);
    expect(a.summary.averageScore).toBe(0.9);
    expect(a.summary.averageDurationMs).toBe(2000);
    expect(a.summary.averageSourceCount).toBe(4);
    expect(a.statusCounts).toEqual({ SUCCESS: 1 });
  });

  // C. Mixed SUCCESS + FAILED.
  it('mixed SUCCESS + FAILED -> correct denominator, rate, averages, breakdown', () => {
    const a = computeAnalytics('e1', 'Eval', 20, [
      run({ status: 'SUCCESS', overallScore: 1, durationMs: 1000, sourceCount: 2 }),
      run({ status: 'SUCCESS', overallScore: 0.8, durationMs: 3000, sourceCount: 4 }),
      run({ status: 'FAILED', overallScore: 0.4, durationMs: 2000, sourceCount: 0, errorCategory: 'INVALID_SCHEMA' }),
      run({ status: 'FAILED', overallScore: null, durationMs: 500, sourceCount: 0, errorCategory: 'NO_RESULTS' }),
    ]);
    // 2 SUCCESS of 4 terminal
    expect(a.summary.successRate).toBeCloseTo(0.5, 5);
    // score mean over the 3 runs that HAVE a score: (1 + 0.8 + 0.4)/3
    expect(a.summary.averageScore).toBeCloseTo((1 + 0.8 + 0.4) / 3, 5);
    // duration mean over all 4 terminal: (1000+3000+2000+500)/4
    expect(a.summary.averageDurationMs).toBeCloseTo(1625, 5);
    // sources mean over 4 terminal: (2+4+0+0)/4
    expect(a.summary.averageSourceCount).toBeCloseTo(1.5, 5);
    expect(a.failureBreakdown).toEqual([
      { category: 'INVALID_SCHEMA', count: 1 },
      { category: 'NO_RESULTS', count: 1 },
    ]);
  });

  // D. RUNNING/PENDING present must not corrupt terminal success rate.
  it('RUNNING/PENDING runs are excluded from terminal denominator', () => {
    const a = computeAnalytics('e1', 'Eval', 20, [
      run({ status: 'RUNNING', overallScore: null, durationMs: null, sourceCount: 0 }),
      run({ status: 'PENDING', overallScore: null, durationMs: null, sourceCount: 0 }),
      run({ status: 'SUCCESS', overallScore: 1, durationMs: 1000, sourceCount: 3 }),
      run({ status: 'FAILED', overallScore: 0.2, durationMs: 1000, sourceCount: 0, errorCategory: 'TIMEOUT' }),
    ]);
    expect(a.window.totalRuns).toBe(4);
    expect(a.window.terminalRuns).toBe(2); // only SUCCESS + FAILED
    expect(a.summary.successRate).toBe(0.5); // 1 of 2 terminal
    expect(a.statusCounts).toEqual({ RUNNING: 1, PENDING: 1, SUCCESS: 1, FAILED: 1 });
  });

  // D2. All non-terminal -> successRate null (no terminal runs).
  it('all RUNNING/PENDING -> successRate null', () => {
    const a = computeAnalytics('e1', 'Eval', 20, [
      run({ status: 'RUNNING', overallScore: null, durationMs: null }),
      run({ status: 'PENDING', overallScore: null, durationMs: null }),
    ]);
    expect(a.summary.successRate).toBeNull();
    expect(a.summary.averageSourceCount).toBeNull();
  });

  // E. limit + newest-first are the caller's responsibility, but the response
  //    echoes the requested limit and preserves order.
  it('echoes limit and preserves given (newest-first) order in recentRuns', () => {
    const runs = [
      run({ id: 'newest', createdAt: '2026-01-03T00:00:00.000Z' }),
      run({ id: 'older', createdAt: '2026-01-02T00:00:00.000Z' }),
    ];
    const a = computeAnalytics('e1', 'Eval', 5, runs);
    expect(a.window.limit).toBe(5);
    expect(a.recentRuns[0]!.id).toBe('newest');
    expect(a.recentRuns[1]!.id).toBe('older');
  });
});
