import { Hono } from 'hono';
import { z } from 'zod';
import { nowIso } from '../clock';
import { parseContactsCsv, toCsv } from '../csv';
import { applyImport, createList, deleteList, diffList, getList, listLists, listMembers, ListNameTakenError } from '../db/lists';
import type { AppEnv } from '../env';

const Mapping = z.object({ email: z.string(), name: z.string().optional(), first: z.string().optional(), last: z.string().optional() });
const PreviewBody = z.object({ listId: z.number().int().optional(), csv: z.string().max(5_000_000), mapping: Mapping.optional() });
const CommitBody = PreviewBody.extend({ name: z.string().trim().min(1).max(100).optional(), removeMissing: z.boolean() });

export const listsRoutes = new Hono<AppEnv>();

listsRoutes.get('/', async (c) => c.json({ lists: await listLists(c.env.DB) }));

listsRoutes.post('/import/preview', async (c) => {
  const body = PreviewBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Choose a CSV file to upload' }, 400);
  if (body.data.listId !== undefined && !(await getList(c.env.DB, body.data.listId))) return c.json({ error: 'List not found' }, 404);
  const parse = parseContactsCsv(body.data.csv, body.data.mapping);
  const diff = await diffList(c.env.DB, body.data.listId ?? null, parse.rows);
  return c.json({ parse, diff });
});

listsRoutes.post('/import/commit', async (c) => {
  const body = CommitBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Choose a CSV file and a list name' }, 400);
  const { csv, mapping, removeMissing, name } = body.data;
  let listId = body.data.listId ?? null;
  const parse = parseContactsCsv(csv, mapping);
  if (!parse.mapping) return c.json({ error: 'Choose which column has the email addresses' }, 400);
  const now = nowIso(c.env);
  if (listId === null) {
    if (!name) return c.json({ error: 'Give the new list a name' }, 400);
    try {
      listId = await createList(c.env.DB, name, now);
    } catch (e) {
      if (e instanceof ListNameTakenError) return c.json({ error: e.message }, 409);
      throw e;
    }
  } else if (!(await getList(c.env.DB, listId))) {
    return c.json({ error: 'List not found' }, 404);
  }
  const diff = await diffList(c.env.DB, listId, parse.rows);
  await applyImport(c.env.DB, listId, parse.rows, removeMissing, now);
  return c.json({ listId, diff: removeMissing ? diff : { ...diff, removed: [] } });
});

listsRoutes.get('/:id/members', async (c) => {
  const id = Number(c.req.param('id'));
  if (!(await getList(c.env.DB, id))) return c.json({ error: 'List not found' }, 404);
  return c.json({ members: await listMembers(c.env.DB, id, c.req.query('q') ?? '') });
});

listsRoutes.get('/:id/export', async (c) => {
  const id = Number(c.req.param('id'));
  const list = await getList(c.env.DB, id);
  if (!list) return c.json({ error: 'List not found' }, 404);
  const members = await listMembers(c.env.DB, id);
  return c.body(toCsv(members), 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${list.name.replace(/[^\w -]/g, '')}.csv"`,
  });
});

listsRoutes.delete('/:id', async (c) => {
  await deleteList(c.env.DB, Number(c.req.param('id')));
  return c.body(null, 204);
});
