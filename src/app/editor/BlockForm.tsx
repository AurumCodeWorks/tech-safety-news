import { IconPlus, IconX } from '@tabler/icons-react';
import { useId, useState, type ReactNode } from 'react';
import type { Block } from '../../shared/blocks';
import { api } from '../api';
import { prepareImage } from './image';

const RICH_HINT = 'Use **bold** for emphasis and [link text](https://…) for links.';

function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

function Text({ label, value, onChange, error, rich, multiline }: { label: string; value: string; onChange: (v: string) => void; error?: string; rich?: boolean; multiline?: boolean }) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={rich ? RICH_HINT : undefined}>
      {multiline ? (
        <textarea id={id} className={error ? 'invalid' : ''} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" className={error ? 'invalid' : ''} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

function ImageFields({ block, onChange, errors }: { block: Extract<Block, { type: 'image' }>; onChange: (b: Block) => void; errors: Record<string, string> }) {
  const id = useId();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const img = await prepareImage(file);
      const res = await api<{ key: string }>('/api/media', { method: 'POST', body: img.blob, headers: { 'Content-Type': img.type } });
      onChange({ ...block, r2Key: res.key, width: img.width, height: img.height });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Field id={id} label="Image file" error={uploadError ?? errors.r2Key}>
        <input id={id} type="file" accept="image/png,image/jpeg" onChange={(e) => upload(e.target.files?.[0])} />
      </Field>
      {uploading && <p className="muted">Uploading…</p>}
      {block.r2Key && <img src={`/media/${block.r2Key}`} alt="" style={{ maxWidth: '100%', borderRadius: 5 }} />}
      <Text label="Description for people who can’t see the image" value={block.alt} onChange={(alt) => onChange({ ...block, alt })} error={errors.alt} />
      <Text label="Caption (optional)" value={block.caption ?? ''} onChange={(caption) => onChange({ ...block, caption: caption || undefined })} />
    </>
  );
}

export function BlockForm({ block, onChange, errors }: { block: Block; onChange: (b: Block) => void; errors: Record<string, string> }) {
  switch (block.type) {
    case 'scam_alert':
      return (
        <div className="stack">
          <Text label="Title" value={block.title} onChange={(title) => onChange({ ...block, title })} error={errors.title} />
          <Text label="What it looks like" value={block.looksLike} onChange={(looksLike) => onChange({ ...block, looksLike })} error={errors.looksLike} rich multiline />
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 6 }}>Warning signs</legend>
            {block.warningSigns.map((s, i) => (
              <div className="row" key={i}>
                <input
                  type="text"
                  aria-label={`Warning sign ${i + 1}`}
                  className={errors[`warningSigns.${i}`] ? 'invalid' : ''}
                  value={s}
                  style={{ flex: 1 }}
                  onChange={(e) => onChange({ ...block, warningSigns: block.warningSigns.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                {block.warningSigns.length > 1 && (
                  <button type="button" className="button small" aria-label={`Remove warning sign ${i + 1}`} onClick={() => onChange({ ...block, warningSigns: block.warningSigns.filter((_, j) => j !== i) })}>
                    <IconX size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {Object.entries(errors)
              .filter(([k]) => k.startsWith('warningSigns'))
              .slice(0, 1)
              .map(([k, msg]) => (
                <span className="error" key={k}>
                  {msg}
                </span>
              ))}
            {block.warningSigns.length < 6 && (
              <button type="button" className="button small" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ ...block, warningSigns: [...block.warningSigns, ''] })}>
                <IconPlus size={16} aria-hidden="true" />
                Add a warning sign
              </button>
            )}
          </fieldset>
          <Text label="What to do" value={block.whatToDo} onChange={(whatToDo) => onChange({ ...block, whatToDo })} error={errors.whatToDo} rich multiline />
        </div>
      );
    case 'tip':
    case 'warning':
      return (
        <div className="stack">
          <Text label="Title" value={block.title} onChange={(title) => onChange({ ...block, title })} error={errors.title} />
          <Text label={block.type === 'tip' ? 'The tip' : 'The warning'} value={block.body} onChange={(body) => onChange({ ...block, body })} error={errors.body} rich multiline />
        </div>
      );
    case 'text':
      return <Text label="Text" value={block.body} onChange={(body) => onChange({ ...block, body })} error={errors.body} rich multiline />;
    case 'image':
      return (
        <div className="stack">
          <ImageFields block={block} onChange={onChange} errors={errors} />
        </div>
      );
    case 'call_us':
      return (
        <Text
          label="Bar text"
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
          error={errors.text}
        />
      );
    case 'divider':
      return <p className="muted">A thin line to separate sections.</p>;
  }
}
