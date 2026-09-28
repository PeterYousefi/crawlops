import { describe, it, expect } from 'vitest';
import { createLogger } from '@crawlops/shared';
import { DeterministicEvaluator } from '@crawlops/evaluation';
import type { AppContext } from './context.js';
import { buildApp } from './app.js';

/** A minimal context with no DB and no Firecrawl, to test health degradation. */
function stubContext(): AppContext {
  return {
    config: {
      nodeEnv: 'test',
      logLevel: 'silent',
      firecrawlApiKey: undefined,
      databaseUrl: undefined,
      evaluatorProvider: 'deterministic',
      openaiApiKey: undefined,
      openaiEvaluatorModel: 'gpt-4o-mini',
      maxFirecrawlCallsPerRun: 5,
      maxSearchResults: 5,
      maxRetries: 2,
      firecrawlTimeoutMs: 30_000,
      agentTimeoutMs: 180_000,
      maxAgentCredits: 60,
    },
    logger: createLogger(),
    // Not used by the health route when databaseUrl is undefined.
    prisma: {} as AppContext['prisma'],
    blobs: { put: async () => 'local://x', get: async () => null },
    evaluator: new DeterministicEvaluator(),
    firecrawl: null,
    orchestrator: null,
  };
}

describe('GET /api/health', () => {
  it('reports degraded dependencies without crashing', async () => {
    const app = await buildApp(stubContext());
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: { status: string; dependencies: Record<string, { ok: boolean } | undefined> };
    };
    expect(body.data.status).toBe('ok');
    expect(body.data.dependencies.database?.ok).toBe(false); // not configured
    expect(body.data.dependencies.firecrawl?.ok).toBe(false); // no key
    expect(body.data.dependencies.evaluator?.ok).toBe(true); // always available
    await app.close();
  });
});

describe('empty-body JSON POST tolerance', () => {
  it('does not 500 when Content-Type is application/json but the body is empty', async () => {
    const ctx = stubContext();
    ctx.prisma = {
      evaluation: { findUnique: async () => ({ id: 'e1', strategy: 'SEARCH' }) },
    } as unknown as AppContext['prisma'];
    const app = await buildApp(ctx);
    // Body-less POST with a JSON content-type (what the browser sent). With the
    // custom content-type parser this must NOT be a 500; here it returns 503
    // because Firecrawl/orchestrator is absent in the stub — not an empty-body 500.
    const res = await app.inject({
      method: 'POST',
      url: '/api/evaluations/e1/run',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });
    expect(res.statusCode).not.toBe(500);
    await app.close();
  });
});

describe('AGENT requires a schema', () => {
  it('rejects creating an AGENT evaluation with no expectedSchema (400 AGENT_SCHEMA_REQUIRED)', async () => {
    const ctx = stubContext();
    const app = await buildApp(ctx);
    const res = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      payload: {
        name: 'no schema agent',
        taskPrompt: 'compare things',
        strategy: 'AGENT',
        // no expectedSchema
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('AGENT_SCHEMA_REQUIRED');
    await app.close();
  });

  it('allows creating a SEARCH evaluation with no schema', async () => {
    const ctx = stubContext();
    let created = false;
    ctx.prisma = {
      user: { upsert: async () => ({ id: 'u1' }) },
      evaluation: {
        create: async () => {
          created = true;
          return {
            id: 'e1',
            name: 'x',
            taskPrompt: 'y',
            startingUrls: [],
            strategy: 'SEARCH',
            expectedSchema: null,
            maxRetries: 2,
            maxFirecrawlCalls: 5,
            timeoutMs: 30000,
            minSources: 1,
            createdAt: new Date(),
          };
        },
      },
    } as unknown as AppContext['prisma'];
    const app = await buildApp(ctx);
    const res = await app.inject({
      method: 'POST',
      url: '/api/evaluations',
      payload: { name: 'search ok', taskPrompt: 'find things', strategy: 'SEARCH' },
    });
    expect(res.statusCode).toBe(201);
    expect(created).toBe(true);
    await app.close();
  });
});

describe('GET /api/ready', () => {
  it('returns 503 when the database is not configured', async () => {
    const app = await buildApp(stubContext());
    const res = await app.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { data: { status: string } };
    expect(body.data.status).toBe('not_ready');
    await app.close();
  });
});

describe('POST /api/evaluations/:id/run without Firecrawl', () => {
  it('returns 503 with a clear error', async () => {
    const ctx = stubContext();
    // Give it a prisma stub that returns an evaluation.
    ctx.prisma = {
      evaluation: { findUnique: async () => ({ id: 'e1', strategy: 'SEARCH' }) },
    } as unknown as AppContext['prisma'];
    const app = await buildApp(ctx);
    const res = await app.inject({ method: 'POST', url: '/api/evaluations/e1/run' });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('FIRECRAWL_UNAVAILABLE');
    await app.close();
  });
});
