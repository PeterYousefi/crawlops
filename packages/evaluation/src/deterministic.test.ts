import { describe, it, expect } from 'vitest';
import { RunStatus } from '@crawlops/shared';
import { DeterministicEvaluator } from './deterministic.js';
import type { EvaluationInput } from './types.js';

const evaluator = new DeterministicEvaluator();

function baseInput(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    taskPrompt: 'Find pricing',
    output: { price: '$20' },
    // Default sources include an official (PRIMARY) domain so the new
    // non-critical source_authority check passes for the baseline "all pass"
    // cases. Tests that target other checks override `sources` explicitly.
    sources: [
      { url: 'https://github.com/a', title: 'A', description: null, content: null },
      { url: 'https://docs.github.com/b', title: 'B', description: null, content: null },
    ],
    expectedSchema: null,
    minSources: 1,
    timedOut: false,
    ...overrides,
  };
}

describe('DeterministicEvaluator', () => {
  it('validates const-only JSON Schemas without treating them as examples', async () => {
    const expectedSchema = { const: { price: '$20' } };
    const matching = await evaluator.evaluate(baseInput({ expectedSchema }));
    const different = await evaluator.evaluate(
      baseInput({ expectedSchema, output: { price: '$30' } }),
    );
    expect(matching.status).toBe(RunStatus.SUCCESS);
    expect(different.status).toBe(RunStatus.FAILED);
    expect(different.checks.find((c) => c.id === 'schema_validation')?.passed).toBe(false);
  });

  it('accepts null fields and array items in a pasted example', async () => {
    const result = await evaluator.evaluate(
      baseInput({
        expectedSchema: { price: '$20', discount: null, unavailable: [null] },
        output: { price: '$30', discount: null, unavailable: [null, null] },
      }),
    );
    expect(result.status).toBe(RunStatus.SUCCESS);
    expect(result.checks.find((c) => c.id === 'schema_validation')?.passed).toBe(true);
  });

  it('rejects strings in fields inferred as null from a pasted example', async () => {
    const result = await evaluator.evaluate(
      baseInput({
        expectedSchema: { price: '$20', discount: null },
        output: { price: '$20', discount: 'null' },
      }),
    );
    expect(result.status).toBe(RunStatus.FAILED);
    expect(result.checks.find((c) => c.id === 'schema_validation')?.passed).toBe(false);
  });

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

  // ---- Source authority check (non-critical) ----

  // F. Zero sources: source_count (critical) fails => FAILED; the non-critical
  //    source_authority check is also present and failing.
  it('F: zero sources -> authority check fails (non-critical); run FAILED via source_count', async () => {
    const result = await evaluator.evaluate(baseInput({ sources: [], minSources: 1 }));
    const authority = result.checks.find((c) => c.id === 'source_authority');
    expect(authority).toBeDefined();
    expect(authority?.passed).toBe(false);
    expect(authority?.critical).toBe(false);
    expect(result.status).toBe(RunStatus.FAILED); // driven by critical source_count
  });

  // G. Mix with >=1 primary -> authority check passes; all checks pass => SUCCESS.
  it('G: mix with a primary source -> authority check passes, SUCCESS', async () => {
    const result = await evaluator.evaluate(
      baseInput({
        minSources: 1,
        sources: [
          { url: 'https://github.com/a', title: null, description: null, content: null },
          { url: 'https://docs.github.com/b', title: null, description: null, content: null },
          { url: 'https://nasa.gov/c', title: null, description: null, content: null },
          { url: 'https://techcrunch.com/d', title: null, description: null, content: null },
          { url: 'https://reddit.com/r/e', title: null, description: null, content: null },
        ],
      }),
    );
    expect(result.checks.find((c) => c.id === 'source_authority')?.passed).toBe(true);
    expect(result.status).toBe(RunStatus.SUCCESS);
  });

  // H. No primary sources but all critical checks pass -> PARTIAL.
  it('H: no primary sources (all critical pass) -> PARTIAL', async () => {
    const result = await evaluator.evaluate(
      baseInput({
        minSources: 1,
        sources: [
          { url: 'https://some-random-blog.example/x', title: null, description: null, content: null },
          { url: 'https://reddit.com/r/y', title: null, description: null, content: null },
        ],
      }),
    );
    const authority = result.checks.find((c) => c.id === 'source_authority');
    expect(authority?.passed).toBe(false);
    expect(authority?.critical).toBe(false);
    expect(result.status).toBe(RunStatus.PARTIAL);
  });

  // I. Critical schema failure + weak sources -> remains FAILED (not PARTIAL).
  it('I: critical schema failure with weak sources stays FAILED', async () => {
    const schema = {
      type: 'object',
      required: ['price', 'currency'],
      properties: { price: { type: 'string' }, currency: { type: 'string' } },
    };
    const result = await evaluator.evaluate(
      baseInput({
        output: { price: '$20' }, // missing currency -> critical schema fail
        expectedSchema: schema,
        sources: [
          { url: 'https://some-random-blog.example/x', title: null, description: null, content: null },
        ],
      }),
    );
    expect(result.checks.find((c) => c.id === 'schema_validation')?.passed).toBe(false);
    expect(result.checks.find((c) => c.id === 'source_authority')?.passed).toBe(false);
    expect(result.status).toBe(RunStatus.FAILED); // critical failure dominates
  });
});
