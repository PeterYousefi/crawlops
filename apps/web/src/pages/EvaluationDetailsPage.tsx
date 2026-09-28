import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Play } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/crawlops/app-shell';
import { SectionHeader, Stat, Panel, Empty, MetaRow } from '@/components/crawlops/primitives';
import { StatusPill } from '@/components/crawlops/status-pill';
import { RunHistoryBar } from '@/components/crawlops/run-history-bar';
import { useEvaluation, useAnalytics } from '@/api/hooks';
import { api, ApiRequestError } from '@/api/client';
import { useNavigate } from 'react-router-dom';
import { cn, formatDuration, formatRelative, formatScore } from '@/lib/utils';
import type { AnalyticsResponse } from '@crawlops/shared';

/** Reliability = regression history for a single evaluation. Observational only. */
export function EvaluationDetailsPage() {
  const { id = '' } = useParams();
  const evalQuery = useEvaluation(id);
  const analytics = useAnalytics(id, 30);
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);

  async function handleRun() {
    setRunning(true);
    try {
      const run = await api.runEvaluation(id);
      navigate(`/runs/${run.id}`);
    } catch (e) {
      const msg =
        e instanceof ApiRequestError && (e.code === 'DB_UNAVAILABLE' || e.code === 'NETWORK_ERROR')
          ? 'Service warming up or temporarily unavailable — please retry.'
          : e instanceof Error
            ? e.message
            : 'Run failed to start';
      toast.error(msg);
      setRunning(false);
    }
  }

  if (evalQuery.loading) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  if (evalQuery.error || !evalQuery.data) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 text-center lg:px-8">
        <div className="font-mono text-xs text-muted-foreground">EVALUATION_NOT_FOUND</div>
        <h1 className="mt-2 text-lg font-semibold">This evaluation couldn't be loaded</h1>
        <p className="mt-1 text-sm text-muted-foreground">{evalQuery.error ?? 'Unknown error'}</p>
        <Link to="/evaluations" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to evaluations
        </Link>
      </div>
    );
  }

  const ev = evalQuery.data;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/evaluations" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="h-3 w-3" /> Evaluations
          </Link>
        }
        title={ev.name}
        description={ev.taskPrompt}
        actions={
          <button
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Play className="h-4 w-4" /> {running ? 'Running…' : 'Run'}
          </button>
        }
      />
      <PageBody className="space-y-8">
        {/* Definition */}
        <Panel>
          <MetaRow label="Strategy">{ev.strategy}</MetaRow>
          <MetaRow label="Expected schema">{ev.expectedSchema ? 'provided' : 'none'}</MetaRow>
          <MetaRow label="Min sources">{ev.minSources}</MetaRow>
          <MetaRow label="Created">{new Date(ev.createdAt).toLocaleString()}</MetaRow>
        </Panel>

        {analytics.loading ? (
          <p className="text-sm text-muted-foreground">Loading reliability…</p>
        ) : analytics.error ? (
          <Panel className="border-l-2 border-l-destructive">
            <div className="text-sm text-destructive">Cannot load analytics: {analytics.error}</div>
          </Panel>
        ) : analytics.data ? (
          <Reliability data={analytics.data} />
        ) : null}
      </PageBody>
    </>
  );
}

function Reliability({ data }: { data: AnalyticsResponse }) {
  const { window: win, summary, failureBreakdown, recentRuns } = data;
  const terminal = win.terminalRuns;

  // Honest run-count framing.
  const basis =
    win.totalRuns === 0
      ? null
      : win.totalRuns === 1
        ? 'Based on 1 run'
        : `last ${win.totalRuns} runs`;

  if (win.totalRuns === 0) {
    return (
      <section className="space-y-3">
        <SectionHeader title="Reliability" description="Does this workflow keep working over time?" />
        <Empty>No runs yet. Run this evaluation to start building reliability history.</Empty>
      </section>
    );
  }

  const successPct = summary.successRate != null ? Math.round(summary.successRate * 100) : null;
  const successCount = recentRuns.filter((r) => r.status === 'SUCCESS').length;

  return (
    <>
      <section className="space-y-3">
        <SectionHeader
          title="Reliability"
          description={win.totalRuns === 1 ? 'Based on 1 run — not yet a trend.' : 'Observational summary of past runs.'}
        />
        <div className="grid grid-cols-2 divide-border rounded-lg border border-border bg-surface sm:divide-x lg:grid-cols-4">
          <Stat
            label="Success rate"
            value={successPct != null ? `${successPct}%` : '—'}
            hint={terminal > 0 ? `${successCount} / ${terminal} successful` : 'no terminal runs'}
            tone={successPct == null ? 'default' : successPct >= 60 ? 'success' : 'warning'}
          />
          <Stat label="Average score" value={formatScore(summary.averageScore)} hint={basis ?? ''} />
          <Stat
            label="Average duration"
            value={summary.averageDurationMs != null ? formatDuration(Math.round(summary.averageDurationMs)) : '—'}
            hint={basis ?? ''}
          />
          <Stat
            label="Average sources"
            value={summary.averageSourceCount != null ? summary.averageSourceCount.toFixed(1) : '—'}
            hint={basis ?? ''}
          />
        </div>
      </section>

      {/* Native run-history visual */}
      <section className="space-y-3">
        <SectionHeader title="Run history" description="One block per run, oldest to newest." />
        <Panel>
          <RunHistoryBar runs={recentRuns} />
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success" /> success</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warning" /> partial</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-destructive" /> failed</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" /> running/pending</span>
          </div>
        </Panel>
      </section>

      {/* Failure breakdown */}
      <section className="space-y-3">
        <SectionHeader title="Failure breakdown" description="Real persisted failure categories in this window." />
        {failureBreakdown.length === 0 ? (
          <Empty>No failures in the selected run window.</Empty>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {failureBreakdown.map((f) => (
              <li key={f.category} className="flex items-center justify-between px-4 py-2.5">
                <span className="font-mono text-xs text-destructive">{f.category}</span>
                <span className="font-mono text-sm tabular-nums">{f.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent performance */}
      <section className="space-y-3">
        <SectionHeader title="Recent performance" description="Runs for this evaluation, newest first." />
        <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] tracking-wider text-muted-foreground uppercase">
                <th className="w-[110px] px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Run</th>
                <th className="px-4 py-2.5 text-right font-medium">Strategy</th>
                <th className="px-4 py-2.5 text-right font-medium">Score</th>
                <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                <th className="px-4 py-2.5 text-right font-medium">Sources</th>
                <th className="px-4 py-2.5 text-right font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentRuns.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-surface-raised">
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/runs/${r.id}`} className="font-mono text-[11px] text-primary hover:underline">
                      {r.id}
                    </Link>
                    {r.errorCategory ? (
                      <span className="ml-2 rounded border border-destructive/35 bg-destructive/10 px-1.5 py-px font-mono text-[10.5px] text-destructive">
                        {r.errorCategory}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{r.strategy}</td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right font-mono text-xs tabular-nums',
                      r.overallScore == null ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    {formatScore(r.overallScore)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {formatDuration(r.durationMs)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {r.sourceCount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                    {formatRelative(r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
