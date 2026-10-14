import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';

/** Routes are relative to the /admin basename set in main.tsx. */
export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<p className="muted">This section is coming soon.</p>} />
      </Routes>
    </Layout>
  );
}
