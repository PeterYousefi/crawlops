import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { RunListItem } from '@crawlops/shared';
import { StatusPill } from './status-pill';
import { formatDuration, formatRelative, formatScore } from '@/lib/utils';

// Renders REAL persisted runs from GET /api/runs (RunListItem[]). No mock data.
export function RunTable({ rows, limit }: { rows: RunListItem[]; limit?: number }) {
  const navigate = useNavigate();
  const shown = limit ? rows.slice(0, limit) : rows;

  if (shown.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
        <div className="text-sm font-medium">No runs yet</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Create an evaluation and trigger a run to see results here.
        </p>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] tracking-wider text-muted-foreground uppercase">
            <th className="w-[120px] px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Evaluation / Run</th>
            <th className="px-4 py-2.5 text-right font-medium">Score</th>
            <th className="px-4 py-2.5 text-right font-medium">Duration</th>
            <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Strategy</th>
            <th className="px-4 py-2.5 text-right font-medium">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shown.map((r) => (
            <tr
              key={r.id}
              onClick={() => navigate(`/runs/${r.id}`)}
              className="group cursor-pointer transition-colors hover:bg-surface-raised"
            >
              <td className="px-4 py-3 align-top">
                <Link
                  to={`/runs/${r.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <StatusPill status={r.status} />
                </Link>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground group-hover:text-primary">
                  {r.evaluationName}
                  <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-70" />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground/80">{r.id}</span>
                  {r.errorCategory ? (
                    <span className="rounded border border-destructive/35 bg-destructive/10 px-1.5 py-px font-mono text-[10.5px] tracking-wide text-destructive">
                      {r.errorCategory}
                    </span>
                  ) : null}
                </div>
              </td>
              <td
                className={
                  'px-4 py-3 text-right font-mono text-xs tabular-nums ' +
                  (r.overallScore == null
                    ? 'text-muted-foreground'
                    : r.overallScore >= 0.8
                      ? 'text-foreground'
                      : 'text-destructive')
                }
              >
                {formatScore(r.overallScore)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground tabular-nums">
                {formatDuration(r.durationMs)}
              </td>
              <td className="hidden px-4 py-3 text-right font-mono text-xs text-muted-foreground tabular-nums sm:table-cell">
                {r.strategy}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                {formatRelative(r.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
