import { BlockSchema, type Block, type BlockType } from '../../shared/blocks';

export const BLOCK_LABELS: Record<BlockType, string> = {
  scam_alert: 'Scam alert',
  tip: 'Tip of the month',
  warning: 'Watch out',
  text: 'Text',
  image: 'Image',
  call_us: 'Call-us bar',
  divider: 'Divider',
};

/** Labels for the "Add" buttons (shorter than the pill labels). */
export const ADD_LABELS: [BlockType, string][] = [
  ['scam_alert', 'Scam alert'],
  ['tip', 'Tip'],
  ['warning', 'Warning'],
  ['text', 'Text'],
  ['image', 'Image'],
  ['call_us', 'Call-us bar'],
  ['divider', 'Divider'],
];

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function newBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case 'scam_alert':
      return { id, type, title: '', looksLike: '', warningSigns: [''], whatToDo: '' };
    case 'tip':
    case 'warning':
      return { id, type, title: '', body: '' };
    case 'text':
      return { id, type, body: '' };
    case 'image':
      return { id, type, r2Key: '', alt: '' };
    case 'call_us':
      return { id, type, text: 'Not sure? Call us on {phone}' };
    case 'divider':
      return { id, type };
  }
}

export const cloneBlock = (b: Block): Block => ({ ...structuredClone(b), id: newId() });

/** Field path → first validation message, e.g. { title: 'Add a title', 'warningSigns.0': '…' }. */
export function blockErrors(block: Block): Record<string, string> {
  const r = BlockSchema.safeParse(block);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.');
    out[key] ??= issue.message;
  }
  return out;
}
