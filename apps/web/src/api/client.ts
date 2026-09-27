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

/** Error thrown by the API client, carrying the server's structured code. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    // Network-level failure (server unreachable / CORS / offline).
    throw new ApiRequestError('Network error — could not reach the API.', 'NETWORK_ERROR', 0);
  }
  let json: { data: T } | ApiError;
  try {
    json = (await res.json()) as { data: T } | ApiError;
  } catch {
    throw new ApiRequestError(`Unexpected response (${res.status}).`, 'BAD_RESPONSE', res.status);
  }
  if (!res.ok || 'error' in json) {
    const err = 'error' in json ? json.error : { code: 'UNKNOWN', message: `Request failed (${res.status})` };
    throw new ApiRequestError(err.message, err.code, res.status);
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
