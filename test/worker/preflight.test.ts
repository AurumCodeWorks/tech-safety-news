import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CampaignDto } from '../../src/shared/api-types';
import { applyImport, createList } from '../../src/worker/db/lists';
import { preflight } from '../../src/worker/send';
import { api, mockFetch, uid } from './helpers';

const tip = { id: 't1', type: 'tip', title: 'Agree a family password', body: 'Pick a word.' };

function stubMailgun(verified: boolean | 'sending-key' = true) {
  const m = mockFetch((url) =>
    url.includes('/v4/domains/') && verified === 'sending-key'
      ? new Response('Forbidden', { status: 401 })
      : url.includes('/v4/domains/')
      ? Response.json({ domain: { state: verified ? 'active' : 'unverified' }, sending_dns_records: [{ valid: verified ? 'valid' : 'invalid' }] })
      : Response.json({ id: '<m1@mg>', message: 'Queued' }),
  );
  vi.stubGlobal('fetch', m.fn);
  return m;
}

afterEach(() => vi.unstubAllGlobals());

async function readyCampaign() {
  const listId = await createList(env.DB, `P ${uid()}`, '2026-11-01T00:00:00.000Z');
  await applyImport(env.DB, listId, [{ email: `p${uid()}@x.com`, name: 'P' }], true, '2026-11-01T00:00:00.000Z');
  const c = (await (await api('/api/campaigns', { method: 'POST', json: { subject: 'Ready' } })).json()) as CampaignDto;
  await api(`/api/campaigns/${c.id}`, { method: 'PUT', json: { subject: 'Ready', preheader: '', blocks: [tip], listIds: [listId], hideFromArchive: false } });
  return c.id;
}

describe('preflight', () => {
  it('requires a test after the latest changes, then passes', async () => {
    stubMailgun();
    const id = await readyCampaign();
    const before = await preflight(env, id);
    expect(before).toEqual({ ok: false, reasons: ['Send yourself a test after your latest changes'] });
    expect((await api(`/api/campaigns/${id}/test`, { method: 'POST', json: {} })).status).toBe(204);
    expect(await preflight(env, id)).toEqual({ ok: true, recipients: 1 });
  });

  it('blocks sending when Mailgun has not verified the domain', async () => {
    stubMailgun(false);
    const id = await readyCampaign();
    const r = await preflight(env, id);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reasons).toContain("Mailgun hasn't verified news.enhancedgroup.co.uk yet");
  });

  it('does not block when a sending-only key cannot read the domain status', async () => {
    stubMailgun('sending-key');
    const id = await readyCampaign();
    await api(`/api/campaigns/${id}/test`, { method: 'POST', json: {} });
    expect(await preflight(env, id)).toEqual({ ok: true, recipients: 1 });
  });

  it('lists every content problem', async () => {
    stubMailgun();
    const c = (await (await api('/api/campaigns', { method: 'POST', json: { subject: '' } })).json()) as CampaignDto;
    const r = await preflight(env, c.id);
    expect(!r.ok && r.reasons).toEqual([
      'Send yourself a test after your latest changes',
      'Add a subject',
      'Add at least one block',
      'Pick at least one list with people on it',
    ]);
    await api(`/api/campaigns/${c.id}`, { method: 'PUT', json: { subject: 'S', preheader: '', blocks: [{ id: 'x', type: 'tip', title: '' }], listIds: [] } });
    const r2 = await preflight(env, c.id);
    expect(!r2.ok && r2.reasons).toContain('Fix the highlighted blocks');
  });
});

describe('test send', () => {
  it('sends a [TEST] copy to the signed-in user and records the time', async () => {
    const m = stubMailgun();
    const id = await readyCampaign();
    const res = await api(`/api/campaigns/${id}/test`, { method: 'POST', json: {} }, { TEST_NOW: '2026-11-02T08:00:00.000Z' });
    expect(res.status).toBe(204);
    const send = m.calls.find((c) => c.url.endsWith('/messages'))!;
    expect(send.form!.get('subject')).toBe('[TEST] Ready');
    expect(send.form!.getAll('to')).toEqual(['dev@enhancedgroup.co.uk']);
    expect(send.form!.get('html')).toContain('Hello Test,');
    expect(send.form!.get('h:List-Unsubscribe')).toBeNull();
    const got = (await (await api(`/api/campaigns/${id}`)).json()) as CampaignDto;
    expect(got.testSentAt).toBe('2026-11-02T08:00:00.000Z');
  });

  it('refuses to test an email with no content', async () => {
    stubMailgun();
    const c = (await (await api('/api/campaigns', { method: 'POST', json: { subject: '' } })).json()) as CampaignDto;
    const res = await api(`/api/campaigns/${c.id}/test`, { method: 'POST', json: {} });
    expect(res.status).toBe(400);
  });

  it('blocks scheduling until preflight passes', async () => {
    stubMailgun();
    const id = await readyCampaign();
    const res = await api(`/api/campaigns/${id}/schedule`, { method: 'POST', json: { local: '2026-12-01T09:00' } }, { TEST_NOW: '2026-11-02T08:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reasons: string[] }).reasons).toEqual(['Send yourself a test after your latest changes']);
  });
});
