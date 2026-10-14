import { useEffect, useState } from 'react';
import type { Block } from '../../shared/blocks';
import { api } from '../api';

type Content = { subject: string; preheader: string; blocks: Block[] };

export function Preview({ content }: { content: Content }) {
  const [html, setHtml] = useState('');
  const [width, setWidth] = useState<600 | 375>(600);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await api<{ html: string }>('/api/preview', { method: 'POST', json: { content } });
        setHtml(res.html);
      } catch {
        // Keep the last good preview.
      }
    }, 800);
    return () => clearTimeout(t);
  }, [content]);

  // The email's own dark styles sit behind prefers-color-scheme; force them on for the dark preview.
  const shown = dark ? html.replace('@media (prefers-color-scheme: dark)', '@media all') : html;

  return (
    <div className="stack" style={{ position: 'sticky', top: 16 }}>
      <div className="row">
        <div className="tabs" role="group" aria-label="Preview width" style={{ margin: 0 }}>
          <button type="button" className={`button small ${width === 600 ? 'primary' : ''}`} aria-pressed={width === 600} onClick={() => setWidth(600)}>
            Desktop
          </button>
          <button type="button" className={`button small ${width === 375 ? 'primary' : ''}`} aria-pressed={width === 375} onClick={() => setWidth(375)}>
            Mobile
          </button>
        </div>
        <div className="tabs" role="group" aria-label="Preview colours" style={{ margin: 0 }}>
          <button type="button" className={`button small ${!dark ? 'primary' : ''}`} aria-pressed={!dark} onClick={() => setDark(false)}>
            Light
          </button>
          <button type="button" className={`button small ${dark ? 'primary' : ''}`} aria-pressed={dark} onClick={() => setDark(true)}>
            Dark
          </button>
        </div>
      </div>
      <iframe
        title="Email preview"
        srcDoc={shown}
        sandbox=""
        style={{ width: width + 24, maxWidth: '100%', height: '75vh', border: '1px solid var(--tsn-border)', borderRadius: 12, background: '#fff' }}
      />
    </div>
  );
}
