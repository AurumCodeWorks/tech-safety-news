// Renders the test fixture to dist/preview/ for manual checks in browsers and email clients.
// Usage: npx tsx scripts/render-fixture.ts [baseUrl]
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { renderCampaign } from '../src/email/render';
import { base } from '../test/email/fixture';

const baseUrl = process.argv[2] ?? pathToFileURL(`${process.cwd()}/public`).href;
const recipient = { name: 'Margaret', unsubUrl: '#unsubscribe', webUrl: '#web' };
mkdirSync('dist/preview', { recursive: true });
for (const mode of ['email', 'web'] as const) {
  const { html, text } = await renderCampaign({ ...base, baseUrl, mode, recipient: mode === 'email' ? recipient : undefined });
  writeFileSync(`dist/preview/fixture-${mode}.html`, html);
  writeFileSync(`dist/preview/fixture-${mode}.txt`, text);
}
console.log('wrote dist/preview/fixture-{email,web}.{html,txt}');
