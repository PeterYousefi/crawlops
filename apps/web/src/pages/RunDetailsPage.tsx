import { useParams } from 'react-router-dom';
import { useRun } from '../api/hooks.js';

/**
 * Run details — the core observability screen. Shows status, timeline, final
 * output, sources, evaluation checks/scores, and full attempt history so an
 * engineer can understand exactly what the agent did and why.
 */
export function RunDetailsPage() {
  const { id = '' } = useParams();
  const { data: run, loading, error } = useRun(id);

  if (loading) return <p className="muted">Loading run…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!run) return <p className="muted">Run not found.</p>;

  return (
    <>
      <h1>{run.evaluation.name}</h1>
      <p className="subtitle">{run.evaluation.taskPrompt}</p>

      <div className="cards">
        <div className="card stat">
          <div className="label">Status</div>
          <div className="value" style={{ fontSize: 20 }}>
            <span className={`badge ${run.status}`}>{run.status}</span>
          </div>
        </div>
        <div className="card stat">
          <div className="label">Duration</div>
          <div className="value">{run.durationMs != null ? `${run.durationMs} ms` : '—'}</div>
        </div>
        <div className="card stat">
          <div className="label">Strategy</div>
          <div className="value" style={{ fontSize: 20 }}>
            {run.strategy}
          </div>
        </div>
        <div className="card stat">
          <div className="label">Attempts</div>
          <div className="value">{run.attemptCount}</div>
        </div>
      </div>

      {run.errorCategory && (
        <div className="banner">
          Failure category: <strong>{run.errorCategory}</strong>
        </div>
      )}

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>Timeline</h3>
        <ul className="timeline">
          <li>Task started {run.startedAt ? `at ${new Date(run.startedAt).toLocaleTimeString()}` : ''}</li>
          <li>Retrieval ({run.strategy})</li>
          <li>{run.sources.length} source(s) retrieved</li>
          <li>Evaluation {run.evaluationResult ? 'completed' : 'not run'}</li>
          <li>Final result: {run.status}</li>
        </ul>
      </section>

      {run.evaluationResult && (
        <section className="card" style={{ marginBottom: 20 }}>
          <h3>Evaluation</h3>
          <p className="muted">
            Score {(run.evaluationResult.overallScore * 100).toFixed(0)}% (heuristic) ·{' '}
            {run.evaluationResult.recommendation} · via {run.evaluationResult.evaluatorProvider}
          </p>
          <p>{run.evaluationResult.reasoningSummary}</p>
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Check</th>
                <th>Result</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {run.evaluationResult.checks.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.label}
                    {c.critical && <span className="muted"> (critical)</span>}
                  </td>
                  <td>
                    <span className={`badge ${c.passed ? 'SUCCESS' : 'FAILED'}`}>
                      {c.passed ? 'pass' : 'fail'}
                    </span>
                  </td>
                  <td className="muted">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>Sources ({run.sources.length})</h3>
        {run.sources.length === 0 ? (
          <p className="muted">No sources retrieved.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {run.sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.rank ?? '—'}</td>
                  <td>{s.title ?? '—'}</td>
                  <td>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.url}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ marginBottom: 20 }}>
        <h3>Attempt history</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Strategy</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Failure</th>
            </tr>
          </thead>
          <tbody>
            {run.attempts.map((a) => (
              <tr key={a.id}>
                <td>{a.attemptNumber}</td>
                <td>{a.strategy}</td>
                <td>
                  <span className={`badge ${a.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED'}`}>
                    {a.status}
                  </span>
                </td>
                <td>{a.durationMs != null ? `${a.durationMs} ms` : '—'}</td>
                <td className="muted">
                  {a.errorCategory ? `${a.errorCategory}: ${a.errorMessage ?? ''}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {run.finalOutput != null && (
        <section className="card">
          <h3>Final output</h3>
          <pre
            style={{
              background: '#fafbfc',
              padding: 16,
              borderRadius: 8,
              overflow: 'auto',
              fontSize: 13,
            }}
          >
            {JSON.stringify(run.finalOutput, null, 2)}
          </pre>
        </section>
      )}
    </>
  );
}
