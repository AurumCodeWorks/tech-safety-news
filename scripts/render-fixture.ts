// Renders the test fixture to dist/preview/ for manual checks in browsers and email clients.
// Usage: npx tsx scripts/render-fixture.ts [baseUrl]
//   With no baseUrl, every image is embedded as a data URI and a forced-dark copy is also written,
//   so the files can be opened straight from disk or a preview pane that blocks remote images.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderCampaign } from '../src/email/render';
import { base as fixtureBase } from '../test/email/fixture';

const PLACEHOLDER = 'https://preview.invalid';
const baseUrl = process.argv[2] ?? PLACEHOLDER;
const recipient = { name: 'Margaret', unsubUrl: '#unsubscribe', webUrl: '#web' };

// The fixture's photo has no real upload behind it; preview it with the social image instead.
const base = {
  ...fixtureBase,
  content: {
    ...fixtureBase.content,
    blocks: fixtureBase.content.blocks.map((b) => (b.type === 'image' ? { ...b, r2Key: 'demo', width: 1200, height: 630 } : b)),
  },
};

function inlineLocal(html: string): string {
  return html.replace(/https:\/\/preview\.invalid\/([^"?]+)/g, (match, path: string) => {
    const file = path === 'media/demo' ? 'public/og-image.png' : `public/${path}`;
    return existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : match;
  });
}

async function inlineRemote(html: string): Promise<string> {
  const urls = new Set(html.match(/https:\/\/registry\.blockmarktech\.com[^"]*email-image[^"]*/g) ?? []);
  for (const url of urls) {
    try {
      const res = await fetch(url.replace(/&amp;/g, '&'));
      const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
      html = html.split(url).join(`data:image/png;base64,${b64}`);
    } catch {
      // Offline: keep the live URL.
    }
  }
  return html;
}

mkdirSync('dist/preview', { recursive: true });
for (const mode of ['email', 'web'] as const) {
  let { html, text } = await renderCampaign({ ...base, baseUrl, mode, recipient: mode === 'email' ? recipient : undefined });
  if (baseUrl === PLACEHOLDER) html = await inlineRemote(inlineLocal(html));
  writeFileSync(`dist/preview/fixture-${mode}.html`, html);
  writeFileSync(`dist/preview/fixture-${mode}.txt`, text);
  if (mode === 'email' && baseUrl === PLACEHOLDER) {
    writeFileSync('dist/preview/fixture-email-dark.html', html.replace('@media (prefers-color-scheme: dark)', '@media all'));
  }
}
console.log('wrote dist/preview/');
