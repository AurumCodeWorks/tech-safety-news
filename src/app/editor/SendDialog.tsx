import { IconCheck, IconSend } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { CampaignDto, PreflightResult, RecipientCount } from '../../shared/api-types';
import { api, ApiError } from '../api';
import { Banner } from '../components/Banner';
import { Dialog } from '../components/Dialog';
import type { ListSummary } from '../pages/Lists';

type Props = {
  campaign: CampaignDto;
  onListsChange: (ids: number[]) => void;
  /** Saves pending editor changes before the server checks the email. */
  flush: () => Promise<void>;
  onClose: () => void;
  onDone: (kind: 'sent' | 'scheduled') => void;
};

export function SendDialog({ campaign, onListsChange, flush, onClose, onDone }: Props) {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [listIds, setListIds] = useState<number[]>(campaign.listIds);
  const [count, setCount] = useState<RecipientCount | null>(null);
  const [check, setCheck] = useState<PreflightResult | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');

  const recheck = useCallback(async () => {
    // Child effects run before the editor's autosave effect queues the new list choice,
    // so wait a tick before flushing — otherwise the server checks the old lists.
    await new Promise((r) => setTimeout(r, 0));
    await flush();
    setCheck(await api<PreflightResult>(`/api/campaigns/${campaign.id}/preflight`));
  }, [campaign.id, flush]);

  useEffect(() => {
    void api<{ lists: ListSummary[] }>('/api/lists').then((r) => setLists(r.lists));
  }, []);

  useEffect(() => {
    void api<RecipientCount>('/api/recipients/count', { method: 'POST', json: { listIds } }).then(setCount);
    void recheck();
  }, [listIds, recheck]);

  const toggleList = (id: number) => {
    const next = listIds.includes(id) ? listIds.filter((x) => x !== id) : [...listIds, id];
    setListIds(next);
    onListsChange(next);
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      await flush();
      await api(`/api/campaigns/${campaign.id}/test`, { method: 'POST', json: {} });
      setNotice({ tone: 'info', text: 'Test sent — check your inbox' });
      await recheck();
    } catch (e) {
      setNotice({ tone: 'danger', text: e instanceof ApiError && e.reasons.length ? e.reasons.join('. ') : (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    setBusy(true);
    try {
      const res = await api<{ status: string; pending: number }>(`/api/campaigns/${campaign.id}/send`, { method: 'POST' });
      if (res.status === 'failed') setNotice({ tone: 'danger', text: `Sending stopped with ${res.pending} people still to send. Open the email to retry.` });
      onDone('sent');
    } catch (e) {
      setNotice({ tone: 'danger', text: (e as Error).message });
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const schedule = async () => {
    if (!date) {
      setNotice({ tone: 'danger', text: 'Pick a date to send on' });
      return;
    }
    setBusy(true);
    try {
      await api(`/api/campaigns/${campaign.id}/schedule`, { method: 'POST', json: { local: `${date}T${time}` } });
      onDone('scheduled');
    } catch (e) {
      setNotice({ tone: 'danger', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const ready = check?.ok === true;
  const people = count?.count ?? 0;

  return (
    <Dialog title="Send this email" onClose={onClose}>
      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 6 }}>Who gets it</legend>
        {lists.map((l) => (
          <label key={l.id} className="row">
            <input type="checkbox" checked={listIds.includes(l.id)} onChange={() => toggleList(l.id)} />
            {l.name} <span className="muted">({l.memberCount})</span>
          </label>
        ))}
        {count && <p className="muted">{`${count.count} people · ${count.duplicatesRemoved} duplicates removed · ${count.suppressed} suppressed`}</p>}
      </fieldset>

      <div className="stack">
        <strong>Before sending</strong>
        {check && !check.ok && (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {check.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {ready && (
          <p className="row" style={{ color: 'var(--tsn-success)', margin: 0 }}>
            <IconCheck size={18} aria-hidden="true" /> Ready to send
          </p>
        )}
        <div className="row">
          <button type="button" className="button" onClick={sendTest} disabled={busy}>
            Send test to me
          </button>
        </div>
      </div>

      {!confirming ? (
        <div className="stack">
          <div className="row">
            <button type="button" className="button primary" disabled={!ready || busy} onClick={() => setConfirming(true)}>
              <IconSend size={18} aria-hidden="true" />
              Send now
            </button>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field">
              <label htmlFor="send-date">Date</label>
              <input id="send-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="send-time">Time (UK)</label>
              <input id="send-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <button type="button" className="button" disabled={!ready || busy} onClick={schedule}>
              Schedule
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p>
            <strong>{`Send to ${people} people?`}</strong>
          </p>
          <div className="row">
            <button type="button" className="button primary" onClick={sendNow} disabled={busy}>
              {busy ? 'Sending…' : 'Yes, send it'}
            </button>
            <button type="button" className="button" onClick={() => setConfirming(false)} disabled={busy}>
              Not yet
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
