import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertOctagon, CheckCircle2, ChevronLeft, Copy, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/crawlops/app-shell';
import { CheckPill, StatusPill } from '@/components/crawlops/status-pill';
import { CodeBlock, Stat, Empty } from '@/components/crawlops/primitives';
import { SourceList } from '@/components/crawlops/source-list';
import { useRun } from '@/api/hooks';
import { cn, formatDuration, formatRelative, formatScore } from '@/lib/utils';

const techTabs = ['Output', 'Expected schema', 'Task'] as const;
type TechTab = (typeof techTabs)[number];

function Section({
  index,
  title,
  meta,
  children,
}: {
  index: number;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
        <h2 className="flex items-baseline gap-2.5 text-sm font-semibold tracking-tight">
          <span className="font-mono text-[11px] text-muted-foreground">{String(index).padStart(2, '0')}</span>
          {title}
        </h2>
        {meta ? <div className="font-mono text-[11px] text-muted-foreground">{meta}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Run details — REAL RunReport from /api/runs/:id. Renders real status,
 * overallScore, deterministic checks (passed/critical/detail), attempts,
 * sources, errorCategory and finalOutput. No fabricated fields.
 */
export function RunDetailsPage() {
  const { id = '' } = useParams();
  const { data: run, loading, error } = useRun(id);
  const [tab, setTab] = useState<TechTab>('Output');

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 lg:px-8">
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-surface" />
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </div>
    );
  }
  if (error || !run) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 text-center lg:px-8">
        <div className="font-mono text-xs text-muted-foreground">RUN_NOT_LOADED</div>
        <h1 className="mt-2 text-lg font-semibold">This run couldn't be loaded</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error ?? 'Unknown error'}</p>
        <Link to="/runs" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to runs
        </Link>
      </div>
    );
  }

  const evalResult = run.evaluationResult;
  const failed = run.status === 'FAILED';
  const active = run.status === 'RUNNING' || run.status === 'PENDING';
  const passedChecks = evalResult ? evalResult.checks.filter((c) => c.passed).length : 0;
  const totalChecks = evalResult ? evalResult.checks.length : 0;
  const scoreTone =
    evalResult == null ? 'default' : evalResult.overallScore >= 0.8 ? 'success' : failed ? 'danger' : 'warning';
  const outputStr =
    run.finalOutput == null ? '' : typeof run.finalOutput === 'string' ? run.finalOutput : JSON.stringify(run.finalOutput, null, 2);
  const schemaStr = run.evaluation.expectedSchema
    ? JSON.stringify(run.evaluation.expectedSchema, null, 2)
    : '';

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/runs" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="h-3 w-3" /> Runs
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <StatusPill status={run.status} size="lg" />
            <span>{run.evaluation.name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(run.id);
                toast.success('Run ID copied');
              }}
              className="inline-flex items-center gap-1.5 rounded font-mono text-xs text-foreground/85 hover:text-primary"
              title="Copy run ID"
            >
              {run.id} <Copy className="h-3 w-3 opacity-60" />
            </button>
            <span className="text-border-strong">·</span>
            <span className="font-mono text-xs">{run.strategy}</span>
          </span>
        }
      />
      <PageBody className="space-y-8">
        {/* summary strip — all real */}
        <div className="grid grid-cols-2 divide-border rounded-lg border border-border bg-surface sm:grid-cols-4 sm:divide-x">
          <Stat
            label="Evaluator score"
            value={formatScore(evalResult?.overallScore ?? null)}
            hint={totalChecks ? `${passedChecks}/${totalChecks} checks passed` : 'no evaluation'}
            tone={scoreTone}
          />
          <Stat label="Duration" value={formatDuration(run.durationMs)} hint={active ? 'elapsed' : 'incl. retries'} />
          <Stat
            label="Attempts"
            value={run.attemptCount}
            hint={run.attemptCount > 1 ? `${run.attemptCount - 1} retry(ies)` : 'no retries'}
          />
          <Stat
            label="Started"
            value={
              <span className="text-xl">
                {run.startedAt ? new Date(run.startedAt).toISOString().slice(11, 19) + 'Z' : '—'}
              </span>
            }
            hint={formatRelative(run.startedAt)}
          />
        </div>

        {/* validation result */}
        <Section index={1} title="Validation result">
          {failed ? (
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex gap-3 border-l-2 border-destructive px-4 py-4">
                <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1 space-y-4">
                  <div>
                    <div className="font-mono text-sm font-semibold tracking-wide text-destructive">
                      {run.errorCategory ?? 'FAILED'}
                    </div>
                    {evalResult?.reasoningSummary ? (
                      <p className="mt-1 text-sm text-foreground/90">{evalResult.reasoningSummary}</p>
                    ) : null}
                  </div>
                  {evalResult && evalResult.missingFields.length > 0 ? (
                    <div>
                      <div className="text-[11px] tracking-wider text-muted-foreground uppercase">
                        Missing required fields · {evalResult.missingFields.length}
                      </div>
                      <ul className="mt-2 space-y-1 font-mono text-xs">
                        {evalResult.missingFields.map((f) => (
                          <li key={f} className="flex items-center gap-2">
                            <span className="text-destructive">−</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : active ? (
            <div className="flex items-center gap-3 rounded-lg border border-border border-l-2 border-l-info bg-surface px-4 py-3.5">
              <Loader2 className="h-4 w-4 animate-spin text-info [animation-duration:2s]" />
              <div className="text-sm">Run in progress — validation runs after retrieval completes.</div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border border-l-2 border-l-success bg-surface px-4 py-3.5">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <div className="text-sm">
                {evalResult?.reasoningSummary ?? 'Run completed.'}
                {run.status === 'PARTIAL' ? (
                  <span className="ml-2 font-mono text-xs text-warning">partial</span>
                ) : null}
              </div>
            </div>
          )}
        </Section>

        {/* evaluator checks — real deterministic checks */}
        <Section index={2} title="Evaluator checks" meta={totalChecks ? `${passedChecks}/${totalChecks} passed` : undefined}>
          {!evalResult || totalChecks === 0 ? (
            <Empty>No evaluation checks recorded for this run.</Empty>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {evalResult.checks.map((c) => (
                <li key={c.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3">
                  <span className="mt-0.5">
                    {c.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{c.label}</span>
                      <CheckPill passed={c.passed} />
                      {c.critical ? (
                        <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide text-muted-foreground">
                          critical
                        </span>
                      ) : null}
                    </div>
                    {c.detail ? (
                      <p
                        className={cn(
                          'mt-1.5 font-mono text-xs',
                          c.passed ? 'text-muted-foreground' : 'text-destructive',
                        )}
                      >
                        {c.detail}
                      </p>
                    ) : null}
                  </div>
                  <div />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* attempts — real */}
        <Section index={3} title="Attempts" meta={`${run.attempts.length} total`}>
          {run.attempts.length === 0 ? (
            <Empty>No attempts recorded.</Empty>
          ) : (
            <ol className="overflow-hidden rounded-lg border border-border bg-surface">
              {run.attempts.map((a, i) => (
                <li key={a.id} className="relative flex gap-4 px-4 py-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        'mt-1 h-2 w-2 rounded-full',
                        a.status === 'SUCCESS' ? 'bg-success' : a.status === 'FAILED' ? 'bg-destructive' : 'bg-info',
                      )}
                    />
                    {i < run.attempts.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium">
                        Attempt #{a.attemptNumber} · {a.strategy}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {formatDuration(a.durationMs)}
                        </span>
                        <StatusPill status={a.status === 'SUCCESS' ? 'SUCCESS' : a.status === 'FAILED' ? 'FAILED' : 'RUNNING'} />
                      </div>
                    </div>
                    {a.errorCategory || a.errorMessage ? (
                      <p className="mt-1 font-mono text-xs text-destructive">
                        {a.errorCategory ? `${a.errorCategory}: ` : ''}
                        {a.errorMessage ?? ''}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.firecrawlCallCount} Firecrawl call(s)
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* sources — real, with read-time authority classification */}
        <Section index={4} title="Sources" meta={`${run.sources.length} retrieved`}>
          <SourceList sources={run.sources} quality={run.sourceQuality} />
        </Section>

        {/* technical details — real output / schema / task */}
        <Section index={5} title="Technical details">
          <div className="mb-3 flex flex-wrap items-center gap-1">
            {techTabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs transition-colors',
                  tab === t
                    ? 'bg-surface-raised font-medium text-foreground ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'Output' ? (
            outputStr ? <CodeBlock code={outputStr} /> : <Empty>No output recorded for this run.</Empty>
          ) : null}
          {tab === 'Expected schema' ? (
            schemaStr ? <CodeBlock code={schemaStr} /> : <Empty>This evaluation has no expected schema.</Empty>
          ) : null}
          {tab === 'Task' ? (
            <div className="rounded-lg border border-border bg-surface p-4 font-mono text-xs leading-relaxed text-foreground/90">
              {run.evaluation.taskPrompt}
              <div className="mt-3 border-t border-border pt-3 text-muted-foreground">
                evaluation_id: {run.evaluationId}
              </div>
            </div>
          ) : null}
        </Section>
      </PageBody>
    </>
  );
}
