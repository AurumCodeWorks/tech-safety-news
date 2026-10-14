import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { CardDto } from '../../shared/api-types';
import { formatLondonDate } from '../../shared/time';
import { api } from '../api';
import { Banner } from '../components/Banner';
import { BLOCK_LABELS } from '../editor/blocks';
import { useApi } from '../useApi';

const PILL = { scam_alert: 'scam', tip: 'tip', warning: 'warning' } as const;

export function Library() {
  const [q, setQ] = useState('');
  const { data, error, reload } = useApi<{ cards: CardDto[] }>(`/api/cards?q=${encodeURIComponent(q)}`);

  const remove = async (c: CardDto) => {
    if (!window.confirm(`Delete “${c.title}” from the library? Emails that already use it aren’t changed.`)) return;
    await api(`/api/cards/${c.id}`, { method: 'DELETE' });
    await reload();
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Card library</h1>
      </div>
      <p className="muted">Saved scam alerts, tips and warnings. Save a card from the editor, then insert it into any new email.</p>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="card-search">Search</label>
        <input id="card-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fake parcel texts" />
      </div>
      {data && data.cards.length === 0 && <p className="muted">No saved cards yet.</p>}
      {data && data.cards.length > 0 && (
        <table className="list">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Last used</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data.cards.map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td>
                  <span className={`badge ${PILL[c.type]}`}>{BLOCK_LABELS[c.type]}</span>
                </td>
                <td className="muted">{c.lastUsedAt ? formatLondonDate(c.lastUsedAt) : 'Never'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="button small danger" aria-label={`Delete ${c.title}`} onClick={() => remove(c)}>
                    <IconTrash size={16} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
