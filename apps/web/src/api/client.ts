/**
 * Typed API client.
 *
 * WHAT: Thin fetch wrapper returning typed data using the SHARED contract types.
 * WHY:  This is the integration seam for the frontend. Lovable-generated
 *       components import these functions/types and never need to know the
 *       backend internals. Types come from @crawlops/shared, so client and
 *       server cannot drift.
 */

import type {
  Evaluation,
  CreateEvaluationInput,
  Run,
  RunReport,
  ApiError,
} from '@crawlops/shared';

const BASE = ''; // same origin (Vite proxies /api to the API in dev)

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = (await res.json()) as { data: T } | ApiError;
  if (!res.ok || 'error' in json) {
    const message = 'error' in json ? json.error.message : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return json.data;
}

export interface HealthResponse {
  status: string;
  dependencies: Record<string, { ok: boolean; message: string }>;
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  listEvaluations: () => request<Evaluation[]>('/api/evaluations'),
  getEvaluation: (id: string) => request<Evaluation>(`/api/evaluations/${id}`),
  createEvaluation: (input: CreateEvaluationInput) =>
    request<Evaluation>('/api/evaluations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  runEvaluation: (id: string) =>
    request<Run>(`/api/evaluations/${id}/run`, { method: 'POST' }),

  getRun: (id: string) => request<RunReport>(`/api/runs/${id}`),
};
