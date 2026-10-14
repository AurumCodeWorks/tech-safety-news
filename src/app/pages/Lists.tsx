import { IconDownload, IconTrash, IconUpload } from '@tabler/icons-react';
import { Link } from 'react-router';
import { formatLondonDate } from '../../shared/time';
import { api } from '../api';
import { Banner } from '../components/Banner';
import { useApi } from '../useApi';

export type ListSummary = { id: number; name: string; description: string; memberCount: number; updatedAt: string };

export function Lists() {
  const { data, error, reload } = useApi<{ lists: ListSummary[] }>('/api/lists');

  const remove = async (l: ListSummary) => {
    if (!window.confirm(`Delete the list “${l.name}”? The people stay in other lists.`)) return;
    await api(`/api/lists/${l.id}`, { method: 'DELETE' });
    await reload();
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Lists</h1>
        <Link className="button primary" to="/lists/import">
          <IconUpload size={18} aria-hidden="true" />
          Import a new list
        </Link>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {data && data.lists.length === 0 && (
        <div className="card">
          <h2>Import your first list</h2>
          <p>Export a distribution list from Office 365 as a CSV file, then upload it here.</p>
        </div>
      )}
      {data && data.lists.length > 0 && (
        <table className="list">
          <thead>
            <tr>
              <th>Name</th>
              <th>People</th>
              <th>Updated</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data.lists.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link to={`/lists/${l.id}`}>{l.name}</Link>
                </td>
                <td>{l.memberCount}</td>
                <td className="muted">{formatLondonDate(l.updatedAt)}</td>
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <Link className="button small" to={`/lists/${l.id}/import`}>
                      <IconUpload size={16} aria-hidden="true" />
                      Update from CSV
                    </Link>
                    <a className="button small" href={`/api/lists/${l.id}/export`}>
                      <IconDownload size={16} aria-hidden="true" />
                      Export
                    </a>
                    <button type="button" className="button small danger" onClick={() => remove(l)} aria-label={`Delete ${l.name}`}>
                      <IconTrash size={16} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
