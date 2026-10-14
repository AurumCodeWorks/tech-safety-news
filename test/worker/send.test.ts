import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CampaignDto } from '../../src/shared/api-types';
import { applyImport, createList } from '../../src/worker/db/lists';
import { handleScheduled } from '../../src/worker/scheduled';
import { runCampaignSend } from '../../src/worker/send';
import { api, mockFetch, uid } from './helpers';

const NOW = '2026-11-02T08:00:00.000Z';
const testEnv = { ...env, TEST_NOW: NOW };
const tip = { id: 't1', type: 'tip', title: 'Agree a family password', body: 'Pick a word.' };

/** Mailgun stub: domain verified; `failOn` lists 1-based message-call numbers that return 500. */
function stubMailgun(failOn: number[] = []) {
  let n = 0;
  const m = mockFetch((url) => {
    if (url.includes('/v4/domains/')) return Response.json({ domain: { state: 'active' }, sending_dns_records: [{ valid: 'valid' }] });
    n++;
    return failOn.includes(n) ? new Response('Internal error', { status: 500 }) : Response.json({ id: `<m${n}@mg>`, message: 'Queued' });
  });
  vi.stubGlobal('fetch', m.fn);
  return { calls: () => m.calls.filter((c) => c.url.endsWith('/messages')) };
}

afterEach(() => vi.unstubAllGlobals());

async function readyCampaign(people: { email: string; name: string }[], subject = `Fake parcel texts ${uid()}`) {
  const listId = await createList(env.DB, `S ${uid()}`, NOW);
  await applyImport(env.DB, listId, people, true, NOW);
  const c = (await (await api('/api/campaigns', { method: 'POST', json: { subject } })).json()) as CampaignDto;
  await api(`/api/campaigns/${c.id}`, { method: 'PUT', json: { subject, preheader: '', blocks: [tip], listIds: [listId], hideFromArchive: false } });
  await env.DB.prepare("UPDATE campaigns SET test_sent_at = '2999-01-01T00:00:00.000Z' WHERE id = ?").bind(c.id).run();
  return c.id;
}

const people = (n: number, d = uid()) => Array.from({ length: n }, (_, i) => ({ email: `p${i}-${d}@x.com`, name: `Person ${i}` }));

async function campaign(id: number) {
  return (await (await api(`/api/campaigns/${id}`)).json()) as CampaignDto;
}

async function sendCounts(id: number) {
  const { results } = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM sends WHERE campaign_id = ? GROUP BY status').bind(id).all<{ status: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.status, r.n]));
}

