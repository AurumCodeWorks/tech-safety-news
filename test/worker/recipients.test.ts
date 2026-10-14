import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { applyImport, createList } from '../../src/worker/db/lists';
import { addSuppression, removeSuppression } from '../../src/worker/db/suppressions';
import { resolveRecipients } from '../../src/worker/recipients';
import { api, uid } from './helpers';

const now = '2026-11-01T10:00:00.000Z';

async function list(rows: { email: string; name: string }[]) {
  const id = await createList(env.DB, `L ${uid()}`, now);
  await applyImport(env.DB, id, rows, true, now);
  return id;
}

describe('resolveRecipients', () => {
  it('counts a person on two lists once and drops suppressed people', async () => {
    const d = uid();
    const a = await list([{ email: `ann${d}@x.com`, name: 'Ann' }, { email: `bob${d}@x.com`, name: 'Bob' }]);
    const b = await list([{ email: `ann${d}@x.com`, name: 'Ann' }, { email: `cat${d}@x.com`, name: 'Cat' }]);
    await addSuppression(env.DB, `bob${d}@x.com`, 'unsubscribed', now);
    const r = await resolveRecipients(env.DB, [a, b]);
    expect(r.recipients.map((x) => x.email).sort()).toEqual([`ann${d}@x.com`, `cat${d}@x.com`]);
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.suppressed).toBe(1);
    expect(r.recipients.find((x) => x.email === `ann${d}@x.com`)?.name).toBe('Ann');
  });

  it('returns nothing for no lists', async () => {
    expect(await resolveRecipients(env.DB, [])).toEqual({ recipients: [], duplicatesRemoved: 0, suppressed: 0 });
  });
});

describe('suppressions', () => {
  it('never downgrades an unsubscribe to a bounce', async () => {
    const e = `u${uid()}@x.com`;
    await addSuppression(env.DB, e, 'unsubscribed', now);
    await addSuppression(env.DB, e, 'bounced', now);
    const row = await env.DB.prepare('SELECT reason FROM suppressions WHERE email = ?').bind(e).first<{ reason: string }>();
    expect(row?.reason).toBe('unsubscribed');
  });

  it('upgrades a bounce to a complaint', async () => {
    const e = `c${uid()}@x.com`;
    await addSuppression(env.DB, e, 'bounced', now);
    await addSuppression(env.DB, e, 'complained', now);
    const row = await env.DB.prepare('SELECT reason FROM suppressions WHERE email = ?').bind(e).first<{ reason: string }>();
    expect(row?.reason).toBe('complained');
  });

  it("can't lift an unsubscribe or complaint", async () => {
    const e = `k${uid()}@x.com`;
    await addSuppression(env.DB, e, 'complained', now);
    await expect(removeSuppression(env.DB, e, 'they asked')).rejects.toThrow("Unsubscribes and complaints can't be removed");
  });
});

describe('suppressions API', () => {
  it('lists, adds and removes', async () => {
    const e = `api${uid()}@x.com`;
    expect((await api('/api/suppressions', { method: 'POST', json: { email: e } })).status).toBe(201);
    const all = (await (await api('/api/suppressions')).json()) as { suppressions: { email: string; reason: string }[] };
    expect(all.suppressions.find((s) => s.email === e)?.reason).toBe('manual');
    const del = await api(`/api/suppressions/${encodeURIComponent(e)}`, { method: 'DELETE', json: { note: 'Re-added at client request' } });
    expect(del.status).toBe(204);
  });

  it('requires a note to remove and refuses complaints', async () => {
    const e = `api${uid()}@x.com`;
    await addSuppression(env.DB, e, 'complained', now);
    expect((await api(`/api/suppressions/${encodeURIComponent(e)}`, { method: 'DELETE', json: {} })).status).toBe(400);
    const res = await api(`/api/suppressions/${encodeURIComponent(e)}`, { method: 'DELETE', json: { note: 'x' } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Unsubscribes and complaints can't be removed" });
  });

  it('counts recipients for chosen lists', async () => {
    const d = uid();
    const a = await list([{ email: `z${d}@x.com`, name: 'Z' }]);
    const res = await api('/api/recipients/count', { method: 'POST', json: { listIds: [a] } });
    expect(await res.json()).toEqual({ count: 1, duplicatesRemoved: 0, suppressed: 0 });
  });
});
