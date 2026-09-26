/**
 * Fastify app builder.
 *
 * WHAT: Constructs the Fastify instance, registers CORS, request limits, and all
 *       routes against a provided AppContext.
 * WHY:  Separating app construction from server startup lets tests build the app
 *       with a stubbed context and no network.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { AppContext } from './context.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerEvaluationRoutes } from './routes/evaluations.js';
import { registerRunRoutes } from './routes/runs.js';

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // we use our own pino logger via ctx
    bodyLimit: 256 * 1024, // 256KB cap on request bodies
  });

  await app.register(cors, {
    origin: true, // reflect request origin in dev; tighten per-env for production
  });

  await registerHealthRoutes(app, ctx);
  await registerEvaluationRoutes(app, ctx);
  await registerRunRoutes(app, ctx);

  app.setErrorHandler((error: Error, _request, reply) => {
    ctx.logger.error({ err: error.message }, 'unhandled route error');
    reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  return app;
}
