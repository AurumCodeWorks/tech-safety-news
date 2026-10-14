import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ListImport } from './pages/ListImport';
import { ListMembers } from './pages/ListMembers';
import { Lists } from './pages/Lists';
import { Settings } from './pages/Settings';
import { Suppressions } from './pages/Suppressions';

/** Routes are relative to the /admin basename set in main.tsx. */
export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/lists" element={<Lists />} />
        <Route path="/lists/import" element={<ListImport />} />
        <Route path="/lists/:id" element={<ListMembers />} />
        <Route path="/lists/:id/import" element={<ListImport />} />
        <Route path="/suppressions" element={<Suppressions />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<p className="muted">This section is coming soon.</p>} />
      </Routes>
    </Layout>
  );
}
