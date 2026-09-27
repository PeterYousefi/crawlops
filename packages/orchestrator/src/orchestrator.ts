/**
 * Execution orchestrator — the core CrawlOps loop.
 *
 * WHAT: Owns TASK → FIRECRAWL → RESULT → EVALUATION → DATABASE for one run.
 * WHY:  This is the heart of the product. It is cloud-neutral and depends only
 *       on interfaces (FirecrawlClient, EvaluatorProvider, PrismaClient,
 *       BlobStore) so it can run in-process today and in a worker later.
 * HOW:  `executeRun(runId)` loads the evaluation, runs the strategy with bounded
 *       retries, stores each attempt + sources, evaluates, and writes the final
 *       Run status. Every step is logged with runId/attemptId trace context.
 */

import {
  AttemptStatus,
  RunStatus,
  CrawlOpsError,
  FailureCategory,
  classifyError,
  createLogger,
  withTrace,
  type Logger,
} from '@crawlops/shared';
import type { PrismaClient } from '@crawlops/database';
import type { BlobStore } from '@crawlops/database';
import type { FirecrawlClient } from '@crawlops/firecrawl';
import type { EvaluatorProvider, EvaluableSource } from '@crawlops/evaluation';
import { selectStrategy, type StrategyContext } from './strategy.js';

export interface OrchestratorDeps {
  prisma: PrismaClient;
  firecrawl: FirecrawlClient;
  evaluator: EvaluatorProvider;
  blobs: BlobStore;
  maxSearchResults: number;
  /** Timeout floor for the AGENT (structured extraction) strategy. Default 180s. */
  agentTimeoutMs?: number;
  /** Cost cap (Firecrawl credits) for AGENT extraction. Default 60. */
  maxAgentCredits?: number;
  logger?: Logger;
}

export class Orchestrator {
  private readonly logger: Logger;

  constructor(private readonly deps: OrchestratorDeps) {
    this.logger = deps.logger ?? createLogger();
  }

  /**
   * Execute an existing Run row (created as PENDING by the API). Bounded retries;
   * each attempt is persisted. Returns the final RunStatus.
   */
  async executeRun(runId: string): Promise<RunStatus> {
    const { prisma } = this.deps;
    const log = withTrace(this.logger, { runId });

    const run = await prisma.run.findUniqueOrThrow({
      where: { id: runId },
      include: { evaluation: true },
    });
    const evaluation = run.evaluation;

    const maxAttempts = evaluation.maxRetries + 1;
    const startedAt = new Date();
    await prisma.run.update({
      where: { id: runId },
      data: { status: RunStatus.RUNNING, startedAt },
    });

    const strategy = selectStrategy(run.strategy);
    // The AGENT (structured-extraction) strategy is a multi-source research job
    // that legitimately takes longer than a single search; give it a larger
    // timeout floor while keeping the evaluation's own timeout for SEARCH.
    const isAgent = run.strategy === 'AGENT';
    const strategyTimeoutMs = isAgent
      ? Math.max(evaluation.timeoutMs, this.deps.agentTimeoutMs ?? 180_000)
      : evaluation.timeoutMs;
    const context: StrategyContext = {
      taskPrompt: evaluation.taskPrompt,
      startingUrls: evaluation.startingUrls,
      maxFirecrawlCalls: evaluation.maxFirecrawlCalls,
      maxSearchResults: Math.min(this.deps.maxSearchResults, evaluation.maxFirecrawlCalls),
      timeoutMs: strategyTimeoutMs,
      expectedSchema: (evaluation.expectedSchema as Record<string, unknown> | null) ?? null,
      maxAgentCredits: this.deps.maxAgentCredits ?? 60,
    };

    let lastError: CrawlOpsError | null = null;
    let succeededAttempt: { output: unknown; sources: EvaluableSource[] } | null = null;

    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      const attemptStarted = new Date();
      const attempt = await prisma.executionAttempt.create({
        data: {
          runId,
          attemptNumber,
          strategy: run.strategy,
          status: AttemptStatus.RUNNING,
          startedAt: attemptStarted,
        },
      });
      const alog = withTrace(this.logger, { runId, attemptId: attempt.id });
      alog.info({ attemptNumber, strategy: run.strategy }, 'attempt started');

      try {
        const result = await strategy.execute(this.deps.firecrawl, context);

        // Persist sources (content offloaded to BlobStore).
        const evaluableSources: EvaluableSource[] = [];
        for (const s of result.sources) {
          let contentRef: string | null = null;
          if (s.content) {
            contentRef = await this.deps.blobs.put(runId, `s-${s.rank ?? 0}-${attempt.id}`, s.content);
          }
          await prisma.source.create({
            data: {
              runId,
              attemptId: attempt.id,
              url: s.url,
              title: s.title,
              description: s.description,
              rank: s.rank,
              contentRef,
            },
          });
          evaluableSources.push({
            url: s.url,
            title: s.title,
            description: s.description,
            content: s.content,
          });
        }

        const finishedAt = new Date();
        await prisma.executionAttempt.update({
          where: { id: attempt.id },
          data: {
            status: AttemptStatus.SUCCESS,
            finishedAt,
            durationMs: finishedAt.getTime() - attemptStarted.getTime(),
            firecrawlCallCount: result.firecrawlCallCount,
          },
        });

        alog.info({ sourceCount: evaluableSources.length }, 'attempt succeeded');
        succeededAttempt = { output: result.output, sources: evaluableSources };
        break;
      } catch (error) {
        const mapped = error instanceof CrawlOpsError ? error : classifyError(error);
        lastError = mapped;
        const finishedAt = new Date();
        await prisma.executionAttempt.update({
          where: { id: attempt.id },
          data: {
            status: AttemptStatus.FAILED,
            errorCategory: mapped.category,
            errorMessage: mapped.message,
            finishedAt,
            durationMs: finishedAt.getTime() - attemptStarted.getTime(),
          },
        });
        alog.warn(
          { category: mapped.category, retryable: mapped.retryable },
          'attempt failed',
        );

        // Stop early on non-retryable failures (e.g. auth) — retrying wastes credits.
        if (!mapped.retryable) break;
      }
    }

