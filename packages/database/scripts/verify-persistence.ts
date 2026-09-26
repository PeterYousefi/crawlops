/**
 * Phase 0.5 — persistence proof.
 *
 * Proves: create a Run record in PostgreSQL and read it back.
 * If FIRECRAWL_API_KEY is present, it first performs a REAL Firecrawl search and
 * stores the real result metadata + sources. If not, it clearly says so and
 * stores a minimal Run WITHOUT faking Firecrawl data.
 *
 * Requires DATABASE_URL (local Postgres via docker-compose) and a migrated DB.
 *
 * Usage:
 *   DATABASE_URL=... [FIRECRAWL_API_KEY=fc-...] pnpm --filter @crawlops/database verify
 */

import { ExecutionStrategy, RunStatus, AttemptStatus } from '@crawlops/shared';
import { FirecrawlAdapter, type SearchResult } from '@crawlops/firecrawl';
import { prisma, LocalBlobStore } from '../src/index.js';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('\n[BLOCKED] DATABASE_URL is not set. Start Postgres and set DATABASE_URL.');
    console.error('  docker compose -f infrastructure/docker/docker-compose.yml up -d');
    process.exit(2);
  }

  const blobs = new LocalBlobStore();

  // 1) Ensure a user + evaluation exist to attach the run to.
  const user = await prisma.user.upsert({
    where: { email: 'verify@crawlops.local' },
    update: {},
    create: { email: 'verify@crawlops.local' },
  });
  const evaluation = await prisma.evaluation.create({
    data: {
      userId: user.id,
      name: 'Persistence proof',
      taskPrompt: 'Find the official description of Firecrawl.',
      strategy: ExecutionStrategy.SEARCH,
    },
  });

  const startedAt = new Date();

  // 2) Optionally perform a REAL Firecrawl search.
  let search: SearchResult | null = null;
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (apiKey) {
    console.log('[info] FIRECRAWL_API_KEY present — performing a real search...');
    const client = new FirecrawlAdapter(apiKey);
    search = await client.search('Firecrawl web data API', { limit: 3 });
    console.log(`[info] search returned ${search.sources.length} sources in ${search.durationMs}ms`);
  } else {
    console.log('[info] FIRECRAWL_API_KEY absent — storing a Run without Firecrawl data (not faked).');
  }

  const finishedAt = new Date();
  const durationMs = search?.durationMs ?? finishedAt.getTime() - startedAt.getTime();

  // 3) Create the Run (+ attempt + sources when we have real data).
  const run = await prisma.run.create({
    data: {
      evaluationId: evaluation.id,
      status: search ? RunStatus.SUCCESS : RunStatus.PENDING,
      strategy: ExecutionStrategy.SEARCH,
      startedAt,
      finishedAt,
      durationMs,
      attemptCount: 1,
      finalOutput: search ? { sourceCount: search.sources.length } : undefined,
      attempts: {
        create: {
          attemptNumber: 1,
          strategy: ExecutionStrategy.SEARCH,
          status: search ? AttemptStatus.SUCCESS : AttemptStatus.RUNNING,
          startedAt,
          finishedAt,
          durationMs,
          firecrawlCallCount: search ? 1 : 0,
        },
      },
    },
    include: { attempts: true },
  });

  if (search) {
    const attemptId = run.attempts[0]?.id;
    for (const s of search.sources) {
      let contentRef: string | null = null;
      if (s.content) {
        contentRef = await blobs.put(run.id, `source-${s.rank ?? 0}`, s.content);
      }
      await prisma.source.create({
        data: {
          runId: run.id,
          attemptId,
          url: s.url,
          title: s.title,
          description: s.description,
          rank: s.rank,
          contentRef,
        },
      });
    }
  }

  // 4) Read it back.
  const readBack = await prisma.run.findUniqueOrThrow({
    where: { id: run.id },
    include: { attempts: true, sources: true, evaluation: true },
  });

  console.log('\n=== Persistence proof: Run read back from PostgreSQL ===');
  console.log(`  run.id        = ${readBack.id}`);
  console.log(`  evaluation    = ${readBack.evaluation.name}`);
  console.log(`  status        = ${readBack.status}`);
  console.log(`  strategy      = ${readBack.strategy}`);
  console.log(`  durationMs    = ${readBack.durationMs}`);
  console.log(`  attempts      = ${readBack.attempts.length}`);
  console.log(`  sources       = ${readBack.sources.length}`);
  console.log('\n[OK] REAL FIRECRAWL (if key) → RESULT → SAVE RUN → READ BACK succeeded.\n');
}

main()
  .catch((e) => {
    console.error('\n[FAILED]', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
