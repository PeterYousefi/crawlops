/**
 * Phase 0.75 — full core-loop proof.
 *
 * Proves end-to-end: TASK → FIRECRAWL → RESULT → EVALUATION → DATABASE → READ BACK
 * using the REAL Firecrawl API and a REAL PostgreSQL database.
 *
 * Requires: DATABASE_URL (migrated) and FIRECRAWL_API_KEY.
 *
 * Usage:
 *   DATABASE_URL=... FIRECRAWL_API_KEY=fc-... pnpm --filter @crawlops/orchestrator verify
 */

import { loadConfig, ExecutionStrategy, RunStatus } from '@crawlops/shared';
import { FirecrawlAdapter } from '@crawlops/firecrawl';
import { createEvaluator } from '@crawlops/evaluation';
import { prisma, LocalBlobStore } from '@crawlops/database';
import { Orchestrator } from '../src/index.js';

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.databaseUrl) {
    console.error('\n[BLOCKED] DATABASE_URL is not set. Start Postgres and migrate first.');
    process.exit(2);
  }
  if (!config.firecrawlApiKey) {
    console.error('\n[BLOCKED] FIRECRAWL_API_KEY is not set. This proof needs the real API.');
    process.exit(2);
  }

  const firecrawl = new FirecrawlAdapter(config.firecrawlApiKey, {
    defaultTimeoutMs: config.firecrawlTimeoutMs,
  });
  const evaluator = createEvaluator(config);
  const blobs = new LocalBlobStore();

  // Set up a user + evaluation + a PENDING run (as the API would).
  const user = await prisma.user.upsert({
    where: { email: 'loop@crawlops.local' },
    update: {},
    create: { email: 'loop@crawlops.local' },
  });
  const evaluation = await prisma.evaluation.create({
    data: {
      userId: user.id,
      name: 'Core loop proof',
      taskPrompt: 'Find the official description and primary use case of Firecrawl.',
      strategy: ExecutionStrategy.SEARCH,
      maxRetries: config.maxRetries,
      maxFirecrawlCalls: config.maxFirecrawlCallsPerRun,
      minSources: 1,
    },
  });
  const run = await prisma.run.create({
    data: {
      evaluationId: evaluation.id,
      status: RunStatus.PENDING,
      strategy: ExecutionStrategy.SEARCH,
    },
  });

  console.log(`\n=== Phase 0.75: core loop for run ${run.id} ===\n`);

  const orchestrator = new Orchestrator({
    prisma,
    firecrawl,
    evaluator,
    blobs,
    maxSearchResults: config.maxSearchResults,
  });

  const finalStatus = await orchestrator.executeRun(run.id);

  // Read the full report back.
  const report = await prisma.run.findUniqueOrThrow({
    where: { id: run.id },
    include: { attempts: true, sources: true, evaluationResult: true, evaluation: true },
  });

  console.log('=== Read back from PostgreSQL ===');
  console.log(`  status        = ${report.status} (returned ${finalStatus})`);
  console.log(`  durationMs    = ${report.durationMs}`);
  console.log(`  attempts      = ${report.attempts.length}`);
  console.log(`  sources       = ${report.sources.length}`);
  console.log(`  evaluation    = score ${report.evaluationResult?.overallScore}, ${report.evaluationResult?.recommendation}`);
  console.log(`  summary       = ${report.evaluationResult?.reasoningSummary}`);
  console.log('\n[OK] TASK → FIRECRAWL → RESULT → EVALUATION → DATABASE → READ BACK succeeded.\n');
}

main()
  .catch((e) => {
    console.error('\n[FAILED]', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
