import type { Block, CampaignContent } from '../shared/blocks';
import { richToText } from '../shared/richtext';
import type { Settings } from '../shared/settings';
import { footerLines } from './copy';

function heading(label: string, title: string): string {
  const line = `${label}: ${richToText(title)}`.toUpperCase();
  return `${line}\n${'='.repeat(Math.min(line.length, 60))}`;
}

function blockText(block: Block, settings: Settings): string {
  switch (block.type) {
    case 'scam_alert':
      return [
        heading('Scam alert', block.title),
        richToText(block.looksLike),
        `Warning signs:\n${block.warningSigns.map((s) => `- ${richToText(s)}`).join('\n')}`,
        `What to do:\n${richToText(block.whatToDo)}`,
      ].join('\n\n');
    case 'tip':
      return [heading('Tip of the month', block.title), richToText(block.body)].join('\n\n');
    case 'warning':
      return [heading('Watch out', block.title), richToText(block.body)].join('\n\n');
    case 'text':
      return richToText(block.body);
    case 'image':
      return `[Image: ${block.alt}]${block.caption ? `\n${block.caption}` : ''}`;
    case 'call_us':
      return block.text.replace('{phone}', settings.phone);
    case 'divider':
      return '----------';
  }
}

export function blocksToText(opts: {
  content: CampaignContent;
  settings: Settings;
  greeting: string;
  links: { webUrl: string; unsubUrl: string } | null;
}): string {
  const parts = [opts.greeting, ...opts.content.blocks.map((b) => blockText(b, opts.settings)), '----------', ...footerLines(opts.settings)];
  if (opts.links) parts.push(`View in browser: ${opts.links.webUrl}\nUnsubscribe: ${opts.links.unsubUrl}`);
  return `${parts.join('\n\n')}\n`;
}
