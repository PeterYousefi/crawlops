import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, ChevronRight, Loader2, Play, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/crawlops/app-shell';
import { cn } from '@/lib/utils';
import { api, ApiRequestError } from '@/api/client';
import type { CreateEvaluationInput } from '@crawlops/shared';

/** Friendly message for an API error, special-casing transient DB outages. */
function messageFor(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === 'DB_UNAVAILABLE' || err.code === 'NETWORK_ERROR') {
      return 'the service is warming up or temporarily unavailable. Please try again in a moment.';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Request failed';
}

const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 transition-colors focus:border-ring focus:ring-2 focus:ring-ring/25 focus:outline-none aria-[invalid=true]:border-destructive/70';

// A proper JSON Schema starter so strict types (e.g. boolean) are unambiguous.
const JSON_SCHEMA_STARTER = `{
  "type": "object",
  "required": ["rockets", "comparison"],
  "properties": {
    "rockets": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "operator", "firstFlight", "reusable", "payloadToLEO", "recentMilestone", "sourceUrl"],
        "properties": {
          "name": { "type": "string" },
          "operator": { "type": "string" },
          "firstFlight": { "type": "string" },
          "reusable": { "type": "boolean" },
          "payloadToLEO": { "type": "string" },
          "recentMilestone": { "type": "string" },
          "sourceUrl": { "type": "string" }
        }
      }
    },
    "comparison": { "type": "string" }
  }
}`;

function FormSection({
  index,
  title,
  description,
  aside,
  children,
}: {
  index: number;
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4 border-b border-border pb-2">
        <div>
          <h2 className="flex items-baseline gap-2.5 text-sm font-semibold tracking-tight">
            <span className="font-mono text-[11px] text-muted-foreground">
              {String(index).padStart(2, '0')}
            </span>
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-xs text-destructive">
      <AlertTriangle className="h-3 w-3 shrink-0" />
      {children}
    </p>
  );
}

/**
 * New evaluation — approved Lovable layout, REAL flow:
 *   create evaluation -> real evaluation id -> start real run -> real run id
 *   -> navigate to /runs/:realRunId. No mock timers / fake queued results.
 * Only fields the API accepts are submitted; the mock's evaluator-check catalog
 * (not a real API input) is intentionally omitted.
 */
