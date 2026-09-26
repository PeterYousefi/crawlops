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

    // 6) Schema validation (critical) — only when an expected schema is given.
    if (input.expectedSchema) {
      let validate: ValidateFunction | null = null;
      let compileError: string | null = null;
      try {
        validate = ajv.compile(input.expectedSchema);
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
