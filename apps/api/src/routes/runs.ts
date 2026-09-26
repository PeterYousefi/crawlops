/**
 * Run routes: full report, attempts, sources, evaluation result.
 */

import type { FastifyInstance } from 'fastify';
import { ok } from '@crawlops/shared';
import type { AppContext } from '../context.js';
import {
  serializeRun,
  serializeAttempt,
  serializeSource,
  serializeEvaluation,
  serializeEvaluationResult,
} from '../serializers.js';

export async function registerRunRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
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

    return ok({
      ...serializeRun(run),
      evaluation: serializeEvaluation(run.evaluation),
      attempts: run.attempts.map(serializeAttempt),
      sources: run.sources.map(serializeSource),
      evaluationResult: run.evaluationResult
        ? serializeEvaluationResult(run.evaluationResult)
        : null,
      finalOutput: run.finalOutput ?? null,
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
