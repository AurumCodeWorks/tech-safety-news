import { IconArrowDown, IconArrowUp, IconBookmark, IconCopy, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { CARD_TYPES, type Block } from '../../shared/blocks';
import { api } from '../api';
import { BLOCK_LABELS, blockErrors, cloneBlock } from './blocks';
import { BlockForm } from './BlockForm';

const PILL: Partial<Record<Block['type'], string>> = { scam_alert: 'scam', tip: 'tip', warning: 'warning' };

export function BlockList({ blocks, onChange, readOnly }: { blocks: Block[]; onChange: (b: Block[]) => void; readOnly?: boolean }) {
  const [savedId, setSavedId] = useState<string | null>(null);

  const update = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  const saveToLibrary = async (b: Block) => {
    if (!('title' in b)) return;
    await api('/api/cards', { method: 'POST', json: { type: b.type, title: b.title, data: b } });
    setSavedId(b.id);
  };

  if (blocks.length === 0) return <p className="muted">Add a block to start your email.</p>;

  return (
    <div className="stack">
      {blocks.map((b, i) => {
        const errors = blockErrors(b);
        const invalid = Object.keys(errors).length > 0;
        return (
          <section key={b.id} className="card stack" data-testid="block" style={invalid ? { borderColor: 'var(--tsn-danger)' } : undefined}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className={`badge ${PILL[b.type] ?? ''}`} data-testid="block-type">
                {BLOCK_LABELS[b.type]}
              </span>
              {!readOnly && (
                <div className="row">
                  <button type="button" className="button small" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <IconArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="button small" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>
                    <IconArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button type="button" className="button small" aria-label="Duplicate" onClick={() => onChange([...blocks.slice(0, i + 1), cloneBlock(b), ...blocks.slice(i + 1)])}>
                    <IconCopy size={16} aria-hidden="true" />
                  </button>
                  {(CARD_TYPES as readonly string[]).includes(b.type) && (
                    <button type="button" className="button small" disabled={invalid} onClick={() => saveToLibrary(b)}>
                      <IconBookmark size={16} aria-hidden="true" />
                      {savedId === b.id ? 'Saved to library' : 'Save to library'}
                    </button>
                  )}
                  <button type="button" className="button small danger" aria-label="Delete block" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>
                    <IconTrash size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
            <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
              <BlockForm block={b} onChange={(nb) => update(i, nb)} errors={errors} />
            </fieldset>
          </section>
        );
      })}
    </div>
  );
}
