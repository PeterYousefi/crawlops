import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RunStatus,
  AttemptStatus,
  CrawlOpsError,
  FailureCategory,
} from '@crawlops/shared';
import { MockFirecrawlClient } from '@crawlops/firecrawl';
import { DeterministicEvaluator } from '@crawlops/evaluation';
import type { BlobStore } from '@crawlops/database';
import { Orchestrator } from './orchestrator.js';

/**
 * A minimal in-memory Prisma stub. It records writes so we can assert on the
 * orchestrator's behavior without a real database. Only the methods the
 * orchestrator uses are implemented.
 */
function makeFakePrisma(evaluationOverrides: Record<string, unknown> = {}) {
  const evaluation = {
    id: 'eval1',
    taskPrompt: 'Find pricing for Example',
    startingUrls: [] as string[],
    strategy: 'SEARCH',
    expectedSchema: null,
    maxRetries: 2,
    maxFirecrawlCalls: 5,
    timeoutMs: 30_000,
    minSources: 1,
    ...evaluationOverrides,
  };
  const run: Record<string, unknown> = {
    id: 'run1',
    evaluationId: 'eval1',
    status: RunStatus.PENDING,
    strategy: evaluation.strategy,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    attemptCount: 0,
    errorCategory: null,
    evaluation,
  };
  const attempts: Array<Record<string, unknown>> = [];
  const sources: Array<Record<string, unknown>> = [];
  const evaluationResults: Array<Record<string, unknown>> = [];

  const prisma = {
    run: {
      findUniqueOrThrow: vi.fn(async () => ({ ...run, evaluation })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(run, data);
        return run;
      }),
    },
    executionAttempt: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const a = { id: `att${attempts.length + 1}`, ...data };
        attempts.push(a);
        return a;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const a = attempts.find((x) => x.id === where.id)!;
        Object.assign(a, data);
        return a;
      }),
      count: vi.fn(async () => attempts.length),
    },
    source: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        sources.push(data);
        return data;
      }),
    },
    evaluationResult: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        evaluationResults.push(data);
        return data;
      }),
    },
  };

  return { prisma, run, attempts, sources, evaluationResults };
}

const noopBlobs: BlobStore = {
  put: async () => 'local://noop',
  get: async () => null,
};

describe('Orchestrator', () => {
  let evaluator: DeterministicEvaluator;
  beforeEach(() => {
    evaluator = new DeterministicEvaluator();
  });

  it('runs the full loop and finalizes SUCCESS with a stored evaluation', async () => {
    const fake = makeFakePrisma();
    const orch = new Orchestrator({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: fake.prisma as any,
      firecrawl: new MockFirecrawlClient(),
      evaluator,
      blobs: noopBlobs,
      maxSearchResults: 3,
    });

    const status = await orch.executeRun('run1');
    expect(status).toBe(RunStatus.SUCCESS);
    expect(fake.attempts).toHaveLength(1);
    expect(fake.attempts[0]!.status).toBe(AttemptStatus.SUCCESS);
    expect(fake.evaluationResults).toHaveLength(1);
    expect(fake.run.status).toBe(RunStatus.SUCCESS);
  });

  it('AGENT strategy: structured output matching the schema -> SUCCESS', async () => {
    const schema = { rockets: [{ name: 'string' }], comparison: 'string' };
    const fake = makeFakePrisma({ strategy: 'AGENT', expectedSchema: schema });
    const agentOutput = {
      rockets: [{ name: 'Falcon 9' }],
      comparison: 'Falcon 9 leads on reuse.',
    };
    const orch = new Orchestrator({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: fake.prisma as any,
      firecrawl: new MockFirecrawlClient({
        agentExtractResult: {
          data: agentOutput,
          completed: true,
          sources: [
            { url: 'https://www.spacex.com/vehicles/falcon-9', title: null, description: null, rank: 1, content: null },
          ],
        },
      }),
      evaluator,
      blobs: noopBlobs,
      maxSearchResults: 3,
    });
    const status = await orch.executeRun('run1');
    expect(status).toBe(RunStatus.SUCCESS);
    expect(fake.run.finalOutput).toEqual(agentOutput);
    expect(fake.run.status).toBe(RunStatus.SUCCESS);
  });

  it('AGENT strategy: output missing required fields -> FAILED (honest)', async () => {
    const schema = { rockets: [{ name: 'string' }], comparison: 'string' };
    const fake = makeFakePrisma({ strategy: 'AGENT', expectedSchema: schema });
    const orch = new Orchestrator({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: fake.prisma as any,
      firecrawl: new MockFirecrawlClient({
        // Agent returned an incomplete object (missing comparison).
        agentExtractResult: { data: { rockets: [{ name: 'Falcon 9' }] }, completed: true, sources: [] },
      }),
      evaluator,
      blobs: noopBlobs,
      maxSearchResults: 3,
    });
    const status = await orch.executeRun('run1');
    expect(status).toBe(RunStatus.FAILED);
  });

  it('retries on a retryable failure then fails after exhausting attempts', async () => {
    const fake = makeFakePrisma({ maxRetries: 2 });
    const rateLimit = new CrawlOpsError({
      category: FailureCategory.RATE_LIMIT,
      message: 'rate limited',
      retryable: true,
    });
    const orch = new Orchestrator({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: fake.prisma as any,
      firecrawl: new MockFirecrawlClient({ throwOn: { search: rateLimit } }),
      evaluator,
      blobs: noopBlobs,
      maxSearchResults: 3,
    });

    const status = await orch.executeRun('run1');
    expect(status).toBe(RunStatus.FAILED);
    // maxRetries=2 => 3 attempts total.
    expect(fake.attempts).toHaveLength(3);
    expect(fake.run.errorCategory).toBe(FailureCategory.RATE_LIMIT);
  });

  it('does NOT retry on a non-retryable failure (auth) — stops after one attempt', async () => {
    const fake = makeFakePrisma({ maxRetries: 2 });
    const authErr = new CrawlOpsError({
      category: FailureCategory.AUTH_ERROR,
      message: 'bad key',
      retryable: false,
    });
    const orch = new Orchestrator({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: fake.prisma as any,
      firecrawl: new MockFirecrawlClient({ throwOn: { search: authErr } }),
      evaluator,
      blobs: noopBlobs,
      maxSearchResults: 3,
    });

    const status = await orch.executeRun('run1');
    expect(status).toBe(RunStatus.FAILED);
    expect(fake.attempts).toHaveLength(1);
    expect(fake.run.errorCategory).toBe(FailureCategory.AUTH_ERROR);
  });
});
