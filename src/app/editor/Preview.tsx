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
  // …and off for the light preview, even when this computer is in dark mode.
  const shown = html.replace('@media (prefers-color-scheme: dark)', dark ? '@media all' : '@media not all');

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="segmented" role="group" aria-label="Preview width">
          <button type="button" aria-pressed={width === 600} onClick={() => setWidth(600)}>
            Desktop
          </button>
          <button type="button" aria-pressed={width === 375} onClick={() => setWidth(375)}>
            Mobile
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Preview colours">
          <button type="button" aria-pressed={!dark} onClick={() => setDark(false)}>
            Light
          </button>
          <button type="button" aria-pressed={dark} onClick={() => setDark(true)}>
            Dark
          </button>
        </div>
      </div>
      <iframe
        title="Email preview"
        srcDoc={shown}
        // Same origin so images load (an opaque origin can't fetch from localhost); scripts stay blocked.
        sandbox="allow-same-origin"
        className={'preview-frame' + (width === 375 ? ' mobile' : '')}
      />
    </div>
  );
}
