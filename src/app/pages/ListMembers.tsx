import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Banner } from '../components/Banner';
import { useApi } from '../useApi';
import type { ListSummary } from './Lists';

type Member = { email: string; name: string; suppressed: boolean };

export function ListMembers() {
  const id = Number(useParams().id);
  const [q, setQ] = useState('');
  const { data: lists } = useApi<{ lists: ListSummary[] }>('/api/lists');
  const { data, error } = useApi<{ members: Member[] }>(`/api/lists/${id}/members?q=${encodeURIComponent(q)}`);
  const list = lists?.lists.find((l) => l.id === id);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{list?.name ?? 'List'}</h1>
        <div className="row">
          <Link className="button" to={`/lists/${id}/import`}>
            Update from CSV
          </Link>
          <Link className="button" to="/lists">
            Back to lists
          </Link>
        </div>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="member-search">Search</label>
        <input id="member-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" />
      </div>
      {data && (
        <table className="list">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.email}>
                <td>{m.name || <span className="muted">—</span>}</td>
                <td>{m.email}</td>
                <td>{m.suppressed ? <span className="badge scam">Won’t be emailed</span> : <span className="badge">Subscribed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
