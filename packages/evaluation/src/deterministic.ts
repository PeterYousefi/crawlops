/**
 * Deterministic evaluator.
 *
 * WHAT: Rule-based evaluation that needs no LLM and costs nothing.
 * WHY:  This is CrawlOps' baseline quality signal and must always work, even
 *       with zero API credit. It answers concrete, verifiable questions.
 * HOW:  Runs a set of checks, each producing { passed, critical, detail }.
 *       A failing CRITICAL check => FAILED. Any failing non-critical check =>
 *       PARTIAL. All pass => SUCCESS. overallScore is a documented heuristic
 *       (weighted pass ratio) and is explicitly not an objective truth.
 */

import { Ajv, type ValidateFunction } from 'ajv';
import addFormatsImport from 'ajv-formats';
import {
  EvaluationRecommendation,
  RunStatus,
  computeAuthorityMetrics,
  type EvaluationCheck,
} from '@crawlops/shared';
import type { EvaluationInput, EvaluationOutput, EvaluatorProvider } from './types.js';

// Ajv v8 exposes its class as a NAMED export `Ajv`. ajv-formats is CJS whose
// callable lives on `.default` under NodeNext; normalise it to a function.
type AddFormatsFn = (ajv: Ajv) => Ajv;
const addFormats = ((addFormatsImport as unknown as { default?: AddFormatsFn }).default ??
  (addFormatsImport as unknown as AddFormatsFn)) as AddFormatsFn;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/**
 * Does this object look like a real JSON Schema (imposes constraints), rather
 * than an example instance the user pasted?
 */
function looksLikeJsonSchema(obj: Record<string, unknown>): boolean {
  return (
    'type' in obj ||
    'properties' in obj ||
    'required' in obj ||
    'items' in obj ||
    'anyOf' in obj ||
    'oneOf' in obj ||
    'allOf' in obj ||
    '$ref' in obj ||
    'enum' in obj
  );
}

/**
 * Convert a pasted EXAMPLE object into a strict JSON Schema so validation is
 * meaningful. Users frequently paste an example shape like
 *   { "rockets": [ { "name": "string" } ], "comparison": "string" }
 * which is NOT a JSON Schema — Ajv would treat it as unconstrained and pass
 * ANY output. We infer type + required (all keys required) recursively so the
 * output must actually contain those fields.
 *
 * If the input already looks like a real JSON Schema, it is returned unchanged.
 */
