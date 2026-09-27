import { describe, it, expect } from 'vitest';
import { RunStatus } from '@crawlops/shared';
import { DeterministicEvaluator } from './deterministic.js';
import type { EvaluationInput } from './types.js';

const evaluator = new DeterministicEvaluator();

function baseInput(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    taskPrompt: 'Find pricing',
    output: { price: '$20' },
    sources: [
      { url: 'https://example.com/a', title: 'A', description: null, content: null },
      { url: 'https://example.com/b', title: 'B', description: null, content: null },
    ],
    expectedSchema: null,
    minSources: 1,
    timedOut: false,
    ...overrides,
  };
}

describe('DeterministicEvaluator', () => {
  it('returns SUCCESS when all checks pass', async () => {
    const result = await evaluator.evaluate(baseInput());
    expect(result.status).toBe(RunStatus.SUCCESS);
    expect(result.overallScore).toBe(1);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('returns FAILED when no sources meet the minimum (critical)', async () => {
    const result = await evaluator.evaluate(baseInput({ sources: [], minSources: 1 }));
    expect(result.status).toBe(RunStatus.FAILED);
    expect(result.checks.find((c) => c.id === 'source_count')?.passed).toBe(false);
  });

  it('returns FAILED on timeout (critical)', async () => {
    const result = await evaluator.evaluate(baseInput({ timedOut: true }));
    expect(result.status).toBe(RunStatus.FAILED);
  });

  it('returns PARTIAL on a non-critical failure (duplicate sources)', async () => {
    const result = await evaluator.evaluate(
      baseInput({
        sources: [
          { url: 'https://example.com/a', title: 'A', description: null, content: null },
          { url: 'https://example.com/a', title: 'A', description: null, content: null },
        ],
      }),
    );
    expect(result.status).toBe(RunStatus.PARTIAL);
    expect(result.checks.find((c) => c.id === 'duplicate_sources')?.passed).toBe(false);
  });

  it('flags an invalid source URL (non-critical => PARTIAL)', async () => {
    const result = await evaluator.evaluate(
      baseInput({
        sources: [{ url: 'not-a-url', title: null, description: null, content: null }],
      }),
    );
    expect(result.checks.find((c) => c.id === 'url_validity')?.passed).toBe(false);
    expect(result.status).toBe(RunStatus.PARTIAL);
  });

  it('validates against an expected schema and reports missing fields (critical)', async () => {
    const schema = {
      type: 'object',
      required: ['price', 'currency'],
      properties: { price: { type: 'string' }, currency: { type: 'string' } },
    };
    const result = await evaluator.evaluate(
      baseInput({ output: { price: '$20' }, expectedSchema: schema }),
    );
    expect(result.status).toBe(RunStatus.FAILED);
    expect(result.missingFields).toContain('currency');
    expect(result.checks.find((c) => c.id === 'schema_validation')?.passed).toBe(false);
  });

  it('passes schema validation when the output conforms', async () => {
    const schema = {
      type: 'object',
      required: ['price'],
      properties: { price: { type: 'string' } },
    };
    const result = await evaluator.evaluate(
      baseInput({ output: { price: '$20' }, expectedSchema: schema }),
    );
    expect(result.status).toBe(RunStatus.SUCCESS);
    expect(result.checks.find((c) => c.id === 'schema_validation')?.passed).toBe(true);
  });

  it('FAILS when a pasted example-object schema is not satisfied (rocket bug regression)', async () => {
    // The exact style the user entered: an EXAMPLE object, not a JSON Schema.
    const exampleSchema = {
      rockets: [
        {
          name: 'string',
          operator: 'string',
          reusable: 'boolean',
          firstFlight: 'string',
          payloadToLEO: 'string',
          recentMilestone: 'string',
          sourceUrl: 'string',
        },
      ],
      comparison: 'string',
    };
    // The SEARCH strategy's actual output shape — missing rockets/comparison.
    const searchOutput = { query: 'x', topResults: [], resultCount: 0 };
    const result = await evaluator.evaluate(
      baseInput({ output: searchOutput, expectedSchema: exampleSchema }),
    );
    expect(result.checks.find((c) => c.id === 'schema_validation')?.passed).toBe(false);
    expect(result.status).toBe(RunStatus.FAILED);
    expect(result.missingFields).toEqual(expect.arrayContaining(['rockets', 'comparison']));
  });

  it('PASSES a pasted example-object schema when the output actually matches', async () => {
    const exampleSchema = { rockets: [{ name: 'string' }], comparison: 'string' };
    const goodOutput = {
      rockets: [{ name: 'Falcon 9' }],
      comparison: 'Falcon 9 leads on reuse.',
    };
    const result = await evaluator.evaluate(
      baseInput({ output: goodOutput, expectedSchema: exampleSchema }),
    );
    expect(result.checks.find((c) => c.id === 'schema_validation')?.passed).toBe(true);
    expect(result.status).toBe(RunStatus.SUCCESS);
  });
});
