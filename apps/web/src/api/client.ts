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
  RunListItem,
  ApiError,
} from '@crawlops/shared';

// API base URL.
// - Local dev: VITE_API_URL is unset -> BASE is '' -> requests are same-origin
//   and the Vite dev server proxies /api to the local API.
// - Production (Static Web Apps): VITE_API_URL is baked in at build time and
//   points at the Container Apps API URL, e.g. https://crawlops-api....azurecontainerapps.io
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

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

  listRuns: (limit = 20) => request<RunListItem[]>(`/api/runs?limit=${limit}`),
  getRun: (id: string) => request<RunReport>(`/api/runs/${id}`),
};
