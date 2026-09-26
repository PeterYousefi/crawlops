/**
 * Data hooks.
 *
 * WHAT: Small React hooks that wrap the typed API client with loading/error
 *       state. Deliberately dependency-free (no react-query) for the MVP.
 * WHY:  Provides the loading/error states the frontend needs and a consistent
 *       shape Lovable components can adopt.
 */

import { useCallback, useEffect, useState } from 'react';
import { api, type HealthResponse } from './client.js';
import type { Evaluation, RunReport } from '@crawlops/shared';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });

  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((e: unknown) =>
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);
  return { ...state, reload: run };
}

export function useHealth() {
  return useAsync<HealthResponse>(() => api.health(), []);
}

export function useEvaluations() {
  return useAsync<Evaluation[]>(() => api.listEvaluations(), []);
}

export function useRun(id: string) {
  return useAsync<RunReport>(() => api.getRun(id), [id]);
}
