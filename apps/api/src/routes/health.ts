/**
 * Health route.
 *
 * Reports liveness and the status of optional dependencies so operators (and the
 * frontend) can see graceful degradation: DB reachability and whether Firecrawl
 * is configured. Never throws — always returns a status object.
 */

import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';

export async function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /**
   * Liveness: is the process up and serving? Always returns 200 and NEVER
   * depends on external services. A transient Firecrawl or DB outage must not
   * cause the orchestrator (Container Apps) to kill and restart the container.
   * It still reports dependency status for observability.
   */
  app.get('/api/health', async () => {
    let dbOk = false;
    let dbMessage = 'not configured';
    if (ctx.config.databaseUrl) {
      try {
        await ctx.prisma.$queryRaw`SELECT 1`;
        dbOk = true;
        dbMessage = 'reachable';
      } catch (e) {
        dbMessage = e instanceof Error ? e.message : 'unreachable';
      }
    }

    return {
      data: {
        status: 'ok',
        dependencies: {
          database: { ok: dbOk, message: dbMessage },
          firecrawl: {
            ok: ctx.firecrawl !== null,
            message: ctx.firecrawl ? 'configured' : 'FIRECRAWL_API_KEY not set',
          },
          evaluator: { ok: true, message: ctx.evaluator.name },
        },
      },
    };
  });

  /**
   * Readiness: can the app actually serve traffic that needs its critical
   * dependency (PostgreSQL)? Returns 503 when the DB is unreachable/unconfigured
   * so a load balancer can hold traffic until the DB is ready. Firecrawl is NOT
   * treated as critical for readiness (it's an external API used per-run).
   */
  app.get('/api/ready', async (_request, reply) => {
    if (!ctx.config.databaseUrl) {
      return reply.code(503).send({
        data: { status: 'not_ready', reason: 'DATABASE_URL not configured' },
      });
    }
    try {
      await ctx.prisma.$queryRaw`SELECT 1`;
      return reply.code(200).send({ data: { status: 'ready' } });
    } catch (e) {
      return reply.code(503).send({
        data: { status: 'not_ready', reason: e instanceof Error ? e.message : 'db unreachable' },
      });
    }
  });
}
