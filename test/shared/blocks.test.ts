import { describe, expect, it } from 'vitest';
import { BlockSchema, CampaignContentSchema, CardSchema } from '../../src/shared/blocks';

describe('BlockSchema', () => {
  it('requires image alt text', () => {
    expect(BlockSchema.safeParse({ id: 'a', type: 'image', r2Key: 'k', alt: '' }).success).toBe(false);
  });
  it('requires at least one warning sign', () => {
    expect(BlockSchema.safeParse({ id: 'a', type: 'scam_alert', title: 't', looksLike: 'x', warningSigns: [], whatToDo: 'y' }).success).toBe(false);
  });
  it('allows at most six warning signs', () => {
    const signs = Array.from({ length: 7 }, (_, i) => `sign ${i}`);
    expect(BlockSchema.safeParse({ id: 'a', type: 'scam_alert', title: 't', looksLike: 'x', warningSigns: signs, whatToDo: 'y' }).success).toBe(false);
  });
  it('accepts every block type', () => {
    const blocks = [
      { id: '1', type: 'scam_alert', title: 'T', looksLike: 'L', warningSigns: ['a'], whatToDo: 'W' },
      { id: '2', type: 'tip', title: 'T', body: 'B' },
      { id: '3', type: 'warning', title: 'T', body: 'B' },
      { id: '4', type: 'text', body: 'B' },
      { id: '5', type: 'image', r2Key: 'img/2026/10/x.png', alt: 'A' },
      { id: '6', type: 'call_us', text: 'Not sure? Call us on {phone}' },
      { id: '7', type: 'divider' },
    ];
    for (const b of blocks) expect(BlockSchema.safeParse(b).success, b.type).toBe(true);
  });
});

describe('CampaignContentSchema', () => {
  it('limits subject to 90 characters and preheader to 140', () => {
    const block = { id: '1', type: 'divider' };
    expect(CampaignContentSchema.safeParse({ subject: 'x'.repeat(91), preheader: '', blocks: [block] }).success).toBe(false);
    expect(CampaignContentSchema.safeParse({ subject: 'ok', preheader: 'x'.repeat(141), blocks: [block] }).success).toBe(false);
    expect(CampaignContentSchema.safeParse({ subject: 'ok', preheader: '', blocks: [] }).success).toBe(false);
    expect(CampaignContentSchema.safeParse({ subject: 'ok', preheader: '', blocks: [block] }).success).toBe(true);
  });
});

describe('CardSchema', () => {
  it('only allows alert card types', () => {
    expect(CardSchema.safeParse({ type: 'text', title: 'x', data: { id: '1', type: 'text', body: 'b' } }).success).toBe(false);
    expect(CardSchema.safeParse({ type: 'tip', title: 'x', data: { id: '1', type: 'tip', title: 'x', body: 'b' } }).success).toBe(true);
  });
});
