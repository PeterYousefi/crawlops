import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/crawlops/app-shell';
import { SectionHeader, Stat, Panel } from '@/components/crawlops/primitives';
import { RunTable } from '@/components/crawlops/run-table';
import { useHealth, useEvaluations, useRuns } from '@/api/hooks';
import { formatRelative } from '@/lib/utils';

/**
 * Overview. Everything is real and server-backed:
 * - dependency health from /api/health
 * - evaluations from /api/evaluations
 * - recent runs + stats from /api/runs (persisted PostgreSQL data)
 * No localStorage. Loads correctly in a fresh browser.
 */
export function OverviewPage() {
  const health = useHealth();
  const evals = useEvaluations();
  const runsQuery = useRuns(50);
  const runs = runsQuery.data ?? [];

  const total = runs.length;
  const success = runs.filter((r) => r.status === 'SUCCESS').length;
  const failed = runs.filter((r) => r.status === 'FAILED').length;
  const partial = runs.filter((r) => r.status === 'PARTIAL').length;
  const successRate = total ? Math.round((success / total) * 100) : null;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Agent reliability across this workspace."
        actions={
          <Link
            to="/evaluations/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New evaluation
          </Link>
        }
      />
      <PageBody className="space-y-8">
        {/* Dependency health — real, from /api/health */}
        {health.error ? (
          <Panel className="border-l-2 border-l-destructive">
            <div className="text-sm text-destructive">Cannot reach the API: {health.error}</div>
          </Panel>
        ) : health.data ? (
          <div className="grid grid-cols-2 divide-border rounded-lg border border-border bg-surface sm:divide-x lg:grid-cols-4">
            {Object.entries(health.data.dependencies).map(([name, dep]) => (
              <Stat
                key={name}
                label={name}
                value={dep.ok ? 'OK' : 'DOWN'}
                hint={dep.message}
                tone={dep.ok ? 'success' : 'danger'}
              />
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Checking system status…</div>
        )}

        {/* Run stats — computed from real persisted runs (latest 50) */}
        <div className="grid grid-cols-2 divide-border rounded-lg border border-border bg-surface sm:divide-x lg:grid-cols-3">
          <Stat
            label="Runs (latest 50)"
            value={runsQuery.loading ? '…' : total}
            hint={`${success} success · ${partial} partial · ${failed} failed`}
          />
          <Stat
            label="Success rate"
            value={successRate === null ? '—' : `${successRate}%`}
            hint={total ? 'of recent runs' : 'no runs yet'}
            tone={successRate === null ? 'default' : successRate >= 60 ? 'success' : 'warning'}
          />
          <Stat label="Evaluations" value={evals.data?.length ?? '—'} hint="defined in this workspace" />
        </div>

        <section className="space-y-3">
          <SectionHeader
            title="Recent runs"
            description="Newest first. Open a run for validation output and sources."
            action={
              <Link
                to="/runs"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                All runs <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {runsQuery.loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : runsQuery.error ? (
            <Panel className="border-l-2 border-l-destructive">
              <div className="text-sm text-destructive">Cannot load runs: {runsQuery.error}</div>
            </Panel>
          ) : (
            <RunTable rows={runs} limit={5} />
          )}
        </section>

        <section className="space-y-3">
          <SectionHeader title="Evaluations" description="Reusable research tasks in this workspace." />
          {evals.loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : evals.data && evals.data.length > 0 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {evals.data.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{e.name}</div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{e.taskPrompt}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 font-mono text-xs text-muted-foreground">
                    <span className="rounded border border-border bg-muted px-1.5 py-0.5">{e.strategy}</span>
                    <span>{formatRelative(e.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No evaluations yet. Create one to get started.
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}
