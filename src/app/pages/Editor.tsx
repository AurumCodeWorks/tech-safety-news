import { IconBooks, IconPlus, IconSend } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { CampaignDto } from '../../shared/api-types';
import type { Block } from '../../shared/blocks';
import { formatLondon } from '../../shared/time';
import { api } from '../api';
import { Banner } from '../components/Banner';
import { ADD_LABELS, newBlock } from '../editor/blocks';
import { BlockList } from '../editor/BlockList';
import { LibraryDialog } from '../editor/LibraryDialog';
import { Preview } from '../editor/Preview';
import { SendDialog } from '../editor/SendDialog';
import { useAutosave } from '../editor/useAutosave';

type Draft = { subject: string; preheader: string; blocks: Block[]; listIds: number[]; hideFromArchive: boolean };

const SAVE_LABEL = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Couldn’t save' } as const;

export function Editor() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<CampaignDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [library, setLibrary] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await api<CampaignDto>(`/api/campaigns/${id}`);
      setCampaign(c);
      setDraft({ subject: c.subject, preheader: c.preheader, blocks: c.blocks, listIds: c.listIds, hideFromArchive: c.hideFromArchive });
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = campaign?.status === 'sending' || campaign?.status === 'sent';

  const save = useCallback(
    async (d: Draft) => {
      if (locked) return;
      setCampaign(await api<CampaignDto>(`/api/campaigns/${id}`, { method: 'PUT', json: d }));
    },
    [id, locked],
  );
  const autosave = useAutosave(draft, save);
  const previewContent = useMemo(() => (draft ? { subject: draft.subject, preheader: draft.preheader, blocks: draft.blocks } : null), [draft]);

  if (loadError) return <Banner tone="danger">{loadError}</Banner>;
  if (!campaign || !draft || !previewContent) return <p className="muted">Loading…</p>;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const retry = async () => {
    const res = await api<{ status: string }>(`/api/campaigns/${id}/retry`, { method: 'POST' });
    setNotice(res.status === 'sent' ? 'Everyone has now been sent the email.' : 'Sending stopped again. Check the error and try later.');
    await load();
  };

  const unschedule = async () => {
    setCampaign(await api<CampaignDto>(`/api/campaigns/${id}/unschedule`, { method: 'POST' }));
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{draft.subject || 'Untitled email'}</h1>
        <div className="row">
          <span className="muted" aria-live="polite">
            {autosave.state === 'error' ? `${SAVE_LABEL.error}: ${autosave.error}` : SAVE_LABEL[autosave.state]}
          </span>
          <Link className="button" to="/emails">
            All emails
          </Link>
          {!locked && (
            <button type="button" className="button primary" onClick={() => setSending(true)}>
              <IconSend size={18} aria-hidden="true" />
              Send or schedule
            </button>
          )}
        </div>
      </div>

      {notice && <Banner>{notice}</Banner>}
      {campaign.status === 'sent' && (
        <Banner action={<Link className="button small" to={`/emails/${id}/stats`}>See results</Link>}>
          This email was sent {campaign.sentAt ? formatLondon(campaign.sentAt) : ''}. Duplicate it from the emails list to send something similar.
        </Banner>
      )}
      {campaign.status === 'sending' && <Banner>This email is sending now.</Banner>}
      {campaign.status === 'scheduled' && campaign.scheduledAt && (
        <Banner action={<button type="button" className="button small" onClick={unschedule}>Unschedule</button>}>
          Scheduled for {formatLondon(campaign.scheduledAt)}. Any change turns it back into a draft that needs a new test.
        </Banner>
      )}
      {campaign.status === 'failed' && (
        <Banner tone="danger" action={<button type="button" className="button small" onClick={retry}>Retry unsent</button>}>
          Sending stopped: {campaign.lastError}
        </Banner>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <div className="stack">
          <fieldset className="card stack" disabled={locked} style={{ margin: 0 }}>
            <div className="field">
              <label htmlFor="subject">Subject</label>
              <input id="subject" type="text" maxLength={90} value={draft.subject} onChange={(e) => set({ subject: e.target.value })} />
              <span className="hint">{`${draft.subject.length} / 90`}</span>
            </div>
            <div className="field">
              <label htmlFor="preheader">Preview text</label>
              <input id="preheader" type="text" maxLength={140} value={draft.preheader} onChange={(e) => set({ preheader: e.target.value })} />
              <span className="hint">{`${draft.preheader.length} / 140 · the grey line many inboxes show after the subject`}</span>
            </div>
            <label className="row">
              <input type="checkbox" checked={draft.hideFromArchive} onChange={(e) => set({ hideFromArchive: e.target.checked })} />
              Hide from the public archive
            </label>
          </fieldset>

          <BlockList blocks={draft.blocks} onChange={(blocks) => set({ blocks })} readOnly={locked} />

          {!locked && (
            <div className="card stack">
              <strong>Add a block</strong>
              <div className="row">
                {ADD_LABELS.map(([type, label]) => (
                  <button key={type} type="button" className="button small" aria-label={`Add ${label}`} onClick={() => set({ blocks: [...draft.blocks, newBlock(type)] })}>
                    <IconPlus size={16} aria-hidden="true" />
                    {label}
                  </button>
                ))}
                <button type="button" className="button small" onClick={() => setLibrary(true)}>
                  <IconBooks size={16} aria-hidden="true" />
                  Insert from library
                </button>
              </div>
            </div>
          )}
        </div>
        <Preview content={previewContent} />
      </div>

      {library && <LibraryDialog onInsert={(b) => set({ blocks: [...draft.blocks, b] })} onClose={() => setLibrary(false)} />}
      {sending && (
        <SendDialog
          campaign={campaign}
          onListsChange={(listIds) => set({ listIds })}
          flush={autosave.flush}
          onClose={() => setSending(false)}
          onDone={(kind) => {
            setSending(false);
            if (kind === 'sent') navigate(`/emails/${id}/stats`);
            else void load();
          }}
        />
      )}
    </div>
  );
}