export function normalizeToJsonSchema(input: unknown): Record<string, unknown> {
  if (Array.isArray(input)) {
    return input.length > 0
      ? { type: 'array', items: normalizeToJsonSchema(input[0]) }
      : { type: 'array' };
  }
  if (input !== null && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (looksLikeJsonSchema(obj)) return obj; // already a schema — use as-is
    const keys = Object.keys(obj);
    const properties: Record<string, unknown> = {};
    for (const k of keys) properties[k] = normalizeToJsonSchema(obj[k]);
    return {
      type: 'object',
      required: keys,
      properties,
      additionalProperties: true,
    };
  }
  // Primitive example value -> infer its type (best-effort). "boolean"/"number"
  // string hints from example objects are treated as strings unless literal.
  switch (typeof input) {
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    default:
      return { type: 'string' };
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function check(
  id: string,
  label: string,
  passed: boolean,
  critical: boolean,
  detail: string,
): EvaluationCheck {
  return { id, label, passed, critical, detail };
}

export class DeterministicEvaluator implements EvaluatorProvider {
  readonly name = 'deterministic';

  async evaluate(input: EvaluationInput): Promise<EvaluationOutput> {
    const checks: EvaluationCheck[] = [];
    const missingFields: string[] = [];

    // 1) Timeout (critical).
    checks.push(
      check(
        'timeout',
        'Completed within timeout',
        !input.timedOut,
        true,
        input.timedOut ? 'Execution exceeded its configured timeout.' : 'No timeout.',
      ),
    );

    // 2) Source count (critical if below minimum).
    const sourceCount = input.sources.length;
    checks.push(
      check(
        'source_count',
        'Retrieved enough sources',
        sourceCount >= input.minSources,
        true,
        `Retrieved ${sourceCount} source(s); minimum is ${input.minSources}.`,
      ),
    );

    // 3) Non-empty result (critical).
    const hasOutput =
      input.output !== null &&
      input.output !== undefined &&
      !(typeof input.output === 'string' && input.output.trim() === '') &&
      !(Array.isArray(input.output) && input.output.length === 0) &&
      !(
        typeof input.output === 'object' &&
        !Array.isArray(input.output) &&
        Object.keys(input.output as object).length === 0
      );
    checks.push(
      check(
        'non_empty_output',
        'Produced a non-empty result',
        hasOutput,
        true,
        hasOutput ? 'Output is present.' : 'Output is empty or missing.',
      ),
    );

    // 4) URL validity (non-critical) — every source URL is a valid http(s) URL.
    const invalidUrls = input.sources.filter((s) => !isValidHttpUrl(s.url));
    checks.push(
      check(
        'url_validity',
        'All source URLs are valid',
        invalidUrls.length === 0,
        false,
        invalidUrls.length === 0
          ? 'All source URLs are well-formed http(s) URLs.'
          : `${invalidUrls.length} source URL(s) are invalid.`,
      ),
    );

    // 5) Duplicate sources (non-critical).
    const urls = input.sources.map((s) => s.url);
    const uniqueUrls = new Set(urls);
    checks.push(
      check(
        'duplicate_sources',
        'No duplicate sources',
        uniqueUrls.size === urls.length,
        false,
        uniqueUrls.size === urls.length
          ? 'No duplicate source URLs.'
          : `${urls.length - uniqueUrls.size} duplicate source URL(s).`,
      ),
    );

    // 6) Source authority (NON-CRITICAL) — did the research use at least one
    //    authoritative (PRIMARY) source? Computed deterministically from source
    //    URLs only (no LLM, no network). This estimates PROVENANCE, not truth:
    //    a PRIMARY source is not assumed correct, nor a COMMUNITY one incorrect.
    //    Non-critical so a good result with weak sources becomes PARTIAL, never
    //    a hard FAILED. With zero sources it fails non-critically (no PRIMARY);
    //    the critical source_count check separately governs FAILED vs not.
    {
      const authority = computeAuthorityMetrics(input.sources.map((s) => s.url));
      const passed = authority.primarySources >= 1;
      const sharePct = authority.primaryShare != null ? Math.round(authority.primaryShare * 100) : null;
      const detail = passed
        ? `${authority.primarySources}/${authority.totalSources} source(s) are PRIMARY (${sharePct}% primary share). Authority estimates provenance, not truth.`
        : authority.totalSources === 0
          ? 'No sources to assess for authority. Authority estimates provenance, not truth.'
          : `No PRIMARY (first-party/official/gov/academic) source among ${authority.totalSources} source(s). Authority estimates provenance, not truth.`;
      checks.push(check('source_authority', 'Used authoritative sources', passed, false, detail));
    }

    // 7) Schema validation (critical) — only when an expected schema is given.
    if (input.expectedSchema) {
      let validate: ValidateFunction | null = null;
      let compileError: string | null = null;
      try {
        // Normalize a pasted example object into a strict JSON Schema so a
        // schema like { rockets: [...], comparison: "string" } actually REQUIRES
        // those fields instead of validating any output vacuously.
        const strictSchema = normalizeToJsonSchema(input.expectedSchema);
        validate = ajv.compile(strictSchema);
      } catch (e) {
        compileError = e instanceof Error ? e.message : String(e);
      }

      if (!validate) {
        checks.push(
          check(
            'schema_validation',
            'Output matches expected schema',
            false,
            true,
            `Expected schema is not a valid JSON Schema: ${compileError}`,
          ),
        );
      } else {
        const valid = validate(input.output);
        if (!valid && validate.errors) {
          for (const err of validate.errors) {
            if (err.keyword === 'required' && err.params && 'missingProperty' in err.params) {
              missingFields.push(String((err.params as { missingProperty: string }).missingProperty));
            }
          }
        }
        checks.push(
          check(
            'schema_validation',
            'Output matches expected schema',
            Boolean(valid),
            true,
            valid
              ? 'Output validates against the expected schema.'
              : `Schema validation failed${
                  missingFields.length ? ` (missing: ${missingFields.join(', ')})` : ''
                }.`,
          ),
        );
      }
    }

    // --- Decide status from checks ---
    const criticalFailed = checks.some((c) => c.critical && !c.passed);
    const anyFailed = checks.some((c) => !c.passed);

    let status: RunStatus;
    let recommendation: EvaluationRecommendation;
    if (criticalFailed) {
      status = RunStatus.FAILED;
      recommendation = EvaluationRecommendation.FAIL;
    } else if (anyFailed) {
      status = RunStatus.PARTIAL;
      recommendation = EvaluationRecommendation.PARTIAL;
    } else {
      status = RunStatus.SUCCESS;
      recommendation = EvaluationRecommendation.PASS;
    }

    // overallScore: weighted pass ratio (critical checks weigh double). Heuristic.
    const totalWeight = checks.reduce((acc, c) => acc + (c.critical ? 2 : 1), 0);
    const passedWeight = checks.reduce(
      (acc, c) => acc + (c.passed ? (c.critical ? 2 : 1) : 0),
      0,
    );
    const overallScore = totalWeight === 0 ? 0 : passedWeight / totalWeight;

    const passedCount = checks.filter((c) => c.passed).length;
    const reasoningSummary = `${passedCount}/${checks.length} deterministic checks passed. Status: ${status}.`;

    return {
      overallScore,
      status,
      recommendation,
      checks,
      supportedClaims: null,
      unsupportedClaims: null,
      missingFields,
      reasoningSummary,
      evaluatorProvider: this.name,
    };
  }
}
