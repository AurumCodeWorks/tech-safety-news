import { Hono } from 'hono';
import { z } from 'zod';
import { nowIso } from '../clock';
import { addSuppression, listSuppressions, PermanentSuppressionError, removeSuppression } from '../db/suppressions';
import type { AppEnv } from '../env';
import { resolveRecipients } from '../recipients';

export const suppressionsRoutes = new Hono<AppEnv>();

suppressionsRoutes.get('/', async (c) => c.json({ suppressions: await listSuppressions(c.env.DB) }));

suppressionsRoutes.post('/', async (c) => {
  const body = z.object({ email: z.email() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Enter a valid email address' }, 400);
  await addSuppression(c.env.DB, body.data.email.toLowerCase(), 'manual', nowIso(c.env));
  return c.json({ ok: true }, 201);
});

suppressionsRoutes.delete('/:email', async (c) => {
  const body = z.object({ note: z.string().trim().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Add a note saying why this address can be emailed again' }, 400);
  try {
    await removeSuppression(c.env.DB, decodeURIComponent(c.req.param('email')), body.data.note);
  } catch (e) {
    if (e instanceof PermanentSuppressionError) return c.json({ error: e.message }, 409);
    throw e;
  }
  return c.body(null, 204);
});

export const recipientsRoutes = new Hono<AppEnv>();

recipientsRoutes.post('/count', async (c) => {
  const body = z.object({ listIds: z.array(z.number().int()) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Choose at least one list' }, 400);
  const r = await resolveRecipients(c.env.DB, body.data.listIds);
  return c.json({ count: r.recipients.length, duplicatesRemoved: r.duplicatesRemoved, suppressed: r.suppressed });
});
