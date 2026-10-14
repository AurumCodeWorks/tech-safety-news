import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { CampaignDto } from '../../src/shared/api-types';
import { api, pub } from './helpers';

const NOW = { TEST_NOW: '2026-11-02T08:00:00.000Z' };
const tip = { id: 't1', type: 'tip', title: 'Agree a family password', body: 'Pick a word.' };

async function newCampaign(subject = 'November alerts') {
  const res = await api('/api/campaigns', { method: 'POST', json: { subject } });
  expect(res.status).toBe(201);
  return (await res.json()) as CampaignDto;
}

const put = (id: number, body: Record<string, unknown>) =>
  api(`/api/campaigns/${id}`, { method: 'PUT', json: { subject: 'S', preheader: '', blocks: [tip], listIds: [], hideFromArchive: false, ...body } });

describe('campaigns API', () => {
  it('creates, updates and reads back a draft', async () => {
    const c = await newCampaign();
    expect(c.status).toBe('draft');
    const res = await put(c.id, { subject: 'Updated', preheader: 'Preview', blocks: [tip], hideFromArchive: true });
    expect(res.status).toBe(200);
    const got = (await (await api(`/api/campaigns/${c.id}`)).json()) as CampaignDto;
    expect(got).toMatchObject({ subject: 'Updated', preheader: 'Preview', blocks: [tip], hideFromArchive: true, status: 'draft' });
  });

  it('allows an empty draft', async () => {
    const c = await newCampaign('');
    expect((await put(c.id, { subject: '', blocks: [] })).status).toBe(200);
  });

  it('lists campaigns newest first without blocks', async () => {
    const a = await newCampaign('First');
    const b = await newCampaign('Second');
    const { campaigns } = (await (await api('/api/campaigns')).json()) as { campaigns: CampaignDto[] };
    const ids = campaigns.map((x) => x.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    expect(campaigns[0]).not.toHaveProperty('blocks');
  });

  it('refuses edits once sending or sent', async () => {
    const c = await newCampaign();
    await env.DB.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?").bind(c.id).run();
    const res = await put(c.id, {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'This email has already been sent' });
    await env.DB.prepare("UPDATE campaigns SET status = 'sending' WHERE id = ?").bind(c.id).run();
    expect(await (await put(c.id, {})).json()).toEqual({ error: 'This email is sending' });
  });

  it('turns a scheduled email back into a draft when edited', async () => {
    const c = await newCampaign();
    await env.DB.prepare("UPDATE campaigns SET status = 'scheduled', scheduled_at = '2026-12-01T09:00:00.000Z' WHERE id = ?").bind(c.id).run();
    await put(c.id, { subject: 'Changed' });
    const got = (await (await api(`/api/campaigns/${c.id}`)).json()) as CampaignDto;
    expect(got.status).toBe('draft');
    expect(got.scheduledAt).toBeNull();
  });

  it('rejects schedule times that are too soon or skipped by the clocks', async () => {
    const c = await newCampaign();
    const soon = await api(`/api/campaigns/${c.id}/schedule`, { method: 'POST', json: { local: '2026-11-02T08:02' } }, NOW);
    expect(soon.status).toBe(400);
    expect(((await soon.json()) as { error: string }).error).toBe('Pick a time at least 5 minutes from now');
    const gap = await api(`/api/campaigns/${c.id}/schedule`, { method: 'POST', json: { local: '2027-03-28T01:30' } }, NOW);
    expect(gap.status).toBe(400);
    expect(((await gap.json()) as { error: string }).error).toContain('clocks go forward');
  });

  it('unschedules back to draft', async () => {
    const c = await newCampaign();
    await env.DB.prepare("UPDATE campaigns SET status = 'scheduled', scheduled_at = '2026-12-01T09:00:00.000Z' WHERE id = ?").bind(c.id).run();
    expect((await api(`/api/campaigns/${c.id}/unschedule`, { method: 'POST' })).status).toBe(200);
    expect(((await (await api(`/api/campaigns/${c.id}`)).json()) as CampaignDto).status).toBe('draft');
  });

  it('duplicates content and lists as a new draft', async () => {
    const c = await newCampaign();
    await env.DB.prepare("INSERT INTO lists (name, created_at, updated_at) VALUES ('Dup list', 'x', 'x')").run();
    const list = await env.DB.prepare("SELECT id FROM lists WHERE name = 'Dup list'").first<{ id: number }>();
    await put(c.id, { subject: 'Original', listIds: [list!.id] });
    await env.DB.prepare("UPDATE campaigns SET status = 'sent', sent_at = 'x', slug = ? WHERE id = ?").bind(`s-${c.id}`, c.id).run();
    const res = await api('/api/campaigns', { method: 'POST', json: { duplicateOf: c.id } });
    const copy = (await res.json()) as CampaignDto;
    expect(copy).toMatchObject({ subject: 'Original', blocks: [tip], listIds: [list!.id], status: 'draft', sentAt: null, slug: null });
    expect(copy.id).not.toBe(c.id);
  });

  it('deletes drafts only', async () => {
    const c = await newCampaign();
    expect((await api(`/api/campaigns/${c.id}`, { method: 'DELETE' })).status).toBe(204);
    const s = await newCampaign();
    await env.DB.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?").bind(s.id).run();
    expect((await api(`/api/campaigns/${s.id}`, { method: 'DELETE' })).status).toBe(409);
  });

  it('previews with a sample recipient', async () => {
    const res = await api('/api/preview', { method: 'POST', json: { content: { subject: 'Hi', preheader: '', blocks: [tip, { id: 'bad', type: 'tip', title: '' }] } } });
    const { html, text } = (await res.json()) as { html: string; text: string };
    expect(html).toContain('Hello Margaret,');
    expect(html).toContain('Agree a family password');
    expect(text).toContain('TIP OF THE MONTH');
  });
});

describe('cards API', () => {
  it('saves, searches, marks used and deletes cards', async () => {
    const res = await api('/api/cards', { method: 'POST', json: { type: 'tip', title: 'Family password', data: tip } });
    expect(res.status).toBe(201);
    const card = (await res.json()) as { id: number };
    const found = (await (await api('/api/cards?q=family')).json()) as { cards: { id: number; title: string }[] };
    expect(found.cards.some((x) => x.id === card.id)).toBe(true);
    expect((await api(`/api/cards/${card.id}/used`, { method: 'POST' })).status).toBe(204);
    expect((await api(`/api/cards/${card.id}`, { method: 'DELETE' })).status).toBe(204);
  });

  it('rejects invalid card data', async () => {
    expect((await api('/api/cards', { method: 'POST', json: { type: 'tip', title: 'x', data: { id: 'a', type: 'tip', title: '' } } })).status).toBe(400);
  });
});

describe('media', () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it('rejects the wrong type and oversized files', async () => {
    expect((await api('/api/media', { method: 'POST', body: pngBytes, headers: { 'Content-Type': 'image/gif' } })).status).toBe(415);
    const big = new Uint8Array(3 * 1024 * 1024);
    expect((await api('/api/media', { method: 'POST', body: big, headers: { 'Content-Type': 'image/png' } })).status).toBe(413);
  });

  it('stores a PNG and serves it publicly', async () => {
    const res = await api('/api/media', { method: 'POST', body: pngBytes, headers: { 'Content-Type': 'image/png' } }, NOW);
    expect(res.status).toBe(201);
    const { key, url } = (await res.json()) as { key: string; url: string };
    expect(key).toMatch(/^img\/2026\/11\/[0-9a-f-]+\.png$/);
    expect(url).toBe(`https://news.enhancedgroup.co.uk/media/${key}`);
    const got = await pub(`/media/${key}`);
    expect(got.status).toBe(200);
    expect(got.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(pngBytes);
  });
});

describe('settings API', () => {
  it('reads and updates settings', async () => {
    const s = (await (await api('/api/settings')).json()) as { company_number: string };
    expect(s.company_number).toBe('13094854');
    const res = await api('/api/settings', { method: 'PUT', json: { sender_name: 'Enhanced Group Tech Safety' } });
    expect(res.status).toBe(200);
    expect((await api('/api/settings', { method: 'PUT', json: { bogus: 'x' } })).status).toBe(400);
  });
});
