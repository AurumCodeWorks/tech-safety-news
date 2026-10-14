import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { CampaignStats } from './pages/CampaignStats';
import { Dashboard } from './pages/Dashboard';
import { Editor } from './pages/Editor';
import { Emails } from './pages/Emails';
import { Library } from './pages/Library';
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
        <Route path="/emails" element={<Emails />} />
        <Route path="/emails/:id" element={<Editor />} />
        <Route path="/emails/:id/stats" element={<CampaignStats />} />
        <Route path="/library" element={<Library />} />
        <Route path="/lists" element={<Lists />} />
        <Route path="/lists/import" element={<ListImport />} />
        <Route path="/lists/:id" element={<ListMembers />} />
        <Route path="/lists/:id/import" element={<ListImport />} />
        <Route path="/suppressions" element={<Suppressions />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<p className="muted">Page not found.</p>} />
      </Routes>
    </Layout>
  );
}
