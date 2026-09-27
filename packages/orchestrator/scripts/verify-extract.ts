/**
 * Local end-to-end verification of the AGENT (structured extraction) strategy.
 *
 * Creates the exact rocket evaluation (AGENT strategy + the user's schema),
 * runs it through the REAL Orchestrator against REAL Firecrawl + local Postgres,
 * and prints the final structured output + evaluator result. No fabrication.
 *
 * Usage:
 *   DATABASE_URL=... FIRECRAWL_API_KEY=... pnpm --filter @crawlops/orchestrator verify-extract
 */

import { loadConfig, ExecutionStrategy, RunStatus } from '@crawlops/shared';
import { FirecrawlAdapter } from '@crawlops/firecrawl';
import { createEvaluator } from '@crawlops/evaluation';
import { prisma, LocalBlobStore } from '@crawlops/database';
import { Orchestrator } from '../src/index.js';

const ROCKET_SCHEMA = {
  rockets: [
    {
      name: 'string',
      operator: 'string',
      firstFlight: 'string',
      reusable: 'boolean',
      payloadToLEO: 'string',
      recentMilestone: 'string',
      sourceUrl: 'string',
    },
  ],
  comparison: 'string',
};

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.databaseUrl || !config.firecrawlApiKey) {
    console.error('Need DATABASE_URL and FIRECRAWL_API_KEY.');
    process.exit(2);
  }

  const firecrawl = new FirecrawlAdapter(config.firecrawlApiKey, {
    defaultTimeoutMs: config.firecrawlTimeoutMs,
  });
  const evaluator = createEvaluator(config);
  const blobs = new LocalBlobStore();

  const user = await prisma.user.upsert({
    where: { email: 'extract@crawlops.local' },
    update: {},
    create: { email: 'extract@crawlops.local' },
  });
  const evaluation = await prisma.evaluation.create({
    data: {
      userId: user.id,
      name: 'Reusable rocket comparison (AGENT extract)',
      taskPrompt:
        'Compare SpaceX Falcon 9, Rocket Lab Electron, and Blue Origin New Glenn. For each rocket, find the operator, first flight date, whether the rocket or any major stage is reusable, approximate payload capacity to low Earth orbit, and one notable recent mission or milestone. Prefer official company pages, NASA, or other primary sources. Then give a short conclusion comparing their roles in the launch market.',
      strategy: ExecutionStrategy.AGENT,
      expectedSchema: ROCKET_SCHEMA as object,
      maxRetries: 0,
      maxFirecrawlCalls: 5,
      timeoutMs: 30_000,
      minSources: 1,
    },
  });
  const run = await prisma.run.create({
    data: {
      evaluationId: evaluation.id,
      status: RunStatus.PENDING,
      strategy: ExecutionStrategy.AGENT,
    },
  });

  console.log(`\n=== AGENT extract for run ${run.id} (may take ~1 min) ===\n`);

  const orchestrator = new Orchestrator({
    prisma,
    firecrawl,
    evaluator,
    blobs,
    maxSearchResults: config.maxSearchResults,
    agentTimeoutMs: config.agentTimeoutMs,
    maxAgentCredits: config.maxAgentCredits,
  });

  const finalStatus = await orchestrator.executeRun(run.id);

  const report = await prisma.run.findUniqueOrThrow({
    where: { id: run.id },
    include: { evaluationResult: true, sources: true },
  });

  console.log('=== FINAL OUTPUT (real, from Firecrawl agent) ===');
  console.log(JSON.stringify(report.finalOutput, null, 2));
  console.log('\n=== EVALUATOR ===');
  console.log('run status:', report.status, '(returned', finalStatus + ')');
  console.log('errorCategory:', report.errorCategory);
  console.log('overallScore:', report.evaluationResult?.overallScore);
  const checks = (report.evaluationResult?.checks as Array<{ label: string; passed: boolean; detail: string }>) ?? [];
  for (const c of checks) console.log(`  [${c.passed ? 'PASS' : 'FAIL'}] ${c.label} — ${c.detail}`);
  console.log('sources persisted:', report.sources.length);
  for (const s of report.sources) console.log('   -', s.url);
}

main()
  .catch((e) => {
    console.error('\n[FAILED]', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
