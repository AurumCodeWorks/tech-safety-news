import { useState } from 'react';
import type { CardDto } from '../../shared/api-types';
import type { Block } from '../../shared/blocks';
import { api } from '../api';
import { Dialog } from '../components/Dialog';
import { useApi } from '../useApi';
import { BLOCK_LABELS, cloneBlock } from './blocks';

const PILL = { scam_alert: 'scam', tip: 'tip', warning: 'warning' } as const;

export function LibraryDialog({ onInsert, onClose }: { onInsert: (b: Block) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const { data } = useApi<{ cards: CardDto[] }>(`/api/cards?q=${encodeURIComponent(q)}`);

  const insert = async (card: CardDto) => {
    onInsert(cloneBlock(card.data));
    void api(`/api/cards/${card.id}/used`, { method: 'POST' });
    onClose();
  };

  return (
    <Dialog title="Insert from library" onClose={onClose}>
      <div className="field">
        <label htmlFor="lib-search">Search</label>
        <input id="lib-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fake parcel texts" />
      </div>
      {data?.cards.length === 0 && <p className="muted">No saved cards yet. Use “Save to library” on a scam alert, tip or warning.</p>}
      <div className="stack">
        {data?.cards.map((c) => (
          <button type="button" key={c.id} className="button" style={{ justifyContent: 'space-between' }} onClick={() => insert(c)}>
            <span>{c.title}</span>
            <span className={`badge ${PILL[c.type]}`}>{BLOCK_LABELS[c.type]}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
