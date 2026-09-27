import { PageBody, PageHeader } from '@/components/crawlops/app-shell';
import { RunTable } from '@/components/crawlops/run-table';
import { Empty } from '@/components/crawlops/primitives';
import { useRuns } from '@/api/hooks';

/**
 * Runs list — real persisted runs from GET /api/runs (newest first).
 * Loads correctly in a fresh browser; no localStorage involved.
 */
export function RunsPage() {
  const { data, loading, error } = useRuns(50);

  return (
    <>
      <PageHeader title="Runs" description="All executions, newest first." />
      <PageBody>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <Empty>Cannot load runs: {error}</Empty>
        ) : (
          <RunTable rows={data ?? []} />
        )}
      </PageBody>
    </>
  );
}
