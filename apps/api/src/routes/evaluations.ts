/**
 * Evaluation routes: create/list/get evaluations and trigger a run.
 *
 * Input is validated with the shared Zod schema. User URLs are SSRF-checked.
 * Running a run is executed in-process via the orchestrator (MVP JobRunner).
 */

import type { FastifyInstance } from 'fastify';
import {
  createEvaluationSchema,
  ok,
  ExecutionStrategy,
  RunStatus,
  CrawlOpsError,
  FailureCategory,
} from '@crawlops/shared';
import type { AppContext } from '../context.js';
import { serializeEvaluation, serializeRun } from '../serializers.js';
import { validateUserUrls } from '../security/url-guard.js';
import { isDbConnectivityError, DB_UNAVAILABLE_RESPONSE } from '../db-errors.js';

const DEMO_USER_EMAIL = 'demo@crawlops.local';

async function getOrCreateDemoUser(ctx: AppContext): Promise<string> {
  const user = await ctx.prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL },
  });
  return user.id;
}

export async function registerEvaluationRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  // Create evaluation
  app.post('/api/evaluations', async (request, reply) => {
    const parsed = createEvaluationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }
    const input = parsed.data;

    const urlCheck = validateUserUrls(input.startingUrls);
    if (!urlCheck.ok) {
      return reply.code(400).send({
        error: { code: 'UNSAFE_URL', message: urlCheck.reason ?? 'unsafe URL' },
      });
    }

    // AGENT produces structured output, so it needs a target schema. Reject
    // (safely, 400) rather than creating an evaluation that can never run.
    if (input.strategy === ExecutionStrategy.AGENT && !input.expectedSchema) {
      return reply.code(400).send({
        error: {
          code: 'AGENT_SCHEMA_REQUIRED',
          category: FailureCategory.AGENT_SCHEMA_REQUIRED,
          message: 'AGENT strategy requires an expected output schema.',
        },
      });
    }

    try {
      const userId = await getOrCreateDemoUser(ctx);
      const evaluation = await ctx.prisma.evaluation.create({
        data: {
          userId,
          name: input.name,
          taskPrompt: input.taskPrompt,
          startingUrls: input.startingUrls,
          strategy: input.strategy,
          expectedSchema: (input.expectedSchema ?? undefined) as never,
          maxRetries: input.maxRetries,
          maxFirecrawlCalls: input.maxFirecrawlCalls,
          timeoutMs: input.timeoutMs,
          minSources: input.minSources,
        },
      });
      return reply.code(201).send(ok(serializeEvaluation(evaluation)));
    } catch (error) {
      // Transient DB connectivity (e.g. cold-start before the pool is ready)
      // -> safe, structured 503. Real details are logged, never sent to clients.
      if (isDbConnectivityError(error)) {
        ctx.logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'create evaluation: database unavailable',
        );
        return reply.code(503).send(DB_UNAVAILABLE_RESPONSE);
      }
      throw error; // genuine bug -> handled by the global error handler
    }
  });

  // List evaluations
  app.get('/api/evaluations', async () => {
    const rows = await ctx.prisma.evaluation.findMany({ orderBy: { createdAt: 'desc' } });
    return ok(rows.map(serializeEvaluation));
  });

  // Get one evaluation
  app.get<{ Params: { id: string } }>('/api/evaluations/:id', async (request, reply) => {
    const row = await ctx.prisma.evaluation.findUnique({ where: { id: request.params.id } });
    if (!row) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Evaluation not found' } });
    }
    return ok(serializeEvaluation(row));
  });

  // Run an evaluation
  app.post<{ Params: { id: string } }>('/api/evaluations/:id/run', async (request, reply) => {
    if (!ctx.orchestrator) {
      return reply.code(503).send({
        error: {
          code: 'FIRECRAWL_UNAVAILABLE',
          category: FailureCategory.AUTH_ERROR,
          message: 'FIRECRAWL_API_KEY is not configured; cannot execute runs.',
        },
      });
    }

    let run;
    try {
      const evaluation = await ctx.prisma.evaluation.findUnique({ where: { id: request.params.id } });
      if (!evaluation) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Evaluation not found' } });
      }
      // Defensive: an AGENT evaluation with no schema can never produce a valid
      // structured result. Reject before creating a useless Run row.
      if (evaluation.strategy === ExecutionStrategy.AGENT && evaluation.expectedSchema == null) {
        return reply.code(400).send({
          error: {
            code: 'AGENT_SCHEMA_REQUIRED',
            category: FailureCategory.AGENT_SCHEMA_REQUIRED,
            message: 'This AGENT evaluation has no expected schema, so it cannot produce a valid result.',
          },
        });
      }
      // Create the run as PENDING, then execute in-process (MVP JobRunner).
      run = await ctx.prisma.run.create({
        data: {
          evaluationId: evaluation.id,
          status: RunStatus.PENDING,
          strategy: (evaluation.strategy as ExecutionStrategy) ?? ExecutionStrategy.SEARCH,
        },
      });
    } catch (error) {
      if (isDbConnectivityError(error)) {
        ctx.logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'start run: database unavailable',
        );
        return reply.code(503).send(DB_UNAVAILABLE_RESPONSE);
      }
      throw error;
    }

    // Execute in-process. The orchestrator persists attempt/source/result rows
    // and records failure state on the run itself. A thrown error here is either
    // a swallowed run failure (row reflects it) or a transient DB blip mid-run.
    try {
      await ctx.orchestrator.executeRun(run.id);
    } catch (error) {
      if (isDbConnectivityError(error)) {
        ctx.logger.error(
          { err: error instanceof Error ? error.message : String(error), runId: run.id },
          'run execution: database unavailable',
        );
        return reply.code(503).send(DB_UNAVAILABLE_RESPONSE);
      }
      const mapped = error instanceof CrawlOpsError ? error : null;
      ctx.logger.error({ err: mapped?.message ?? String(error), runId: run.id }, 'run execution error');
      // Non-DB error: the run row still reflects failure state; fall through.
    }

    // Final fetch/serialize — guard the transient-DB case here too so it returns
    // a structured 503 rather than a generic 500.
    try {
      const finalRun = await ctx.prisma.run.findUniqueOrThrow({ where: { id: run.id } });
      return reply.code(202).send(ok(serializeRun(finalRun)));
    } catch (error) {
      if (isDbConnectivityError(error)) {
        ctx.logger.error(
          { err: error instanceof Error ? error.message : String(error), runId: run.id },
          'run final fetch: database unavailable',
        );
        return reply.code(503).send(DB_UNAVAILABLE_RESPONSE);
      }
      throw error;
    }
  });
}
