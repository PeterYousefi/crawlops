import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/crawlops/app-shell';
import { Empty } from '@/components/crawlops/primitives';
import { useEvaluations } from '@/api/hooks';
import { api } from '@/api/client';
import { formatRelative } from '@/lib/utils';

/**
 * Evaluations list — real /api/evaluations. The Run action performs the REAL
 * run flow and navigates to the real Run Details page. No mock behavior.
 */
export function EvaluationsPage() {
  const { data, loading, error } = useEvaluations();
  const [runningId, setRunningId] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleRun(id: string, _name: string) {
    setRunningId(id);
    try {
      const run = await api.runEvaluation(id);
      // The run is persisted server-side; the Runs list reads it from /api/runs.
      navigate(`/runs/${run.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Run failed to start');
      setRunningId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Evaluations"
        description="Reusable research tasks with an expected schema and evaluator checks."
        actions={
          <Link
            to="/evaluations/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New evaluation
          </Link>
        }
      />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <Empty>Cannot load evaluations: {error}</Empty>
        ) : !data || data.length === 0 ? (
          <Empty>No evaluations yet. Create one to get started.</Empty>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {data.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-surface-raised sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{e.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{e.id}</span>
                  </div>
                  <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{e.taskPrompt}</p>
                </div>
                <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5">{e.strategy}</span>
                  <span>{formatRelative(e.createdAt)}</span>
                  <button
                    onClick={() => handleRun(e.id, e.name)}
                    disabled={runningId === e.id}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 font-sans text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {runningId === e.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {runningId === e.id ? 'Running…' : 'Run'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  );
}
