/**
 * Server entry point.
 *
 * Builds the context (graceful degradation for optional deps) and starts Fastify.
 */

import { buildContext } from './context.js';
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const ctx = buildContext();
  const app = await buildApp(ctx);

  await app.listen({ port: PORT, host: HOST });
  ctx.logger.info({ port: PORT, host: HOST }, 'CrawlOps API listening');

  if (!ctx.config.databaseUrl) {
    ctx.logger.warn('DATABASE_URL not set — most endpoints will fail until a database is configured.');
  }
}

main().catch((error) => {
  console.error('Failed to start API:', error);
  process.exit(1);
});
