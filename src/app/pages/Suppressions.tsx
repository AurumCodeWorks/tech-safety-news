import { useState, type FormEvent } from 'react';
import { formatLondonDate } from '../../shared/time';
import { api } from '../api';
import { Banner } from '../components/Banner';
import { Dialog } from '../components/Dialog';
import { useApi } from '../useApi';

type Row = { email: string; reason: 'unsubscribed' | 'bounced' | 'complained' | 'manual'; createdAt: string; campaignId: number | null };

const LABELS: Record<Row['reason'], string> = {
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  complained: 'Marked as spam',
  manual: 'Added by you',
};

export function Suppressions() {
  const { data, error, reload } = useApi<{ suppressions: Row[] }>('/api/suppressions');
  const [removing, setRemoving] = useState<Row | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [add, setAdd] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const confirmRemove = async () => {
    if (!removing) return;
    if (!note.trim()) {
      setNoteError('Add a note saying why this address can be emailed again');
      return;
    }
    try {
      await api(`/api/suppressions/${encodeURIComponent(removing.email)}`, { method: 'DELETE', json: { note: note.trim() } });
      setRemoving(null);
      setNote('');
      await reload();
    } catch (e) {
      setNoteError((e as Error).message);
    }
  };

  const addManual = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/suppressions', { method: 'POST', json: { email: add.trim() } });
      setAdd('');
      setMessage(null);
      await reload();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Suppressions</h1>
      </div>
      <p className="muted">People here are never emailed, even if they appear in a list. Unsubscribes and spam complaints can’t be undone.</p>
      {error && <Banner tone="danger">{error}</Banner>}
      {message && <Banner tone="danger">{message}</Banner>}
      <form className="row" onSubmit={addManual}>
        <div className="field" style={{ minWidth: 280 }}>
          <label htmlFor="supp-add">Stop emailing an address</label>
          <input id="supp-add" type="email" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="name@example.com" required />
        </div>
        <button type="submit" className="button" style={{ alignSelf: 'flex-end' }}>
          Add
        </button>
      </form>
      {data && (
        <table className="list">
          <thead>
            <tr>
              <th>Email</th>
              <th>Reason</th>
              <th>Date</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data.suppressions.map((s) => (
              <tr key={s.email}>
                <td>{s.email}</td>
                <td>
                  <span className={`badge ${s.reason === 'complained' || s.reason === 'unsubscribed' ? 'scam' : ''}`}>{LABELS[s.reason]}</span>
                </td>
                <td className="muted">{formatLondonDate(s.createdAt)}</td>
                <td style={{ textAlign: 'right' }}>
                  {(s.reason === 'bounced' || s.reason === 'manual') && (
                    <button type="button" className="button small" onClick={() => (setRemoving(s), setNote(''), setNoteError(null))}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {removing && (
        <Dialog title={`Email ${removing.email} again?`} onClose={() => setRemoving(null)}>
          <div className="field">
            <label htmlFor="supp-note">Note</label>
            <textarea id="supp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it’s now OK to email this address" />
            {noteError && <span className="error">{noteError}</span>}
          </div>
          <div className="row">
            <button type="button" className="button primary" onClick={confirmRemove}>
              Remove from list
            </button>
            <button type="button" className="button" onClick={() => setRemoving(null)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
