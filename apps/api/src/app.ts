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
import { isDbConnectivityError } from './db-errors.js';

/**
 * Derive a SAFE, non-sensitive error classification for the response body.
 * Never includes stack traces, connection strings, secrets, or query details —
 * only a stable code and a coarse category so clients (and we) can tell error
 * classes apart without a log store.
 */
function safeErrorInfo(error: unknown): { code: string; category: string; status: number } {
  if (isDbConnectivityError(error)) {
    return { code: 'DB_UNAVAILABLE', category: 'database', status: 503 };
  }
  const e = error as { name?: string; code?: string };
  // Prisma known request errors that are NOT connectivity (real data/query
  // problems) — surface the Prisma code so the failing class is identifiable.
  if (typeof e?.code === 'string' && /^P\d{4}$/.test(e.code)) {
    return { code: `PRISMA_${e.code}`, category: 'database', status: 500 };
  }
  if (typeof e?.name === 'string' && e.name.startsWith('Prisma')) {
    return { code: `PRISMA_${e.name}`, category: 'database', status: 500 };
  }
  return { code: 'INTERNAL_ERROR', category: 'unknown', status: 500 };
}

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // we use our own pino logger via ctx
    bodyLimit: 256 * 1024, // 256KB cap on request bodies
  });

  // Defensive: tolerate an empty body on requests that declare
  // `Content-Type: application/json` (e.g. a body-less POST /run). Fastify's
  // default JSON parser throws on an empty body, which would surface as a 500.
  // Treat empty/whitespace bodies as "no body" instead.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body: string, done) => {
      const trimmed = (body ?? '').trim();
      if (trimmed.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(trimmed));
      } catch (err) {
        // Malformed JSON -> 400, not 500.
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );

  // CORS: if WEB_ORIGIN is configured (production), allow only that origin.
  // Otherwise reflect the request origin (local dev convenience).
  await app.register(cors, {
    origin: ctx.config.webOrigin ? [ctx.config.webOrigin] : true,
  });

  await registerHealthRoutes(app, ctx);
  await registerEvaluationRoutes(app, ctx);
  await registerRunRoutes(app, ctx);

  app.setErrorHandler((error: Error, request, reply) => {
    const info = safeErrorInfo(error);
    // Log the real error name/code/message server-side (for when logs are
    // attached). Never expose message/stack to the client.
    ctx.logger.error(
      {
        err: error.message,
        name: (error as { name?: string }).name,
        code: (error as { code?: string }).code,
        route: request.url,
      },
      'unhandled route error',
    );
    reply.code(info.status).send({
      error: {
        code: info.code,
        category: info.category,
        message:
          info.status === 503
            ? 'A dependency is temporarily unavailable. Please retry in a moment.'
            : 'The server encountered an error handling this request.',
      },
    });
  });

  return app;
}
