/**
 * Seed script.
 *
 * Seeds ONLY definitions: a default user and a demo evaluation suite
 * ("AI Developer Platform Comparison") with evaluation test cases.
 * It does NOT create Runs, Sources, or results — those must come from real
 * executions so metrics are never fabricated.
 */

import { PrismaClient, ExecutionStrategy } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_TASKS = [
  {
    name: 'Firecrawl — product overview',
    taskPrompt:
      'Find the official description, primary use case, and pricing tiers for Firecrawl. Return as JSON.',
    startingUrls: ['https://firecrawl.dev'],
  },
  {
    name: 'Vercel — pricing tiers',
    taskPrompt:
      'Find the current pricing tiers and free-tier limits for Vercel. Return as JSON with tier names and prices.',
    startingUrls: ['https://vercel.com/pricing'],
  },
  {
    name: 'Supabase — product & pricing',
    taskPrompt:
      'Find what Supabase offers and its pricing tiers, including the free tier. Return as JSON.',
    startingUrls: ['https://supabase.com/pricing'],
  },
  {
    name: 'Cloudflare — Workers overview',
    taskPrompt:
      'Find what Cloudflare Workers is, its free-tier limits, and paid pricing. Return as JSON.',
    startingUrls: ['https://developers.cloudflare.com/workers/'],
  },
  {
    name: 'Pinecone — vector DB overview',
    taskPrompt:
      'Find what Pinecone offers, its main use case, and pricing tiers. Return as JSON.',
    startingUrls: ['https://www.pinecone.io/pricing/'],
  },
];

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: 'demo@crawlops.local' },
    update: {},
    create: { email: 'demo@crawlops.local' },
  });

  const suite = await prisma.evaluationSuite.create({
    data: {
      name: 'AI Developer Platform Comparison',
      description:
        'Research official product and pricing information for popular developer platforms.',
    },
  });

  let order = 0;
  for (const task of DEMO_TASKS) {
    const evaluation = await prisma.evaluation.create({
      data: {
        userId: user.id,
        name: task.name,
        taskPrompt: task.taskPrompt,
        startingUrls: task.startingUrls,
        strategy: ExecutionStrategy.SEARCH,
        maxRetries: 2,
        maxFirecrawlCalls: 5,
        timeoutMs: 30_000,
        minSources: 1,
      },
    });
    await prisma.suiteEvaluation.create({
      data: { suiteId: suite.id, evaluationId: evaluation.id, order: order++ },
    });
  }

  console.log(`Seeded user ${user.email}, suite "${suite.name}" with ${DEMO_TASKS.length} evaluations.`);
  console.log('No runs/results seeded — those come from real executions only.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
