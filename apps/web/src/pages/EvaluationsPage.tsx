import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEvaluations } from '../api/hooks.js';
import { api } from '../api/client.js';

/** Lists evaluations with a Run action that navigates to the run report. */
export function EvaluationsPage() {
  const { data, loading, error, reload } = useEvaluations();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleRun(id: string) {
    setRunningId(id);
    setRunError(null);
    try {
      const run = await api.runEvaluation(id);
      navigate(`/runs/${run.id}`);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningId(null);
    }
  }

  return (
    <>
      <h1>Evaluations</h1>
      <p className="subtitle">Reusable research task definitions.</p>

      <Link to="/evaluations/new">
        <button>New Evaluation</button>
      </Link>

      {runError && <p className="error" style={{ marginTop: 16 }}>{runError}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

      {data && data.length === 0 && (
        <p className="muted" style={{ marginTop: 20 }}>
          No evaluations yet. Create one to get started.
        </p>
      )}

      {data && data.length > 0 && (
        <table style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Strategy</th>
              <th>Task</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>
                  <span className="badge PENDING">{e.strategy}</span>
                </td>
                <td className="muted" style={{ maxWidth: 380 }}>
                  {e.taskPrompt.slice(0, 90)}
                  {e.taskPrompt.length > 90 ? '…' : ''}
                </td>
                <td>
                  <button
                    style={{ marginTop: 0, padding: '6px 14px' }}
                    disabled={runningId === e.id}
                    onClick={() => handleRun(e.id)}
                  >
                    {runningId === e.id ? 'Running…' : 'Run'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button style={{ background: 'transparent', color: 'var(--accent)', paddingLeft: 0 }} onClick={reload}>
        Refresh
      </button>
    </>
  );
}
