/**
 * Run routes: full report, attempts, sources, evaluation result.
 */

import type { FastifyInstance } from 'fastify';
import { ok, computeAuthorityMetrics, type RunListItem } from '@crawlops/shared';
import type { AppContext } from '../context.js';
import {
  serializeRun,
  serializeAttempt,
  serializeSource,
  serializeEvaluation,
  serializeEvaluationResult,
} from '../serializers.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function registerRunRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // List recent persisted runs, newest first. Read-only. Joins the evaluation
  // name and the evaluation result's overall score so lists render in one call.
  app.get<{ Querystring: { limit?: string } }>('/api/runs', async (request) => {
    const raw = Number(request.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(raw))) : DEFAULT_LIMIT;

    const rows = await ctx.prisma.run.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        evaluation: { select: { name: true } },
        evaluationResult: { select: { overallScore: true } },
      },
    });

    const items: RunListItem[] = rows.map((r) => ({
      ...serializeRun(r),
      evaluationName: r.evaluation.name,
      overallScore: r.evaluationResult ? r.evaluationResult.overallScore : null,
    }));
    return ok(items);
  });

  // Full run report
  app.get<{ Params: { id: string } }>('/api/runs/:id', async (request, reply) => {
    const run = await ctx.prisma.run.findUnique({
      where: { id: request.params.id },
      include: {
        evaluation: true,
        attempts: { orderBy: { attemptNumber: 'asc' } },
        sources: { orderBy: { rank: 'asc' } },
        evaluationResult: true,
      },
    });
    if (!run) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    }

    // Source-quality summary derived from the run's persisted source URLs. This
    // reuses the rows we already fetched (no extra query, no N+1).
    const quality = computeAuthorityMetrics(run.sources.map((s) => s.url));

    return ok({
      ...serializeRun(run),
      evaluation: serializeEvaluation(run.evaluation),
      attempts: run.attempts.map(serializeAttempt),
      sources: run.sources.map(serializeSource),
      evaluationResult: run.evaluationResult
        ? serializeEvaluationResult(run.evaluationResult)
        : null,
      finalOutput: run.finalOutput ?? null,
      sourceQuality: {
        totalSources: quality.totalSources,
        primarySources: quality.primarySources,
        secondarySources: quality.secondarySources,
        communitySources: quality.communitySources,
        unknownSources: quality.unknownSources,
        primaryShare: quality.primaryShare,
      },
    });
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id/attempts', async (request) => {
    const rows = await ctx.prisma.executionAttempt.findMany({
      where: { runId: request.params.id },
      orderBy: { attemptNumber: 'asc' },
    });
    return ok(rows.map(serializeAttempt));
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id/sources', async (request) => {
    const rows = await ctx.prisma.source.findMany({
      where: { runId: request.params.id },
      orderBy: { rank: 'asc' },
    });
    return ok(rows.map(serializeSource));
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id/evaluation', async (request, reply) => {
    const row = await ctx.prisma.evaluationResult.findUnique({
      where: { runId: request.params.id },
    });
    if (!row) {
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'No evaluation result for this run' } });
    }
    return ok(serializeEvaluationResult(row));
  });
}
