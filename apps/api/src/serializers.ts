/**
 * Serializers: Prisma rows -> API contract shapes.
 *
 * WHY: The DB uses Date objects and Prisma enums; the API contract (shared Zod
 *      schemas) uses ISO strings. One place to convert keeps responses
 *      consistent and typed.
 */

import type {
  Evaluation as EvaluationContract,
  Run as RunContract,
  Source as SourceContract,
  ExecutionAttempt as AttemptContract,
  EvaluationResult as EvaluationResultContract,
  EvaluationCheck,
} from '@crawlops/shared';

type Dateish = Date | null;
const iso = (d: Dateish): string | null => (d ? d.toISOString() : null);

// Loose input types (Prisma payloads) to avoid a hard type dependency here.
interface EvaluationRow {
  id: string;
  name: string;
  taskPrompt: string;
  startingUrls: string[];
  strategy: string;
  expectedSchema: unknown;
  maxRetries: number;
  maxFirecrawlCalls: number;
  timeoutMs: number;
  minSources: number;
  createdAt: Date;
}

export function serializeEvaluation(e: EvaluationRow): EvaluationContract {
  return {
    id: e.id,
    name: e.name,
    taskPrompt: e.taskPrompt,
    startingUrls: e.startingUrls,
    strategy: e.strategy as EvaluationContract['strategy'],
    expectedSchema: (e.expectedSchema as Record<string, unknown> | null) ?? null,
    maxRetries: e.maxRetries,
    maxFirecrawlCalls: e.maxFirecrawlCalls,
    timeoutMs: e.timeoutMs,
    minSources: e.minSources,
    createdAt: e.createdAt.toISOString(),
  };
}

interface RunRow {
  id: string;
  evaluationId: string;
  status: string;
  strategy: string;
  startedAt: Dateish;
  finishedAt: Dateish;
  durationMs: number | null;
  attemptCount: number;
  errorCategory: string | null;
  createdAt: Date;
}

export function serializeRun(r: RunRow): RunContract {
  return {
    id: r.id,
    evaluationId: r.evaluationId,
    status: r.status as RunContract['status'],
    strategy: r.strategy as RunContract['strategy'],
    startedAt: iso(r.startedAt),
    finishedAt: iso(r.finishedAt),
    durationMs: r.durationMs,
    attemptCount: r.attemptCount,
    errorCategory: (r.errorCategory as RunContract['errorCategory']) ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

interface SourceRow {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  rank: number | null;
  contentRef: string | null;
  retrievedAt: Date;
}

export function serializeSource(s: SourceRow): SourceContract {
  return {
    id: s.id,
    url: s.url,
    title: s.title,
    description: s.description,
    rank: s.rank,
    contentRef: s.contentRef,
    retrievedAt: s.retrievedAt.toISOString(),
  };
}

interface AttemptRow {
  id: string;
  attemptNumber: number;
  strategy: string;
  status: string;
  errorCategory: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Dateish;
  durationMs: number | null;
  firecrawlCallCount: number;
}

export function serializeAttempt(a: AttemptRow): AttemptContract {
  return {
    id: a.id,
    attemptNumber: a.attemptNumber,
    strategy: a.strategy as AttemptContract['strategy'],
    status: a.status as AttemptContract['status'],
    errorCategory: (a.errorCategory as AttemptContract['errorCategory']) ?? null,
    errorMessage: a.errorMessage,
    startedAt: a.startedAt.toISOString(),
    finishedAt: iso(a.finishedAt),
    durationMs: a.durationMs,
    firecrawlCallCount: a.firecrawlCallCount,
  };
}

interface EvaluationResultRow {
  id: string;
  overallScore: number;
  status: string;
  recommendation: string;
  checks: unknown;
  supportedClaims: number | null;
  unsupportedClaims: number | null;
  missingFields: string[];
  reasoningSummary: string;
  evaluatorProvider: string;
  createdAt: Date;
}

export function serializeEvaluationResult(r: EvaluationResultRow): EvaluationResultContract {
  return {
    id: r.id,
    overallScore: r.overallScore,
    status: r.status as EvaluationResultContract['status'],
    recommendation: r.recommendation as EvaluationResultContract['recommendation'],
    checks: (r.checks as EvaluationCheck[]) ?? [],
    supportedClaims: r.supportedClaims,
    unsupportedClaims: r.unsupportedClaims,
    missingFields: r.missingFields,
    reasoningSummary: r.reasoningSummary,
    evaluatorProvider: r.evaluatorProvider,
    createdAt: r.createdAt.toISOString(),
  };
}