    // --- Evaluate + finalize ---
    return succeededAttempt
      ? await this.finalizeSuccess(runId, succeededAttempt, log)
      : await this.finalizeFailure(runId, lastError, log);
  }

  private async finalizeSuccess(
    runId: string,
    attempt: { output: unknown; sources: EvaluableSource[] },
    log: Logger,
  ): Promise<RunStatus> {
    const { prisma } = this.deps;
    const run = await prisma.run.findUniqueOrThrow({
      where: { id: runId },
      include: { evaluation: true },
    });

    let evalStatus: RunStatus;
    try {
      const evaluationResult = await this.deps.evaluator.evaluate({
        taskPrompt: run.evaluation.taskPrompt,
        output: attempt.output,
        sources: attempt.sources,
        expectedSchema:
          (run.evaluation.expectedSchema as Record<string, unknown> | null) ?? null,
        minSources: run.evaluation.minSources,
        timedOut: false,
      });

      await prisma.evaluationResult.create({
        data: {
          runId,
          overallScore: evaluationResult.overallScore,
          status: evaluationResult.status,
          recommendation: evaluationResult.recommendation,
          checks: evaluationResult.checks,
          supportedClaims: evaluationResult.supportedClaims,
          unsupportedClaims: evaluationResult.unsupportedClaims,
          missingFields: evaluationResult.missingFields,
          reasoningSummary: evaluationResult.reasoningSummary,
          evaluatorProvider: evaluationResult.evaluatorProvider,
        },
      });
      evalStatus = evaluationResult.status;
    } catch (error) {
      const mapped = classifyError(error);
      log.error({ err: mapped.message }, 'evaluator failed');
      const finishedAt = new Date();
      const attemptCount = await prisma.executionAttempt.count({ where: { runId } });
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: RunStatus.FAILED,
          errorCategory: FailureCategory.EVALUATOR_FAILURE,
          finishedAt,
          durationMs: run.startedAt ? finishedAt.getTime() - run.startedAt.getTime() : null,
          attemptCount,
          finalOutput: attempt.output as object,
        },
      });
      return RunStatus.FAILED;
    }

    const finishedAt = new Date();
    const attemptCount = await prisma.executionAttempt.count({ where: { runId } });
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: evalStatus,
        finishedAt,
        durationMs: run.startedAt ? finishedAt.getTime() - run.startedAt.getTime() : null,
        attemptCount,
        errorCategory: evalStatus === RunStatus.FAILED ? FailureCategory.INVALID_SCHEMA : null,
        finalOutput: attempt.output as object,
      },
    });
    log.info({ status: evalStatus }, 'run finalized');
    return evalStatus;
  }

  private async finalizeFailure(
    runId: string,
    error: CrawlOpsError | null,
    log: Logger,
  ): Promise<RunStatus> {
    const { prisma } = this.deps;
    const run = await prisma.run.findUniqueOrThrow({ where: { id: runId } });
    const finishedAt = new Date();
    const attemptCount = await prisma.executionAttempt.count({ where: { runId } });
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: RunStatus.FAILED,
        errorCategory: error?.category ?? FailureCategory.UNKNOWN,
        finishedAt,
        durationMs: run.startedAt ? finishedAt.getTime() - run.startedAt.getTime() : null,
        attemptCount,
      },
    });
    log.warn({ category: error?.category }, 'run failed after all attempts');
    return RunStatus.FAILED;
  }
}
