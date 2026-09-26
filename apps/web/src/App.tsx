import { NavLink, Route, Routes } from 'react-router-dom';
import { OverviewPage } from './pages/OverviewPage.js';
import { EvaluationsPage } from './pages/EvaluationsPage.js';
import { CreateEvaluationPage } from './pages/CreateEvaluationPage.js';
import { RunDetailsPage } from './pages/RunDetailsPage.js';

/**
 * App shell: sidebar + routed content.
 *
 * This is a functional starter. The final polished UI comes from Lovable and
 * can reuse the same routes, API client, and hooks without backend changes.
 */
export function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">CrawlOps</div>
        <nav>
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/evaluations">Evaluations</NavLink>
          <NavLink to="/evaluations/new">New Evaluation</NavLink>
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/evaluations" element={<EvaluationsPage />} />
          <Route path="/evaluations/new" element={<CreateEvaluationPage />} />
          <Route path="/runs/:id" element={<RunDetailsPage />} />
        </Routes>
      </main>
    </div>
  );
}