export function CreateEvaluationPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [schema, setSchema] = useState('');
  const [strategy, setStrategy] = useState<CreateEvaluationInput['strategy']>('SEARCH');
  const [maxFirecrawlCalls, setMaxFirecrawlCalls] = useState(5);
  const [maxRetries, setMaxRetries] = useState(2);
  const [timeoutMs, setTimeoutMs] = useState(30000);
  const [minSources, setMinSources] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schemaState = useMemo(() => {
    if (!schema.trim())
      return { ok: true as const, required: 0, error: '', empty: true, kind: 'none' as const };
    try {
      const parsed = JSON.parse(schema) as Record<string, unknown>;
      // Mirror the backend: an object with type/properties/required/items/... is
      // a real JSON Schema; otherwise it's treated as an example output shape
      // that CrawlOps normalizes (all keys become required).
      const schemaKeys = ['type', 'properties', 'required', 'items', 'anyOf', 'oneOf', 'allOf', '$ref', 'enum'];
      const isJsonSchema =
        parsed != null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        schemaKeys.some((k) => k in parsed);
      const required = Array.isArray((parsed as { required?: unknown }).required)
        ? ((parsed as { required: unknown[] }).required.length)
        : 0;
      return {
        ok: true as const,
        required,
        error: '',
        empty: false,
        kind: isJsonSchema ? ('schema' as const) : ('example' as const),
      };
    } catch (e) {
      return { ok: false as const, required: 0, error: (e as Error).message, empty: false, kind: 'invalid' as const };
    }
  }, [schema]);

  const errors = {
    name: !name.trim() ? 'Give the evaluation a name.' : name.length > 200 ? 'Keep the name under 200 characters.' : null,
    query: !taskPrompt.trim() ? 'Describe the research task.' : null,
    schema: schema.trim() && !schemaState.ok ? schemaState.error : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);
  const lineCount = schema.split('\n').length;

  function format() {
    try {
      setSchema(JSON.stringify(JSON.parse(schema), null, 2));
    } catch {
      setTouched(true);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setTouched(true);
    setSubmitError(null);
    if (hasErrors) return;

    setSubmitting(true);
    try {
      let expectedSchema: Record<string, unknown> | null = null;
      if (schema.trim()) expectedSchema = JSON.parse(schema) as Record<string, unknown>;

      const input: CreateEvaluationInput = {
        name,
        taskPrompt,
        startingUrls: [],
        strategy,
        expectedSchema,
        maxRetries,
        maxFirecrawlCalls,
        timeoutMs,
        minSources,
      };

      // Phase 1 — create the evaluation. A failure here is a CREATE failure.
      let evaluation;
      try {
        evaluation = await api.createEvaluation(input);
      } catch (err) {
        setSubmitError(`Couldn't create the evaluation: ${messageFor(err)}`);
        setSubmitting(false);
        return;
      }

      // Phase 2 — start the run. A failure here is a RUN-START failure; the
      // evaluation already exists, so send the user to the evaluations list.
      let run;
      try {
        run = await api.runEvaluation(evaluation.id);
      } catch (err) {
        setSubmitError(
          `Evaluation "${evaluation.name}" was created, but starting the run failed: ${messageFor(err)}`,
        );
        toast.error('Run failed to start — the evaluation was saved.');
        setSubmitting(false);
        return;
      }

      toast.success(`Run ${run.status.toLowerCase()}`);
      navigate(`/runs/${run.id}`);
    } catch (err) {
      // Unexpected client-side error (e.g. JSON.parse) — not a create/run call.
      setSubmitError(messageFor(err));
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/evaluations" className="hover:text-foreground">
            Evaluations
          </Link>
        }
        title="New evaluation"
        description="An evaluation pairs a web research task with the structured output you expect back. Every run is graded against it."
      />
      <form onSubmit={onSubmit} noValidate>
        <PageBody>
          <div className="max-w-3xl space-y-8">
            <FormSection index={1} title="Research task" description="What the crawler and extractor should find.">
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-xs font-medium">
                  Name
                </label>
                <input
                  id="name"
                  value={name}
                  maxLength={200}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!show('name')}
                  placeholder="SaaS pricing tier scrape"
                  className={inputClass}
                />
                {show('name') ? <FieldError id="name-err">{show('name')}</FieldError> : null}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="query" className="block text-xs font-medium">
                    Task
                  </label>
                  <span className="font-mono text-[11px] text-muted-foreground">{taskPrompt.length} chars</span>
                </div>
                <textarea
                  id="query"
                  rows={5}
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  aria-invalid={!!show('query')}
                  placeholder="Find the current pricing tiers for Vercel, with monthly price and seat limits. Return as JSON."
                  className={cn(inputClass, 'resize-y leading-relaxed')}
                />
                {show('query') ? <FieldError id="query-err">{show('query')}</FieldError> : null}
              </div>
            </FormSection>

            <FormSection
              index={2}
              title="Expected output (optional)"
              description="Paste a real JSON Schema (used as-is) OR an example output object (CrawlOps normalizes it into a schema and requires every key). A mismatch fails the run with INVALID_SCHEMA."
              aside={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSchema(JSON_SCHEMA_STARTER)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
                  >
                    Insert JSON Schema starter
                  </button>
                  <button
                    type="button"
                    onClick={format}
                    disabled={!schemaState.ok || schemaState.empty}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:opacity-40"
                  >
                    <Wand2 className="h-3 w-3" /> Format
                  </button>
                </div>
              }
            >
              <div
                className={cn(
                  'overflow-hidden rounded-lg border bg-background transition-colors focus-within:ring-2',
                  show('schema') || !schemaState.ok
                    ? 'border-destructive/60 focus-within:ring-destructive/20'
                    : 'border-border focus-within:border-ring focus-within:ring-ring/20',
                )}
              >
                <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                  <span>schema.json</span>
                  <span>{lineCount} lines</span>
                </div>
                <textarea
                  id="schema"
                  aria-label="Expected schema (JSON)"
                  aria-invalid={!schemaState.ok}
                  spellCheck={false}
                  value={schema}
                  onChange={(e) => setSchema(e.target.value)}
                  rows={Math.max(8, Math.min(lineCount + 1, 28))}
                  placeholder={
                    '{\n  "type": "object",\n  "required": ["price", "inStock"],\n  "properties": {\n    "price": { "type": "string" },\n    "inStock": { "type": "boolean" }\n  }\n}'
                  }
                  className="scrollbar-thin w-full resize-y bg-transparent px-3 py-3 font-mono text-xs leading-6 whitespace-pre text-foreground/90 focus:outline-none"
                />
                <div
                  className={cn(
                    'flex items-center gap-2 border-t border-border px-3 py-2 font-mono text-[11px]',
                    schemaState.ok ? 'text-muted-foreground' : 'text-destructive',
                  )}
                >
                  {schemaState.empty ? (
                    <>No schema — grounding/structure checks still run.</>
                  ) : schemaState.ok && schemaState.kind === 'schema' ? (
                    <>
                      <Check className="h-3 w-3 text-success" /> detected a JSON Schema · used as-is ·{' '}
                      {schemaState.required} required top-level field(s)
                    </>
                  ) : schemaState.ok && schemaState.kind === 'example' ? (
                    <>
                      <Check className="h-3 w-3 text-warning" /> detected an example shape · CrawlOps will
                      normalize it to a JSON Schema and require every key
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3 w-3" /> {schemaState.error}
                    </>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Example shapes infer types from the JSON values. Use JSON Schema for strict typing
                (e.g. <code className="rounded bg-muted px-1 font-mono">{'"reusable": { "type": "boolean" }'}</code>).
              </p>
            </FormSection>

            <section className="rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                aria-expanded={advanced}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', advanced && 'rotate-90')} />
                <span className="flex-1">
                  <span className="block text-sm font-medium">Run settings</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {strategy} · ≤{maxFirecrawlCalls} calls · {maxRetries} retries · {timeoutMs / 1000}s · min {minSources} sources
                  </span>
                </span>
              </button>
              {advanced ? (
                <div className="grid gap-4 border-t border-border px-4 py-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="strategy" className="block text-xs font-medium">
                      Strategy
                    </label>
                    <select
                      id="strategy"
                      value={strategy}
                      onChange={(e) => setStrategy(e.target.value as CreateEvaluationInput['strategy'])}
                      className={inputClass}
                    >
                      <option value="SEARCH">SEARCH — Fast retrieval, lower Firecrawl usage</option>
                      <option value="AGENT">AGENT — Structured research, slower, higher Firecrawl credit usage</option>
                      <option value="AUTO">AUTO (maps to SEARCH)</option>
                    </select>
                    {strategy === 'AGENT' ? (
                      <p className="text-[11px] text-muted-foreground">
                        Firecrawl researches sources and returns an object matching your expected
                        output. Requires an expected output above.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="minSources" className="block text-xs font-medium">
                      Minimum sources
                    </label>
                    <input
                      id="minSources"
                      type="number"
                      min={0}
                      max={50}
                      value={minSources}
                      onChange={(e) => setMinSources(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                      className={cn(inputClass, 'font-mono')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="maxCalls" className="block text-xs font-medium">
                      Max Firecrawl calls
                    </label>
                    <input
                      id="maxCalls"
                      type="number"
                      min={1}
                      max={20}
                      value={maxFirecrawlCalls}
                      onChange={(e) => setMaxFirecrawlCalls(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                      className={cn(inputClass, 'font-mono')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="retries" className="block text-xs font-medium">
                      Max retries
                    </label>
                    <input
                      id="retries"
                      type="number"
                      min={0}
                      max={5}
                      value={maxRetries}
                      onChange={(e) => setMaxRetries(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                      className={cn(inputClass, 'font-mono')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="timeout" className="block text-xs font-medium">
                      Timeout (ms)
                    </label>
                    <input
                      id="timeout"
                      type="number"
                      min={1000}
                      max={120000}
                      step={1000}
                      value={timeoutMs}
                      onChange={(e) => setTimeoutMs(Math.max(1000, Math.min(120000, Number(e.target.value) || 1000)))}
                      className={cn(inputClass, 'font-mono')}
                    />
                  </div>
                </div>
              ) : null}
            </section>

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-4 text-xs" aria-live="polite">
                {submitError ? (
                  <FieldError id="submit-err">Couldn't create the evaluation: {submitError}</FieldError>
                ) : touched && hasErrors ? (
                  <span className="text-destructive">Fix the highlighted fields to continue.</span>
                ) : submitting ? (
                  <span className="font-mono text-muted-foreground">creating evaluation and running…</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/evaluations"
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {submitting ? 'Running…' : 'Create & run'}
                </button>
              </div>
            </div>
          </div>
        </PageBody>
      </form>
    </>
  );
}
