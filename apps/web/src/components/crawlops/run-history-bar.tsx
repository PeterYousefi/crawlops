import type { AnalyticsRun } from '@crawlops/shared';
import { cn } from '@/lib/utils';

/**
 * A tiny, dependency-free reliability history: one dot per real run (oldest ->
 * newest, left -> right). SUCCESS/PARTIAL/FAILED get distinct treatments;
 * RUNNING/PENDING are shown muted. Understandable without any charting library.
 */
export function RunHistoryBar({ runs }: { runs: AnalyticsRun[] }) {
  if (runs.length === 0) return null;
  // recentRuns is newest-first; render oldest-first for a left-to-right timeline.
  const ordered = [...runs].reverse();

  const toneFor = (status: string): string => {
    switch (status) {
      case 'SUCCESS':
        return 'bg-success';
      case 'PARTIAL':
        return 'bg-warning';
      case 'FAILED':
        return 'bg-destructive';
      default:
        return 'bg-muted-foreground/40'; // RUNNING / PENDING
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="img" aria-label="Run history, oldest to newest">
      {ordered.map((r) => {
        const scoreText = r.overallScore != null ? ` · score ${r.overallScore.toFixed(2)}` : '';
        return (
          <span
            key={r.id}
            title={`${r.status}${scoreText} · ${new Date(r.createdAt).toLocaleString()}`}
            className={cn('h-3 w-3 rounded-sm', toneFor(r.status))}
          />
        );
      })}
    </div>
  );
}