describe('runCampaignSend', () => {
  it('sends 2,500 people in three batches and marks the email sent', async () => {
    const mg = stubMailgun();
    const id = await readyCampaign(people(2500), 'Fake parcel texts');
    const result = await runCampaignSend(testEnv, id, 'dan@enhancedgroup.co.uk');
    expect(result).toEqual({ status: 'sent', accepted: 2500, pending: 0 });
    expect(mg.calls()).toHaveLength(3);
    expect(mg.calls().map((c) => c.form!.getAll('to').length)).toEqual([1000, 1000, 500]);
    expect(await sendCounts(id)).toEqual({ accepted: 2500 });
    const c = await campaign(id);
    expect(c.status).toBe('sent');
    expect(c.sentAt).toBe(NOW);
    expect(c.slug).toMatch(/^2026-11-fake-parcel-texts(-\d+)?$/);
  });

  it('sets personal unsubscribe headers and variables', async () => {
    const mg = stubMailgun();
    const id = await readyCampaign([{ email: `h${uid()}@x.com`, name: '"Smith, Ann" <b>' }]);
    await runCampaignSend(testEnv, id, 'dan@enhancedgroup.co.uk');
    const f = mg.calls()[0].form!;
    expect(f.get('h:List-Unsubscribe')).toBe('<%recipient.unsub_url%>');
    expect(f.get('h:List-Unsubscribe-Post')).toBe('List-Unsubscribe=One-Click');
    expect(f.get('v:send_id')).toBe('%recipient.send_id%');
    const vars = Object.values(JSON.parse(f.get('recipient-variables') as string) as Record<string, Record<string, string>>)[0];
    expect(vars.greeting).toBe('Hello "Smith, Ann" <b>,');
    expect(vars.greeting_html).toBe('Hello &quot;Smith, Ann&quot; &lt;b&gt;,');
    expect(vars.unsub_url).toMatch(/^https:\/\/news\.enhancedgroup\.co\.uk\/u\/[\w-]+\.[\w-]+$/);
    expect(vars.web_url).toMatch(/^https:\/\/news\.enhancedgroup\.co\.uk\/archive\//);
    expect(Number(vars.send_id)).toBeGreaterThan(0);
  });

  it('never double-sends when two runs race', async () => {
    const mg = stubMailgun();
    const id = await readyCampaign(people(1500));
    const [a, b] = await Promise.all([runCampaignSend(testEnv, id, 'x'), runCampaignSend(testEnv, id, 'y')]);
    expect([a.status, b.status].sort()).toEqual(['sent', 'skipped']);
    expect(mg.calls()).toHaveLength(2);
  });

  it('stops on a Mailgun error and retries only the unsent people', async () => {
    stubMailgun([2]);
    const id = await readyCampaign(people(2500));
    const first = await runCampaignSend(testEnv, id, 'x');
    expect(first).toEqual({ status: 'failed', accepted: 1000, pending: 1500 });
    const failed = await campaign(id);
    expect(failed.status).toBe('failed');
    expect(failed.lastError).toContain('Mailgun error 500');

    const mg = stubMailgun();
    const retry = await api(`/api/campaigns/${id}/retry`, { method: 'POST' }, { TEST_NOW: NOW });
    expect(await retry.json()).toEqual({ status: 'sent', accepted: 2500, pending: 0 });
    expect(mg.calls().map((c) => c.form!.getAll('to').length)).toEqual([1000, 500]);
  });

  it('send route refuses an email that fails preflight and leaves it as a draft', async () => {
    stubMailgun();
    const id = await readyCampaign(people(1));
    await env.DB.prepare('UPDATE campaigns SET test_sent_at = NULL WHERE id = ?').bind(id).run();
    const res = await api(`/api/campaigns/${id}/send`, { method: 'POST' });
    expect(res.status).toBe(400);
    expect((await campaign(id)).status).toBe('draft');
  });

  it('send route sends a ready email', async () => {
    stubMailgun();
    const id = await readyCampaign(people(3));
    const res = await api(`/api/campaigns/${id}/send`, { method: 'POST' }, { TEST_NOW: NOW });
    expect(await res.json()).toEqual({ status: 'sent', accepted: 3, pending: 0 });
  });
});

describe('handleScheduled', () => {
  it('sends due emails and leaves future ones', async () => {
    const mg = stubMailgun();
    const due = await readyCampaign(people(2));
    const later = await readyCampaign(people(2));
    await env.DB.prepare("UPDATE campaigns SET status = 'scheduled', scheduled_at = '2026-11-02T09:00:00.000Z' WHERE id = ?").bind(due).run();
    await env.DB.prepare("UPDATE campaigns SET status = 'scheduled', scheduled_at = '2026-11-02T09:10:00.000Z' WHERE id = ?").bind(later).run();
    await handleScheduled({ ...env, TEST_NOW: '2026-11-02T09:05:00.000Z' });
    expect((await campaign(due)).status).toBe('sent');
    expect((await campaign(later)).status).toBe('scheduled');
    expect(mg.calls()).toHaveLength(1);
  });

  it('clears old webhook tokens', async () => {
    stubMailgun();
    await env.DB.prepare("INSERT INTO webhook_tokens (token, received_at) VALUES ('old', '2026-11-02T07:00:00.000Z'), ('new', '2026-11-02T08:50:00.000Z')").run();
    await handleScheduled({ ...env, TEST_NOW: '2026-11-02T09:05:00.000Z' });
    const { results } = await env.DB.prepare("SELECT token FROM webhook_tokens WHERE token IN ('old','new')").all<{ token: string }>();
    expect(results.map((r) => r.token)).toEqual(['new']);
  });
});
