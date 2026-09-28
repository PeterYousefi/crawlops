import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/crawlops/app-shell';
import { OverviewPage } from './pages/OverviewPage.js';
import { EvaluationsPage } from './pages/EvaluationsPage.js';
import { CreateEvaluationPage } from './pages/CreateEvaluationPage.js';
import { EvaluationDetailsPage } from './pages/EvaluationDetailsPage.js';
import { RunsPage } from './pages/RunsPage.js';
import { RunDetailsPage } from './pages/RunDetailsPage.js';

/**
 * App shell (approved Lovable design) + routed content.
 * Routing stays on react-router-dom; every page uses the real API.
 */
export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/evaluations" element={<EvaluationsPage />} />
        <Route path="/evaluations/new" element={<CreateEvaluationPage />} />
        <Route path="/evaluations/:id" element={<EvaluationDetailsPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/runs/:id" element={<RunDetailsPage />} />
      </Routes>
    </AppShell>
  );
}
