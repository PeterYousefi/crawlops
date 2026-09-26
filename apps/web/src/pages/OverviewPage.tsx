import { useHealth } from '../api/hooks.js';

/**
 * Overview: shows API/dependency health so it's obvious what's configured.
 * Reliability stat cards will be wired to /api/metrics in Phase 2 (they are not
 * shown here to avoid displaying fabricated numbers before metrics exist).
 */
export function OverviewPage() {
  const { data, loading, error } = useHealth();

  return (
    <>
      <h1>Overview</h1>
      <p className="subtitle">Agent reliability at a glance.</p>

      {loading && <p className="muted">Checking system status…</p>}
      {error && <p className="error">Cannot reach the API: {error}</p>}

      {data && (
        <>
          {data.dependencies.firecrawl && !data.dependencies.firecrawl.ok && (
            <div className="banner">
              Firecrawl is not configured ({data.dependencies.firecrawl.message}). Runs will be
              unavailable until <code>FIRECRAWL_API_KEY</code> is set.
            </div>
          )}
          {data.dependencies.database && !data.dependencies.database.ok && (
            <div className="banner">
              Database is not reachable ({data.dependencies.database.message}).
            </div>
          )}
          <div className="cards">
            {Object.entries(data.dependencies).map(([name, dep]) => (
              <div className="card stat" key={name}>
                <div className="label">{name}</div>
                <div className="value" style={{ fontSize: 18 }}>
                  <span className={`badge ${dep.ok ? 'SUCCESS' : 'FAILED'}`}>
                    {dep.ok ? 'OK' : 'DOWN'}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {dep.message}
                </div>
              </div>
            ))}
          </div>
          <p className="muted">
            Reliability metrics (success rate, latency, failure breakdown) appear here once runs
            exist and the metrics endpoint lands in Phase 2.
          </p>
        </>
      )}
    </>
  );
}
