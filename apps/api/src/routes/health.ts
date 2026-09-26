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
}
