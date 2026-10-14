import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { api, uid } from './helpers';

async function importList(body: Record<string, unknown>) {
  const res = await api('/api/lists/import/commit', { method: 'POST', json: body });
  return { res, data: (await res.json()) as { listId: number; diff: { added: string[]; removed: string[]; unchanged: number; suppressed: string[] } } };
}

describe('lists API', () => {
  it('imports a new list and re-imports with changes', async () => {
    const d = uid();
    const name = `Clients ${d}`;
    const first = await importList({ name, csv: `Email,Name\na${d}@x.com,A\nb${d}@x.com,B\n`, removeMissing: true });
    expect(first.res.status).toBe(200);
    expect(first.data.diff.added).toHaveLength(2);

    const preview = await api('/api/lists/import/preview', { method: 'POST', json: { listId: first.data.listId, csv: `Email\nb${d}@x.com\nc${d}@x.com\n` } });
    const pv = (await preview.json()) as { diff: { added: string[]; removed: string[]; unchanged: number } };
    expect(pv.diff).toMatchObject({ added: [`c${d}@x.com`], removed: [`a${d}@x.com`], unchanged: 1 });

    const second = await importList({ listId: first.data.listId, csv: `Email\nb${d}@x.com\nc${d}@x.com\n`, removeMissing: true });
    expect(second.data.diff).toMatchObject({ added: [`c${d}@x.com`], removed: [`a${d}@x.com`], unchanged: 1 });

    const members = (await (await api(`/api/lists/${first.data.listId}/members`)).json()) as { members: { email: string }[] };
    expect(members.members.map((m) => m.email).sort()).toEqual([`b${d}@x.com`, `c${d}@x.com`]);
  });

  it('keeps missing people when removeMissing is false', async () => {
    const d = uid();
    const { data } = await importList({ name: `Keep ${d}`, csv: `Email\na${d}@x.com\n`, removeMissing: true });
    await importList({ listId: data.listId, csv: `Email\nb${d}@x.com\n`, removeMissing: false });
    const members = (await (await api(`/api/lists/${data.listId}/members`)).json()) as { members: unknown[] };
    expect(members.members).toHaveLength(2);
  });

  it('flags suppressed addresses', async () => {
    const d = uid();
    await env.DB.prepare("INSERT INTO suppressions (email, reason, created_at) VALUES (?, 'unsubscribed', ?)").bind(`s${d}@x.com`, new Date().toISOString()).run();
    const { data } = await importList({ name: `Supp ${d}`, csv: `Email\ns${d}@x.com\nok${d}@x.com\n`, removeMissing: true });
    expect(data.diff.suppressed).toEqual([`s${d}@x.com`]);
    const members = (await (await api(`/api/lists/${data.listId}/members`)).json()) as { members: { email: string; suppressed: boolean }[] };
    expect(members.members.find((m) => m.email === `s${d}@x.com`)?.suppressed).toBe(true);
    expect(members.members.find((m) => m.email === `ok${d}@x.com`)?.suppressed).toBe(false);
  });

  it('rejects a duplicate list name', async () => {
    const name = `Dup ${uid()}`;
    await importList({ name, csv: 'Email\na@x.com\n', removeMissing: true });
    const { res, data } = await importList({ name, csv: 'Email\nb@x.com\n', removeMissing: true });
    expect(res.status).toBe(409);
    expect(data).toEqual({ error: 'A list with that name already exists' });
  });

  it('lists, exports and deletes', async () => {
    const d = uid();
    const { data } = await importList({ name: `Export ${d}`, csv: `Email,Name\n"x${d}@x.com","Smith, Ann"\n`, removeMissing: true });
    const lists = (await (await api('/api/lists')).json()) as { lists: { id: number; memberCount: number }[] };
    expect(lists.lists.find((l) => l.id === data.listId)?.memberCount).toBe(1);

    const csv = await (await api(`/api/lists/${data.listId}/export`)).text();
    expect(csv).toBe(`Email,Name\nx${d}@x.com,"Smith, Ann"\n`);

    expect((await api(`/api/lists/${data.listId}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/lists/${data.listId}/members`)).status).toBe(404);
  });

  it('requires sign-in', async () => {
    const { app } = await import('../../src/worker/index');
    const res = await app.request('https://news.enhancedgroup.co.uk/api/lists', {}, { ...env, DEV_AUTH_BYPASS: undefined });
    expect(res.status).toBe(401);
  });
});
