import { Hono } from 'hono';
import { z } from 'zod';
import { BlockSchema, DraftContentSchema, type Block } from '../../shared/blocks';
import { londonLocalToUtc } from '../../shared/time';
import { renderCampaign } from '../../email/render';
import { nowIso, nowMs } from '../clock';
import {
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  LOCKED_MESSAGES,
  saveCampaignContent,
  setScheduled,
} from '../db/campaigns';
import { getSettings } from '../db/settings';
import type { AppEnv } from '../env';

const SaveBody = DraftContentSchema.extend({
  listIds: z.array(z.number().int()).default([]),
  hideFromArchive: z.boolean().default(false),
});

const MIN_LEAD_MS = 5 * 60_000;

export const campaignsRoutes = new Hono<AppEnv>();

campaignsRoutes.get('/', async (c) => c.json({ campaigns: await listCampaigns(c.env.DB) }));

campaignsRoutes.post('/', async (c) => {
  const body = z
    .object({ subject: z.string().max(90).optional(), duplicateOf: z.number().int().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Invalid request' }, 400);
  const createdBy = c.get('userEmail');
  const now = nowIso(c.env);
  if (body.data.duplicateOf !== undefined) {
    const src = await getCampaign(c.env.DB, body.data.duplicateOf);
    if (!src) return c.json({ error: 'Email not found' }, 404);
    const copy = await createCampaign(c.env.DB, { subject: src.subject, preheader: src.preheader, blocks: src.blocks, listIds: src.listIds, createdBy, now });
    return c.json(copy, 201);
  }
  return c.json(await createCampaign(c.env.DB, { subject: body.data.subject ?? '', createdBy, now }), 201);
});

campaignsRoutes.get('/:id', async (c) => {
  const campaign = await getCampaign(c.env.DB, Number(c.req.param('id')));
  return campaign ? c.json(campaign) : c.json({ error: 'Email not found' }, 404);
});

campaignsRoutes.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const campaign = await getCampaign(c.env.DB, id);
  if (!campaign) return c.json({ error: 'Email not found' }, 404);
  const locked = LOCKED_MESSAGES[campaign.status];
  if (locked) return c.json({ error: locked }, 409);
  const body = SaveBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Some fields are too long', issues: body.error.issues }, 400);
  await saveCampaignContent(c.env.DB, id, body.data, nowIso(c.env));
  return c.json(await getCampaign(c.env.DB, id));
});

campaignsRoutes.delete('/:id', async (c) => {
  const ok = await deleteCampaign(c.env.DB, Number(c.req.param('id')));
  return ok ? c.body(null, 204) : c.json({ error: 'Only drafts can be deleted' }, 409);
});

campaignsRoutes.post('/:id/schedule', async (c) => {
  const id = Number(c.req.param('id'));
  const campaign = await getCampaign(c.env.DB, id);
  if (!campaign) return c.json({ error: 'Email not found' }, 404);
  const locked = LOCKED_MESSAGES[campaign.status];
  if (locked) return c.json({ error: locked }, 409);
  const body = z.object({ local: z.string() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Enter a date and time' }, 400);
  let utc: string;
  try {
    utc = londonLocalToUtc(body.data.local);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  if (Date.parse(utc) < nowMs(c.env) + MIN_LEAD_MS) return c.json({ error: 'Pick a time at least 5 minutes from now' }, 400);
  await setScheduled(c.env.DB, id, utc);
  return c.json(await getCampaign(c.env.DB, id));
});

campaignsRoutes.post('/:id/unschedule', async (c) => {
  const id = Number(c.req.param('id'));
  await setScheduled(c.env.DB, id, null);
  return c.json(await getCampaign(c.env.DB, id));
});

export const previewRoutes = new Hono<AppEnv>();

previewRoutes.post('/', async (c) => {
  const body = z
    .object({ content: DraftContentSchema })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid preview request' }, 400);
  // Preview whatever is valid so far; half-finished blocks are skipped rather than failing the preview.
  const blocks = body.data.content.blocks.flatMap((b) => {
    const parsed = BlockSchema.safeParse(b);
    return parsed.success ? [parsed.data as Block] : [];
  });
  const settings = await getSettings(c.env.DB);
  const result = await renderCampaign({
    content: { subject: body.data.content.subject || 'Untitled', preheader: body.data.content.preheader, blocks },
    settings,
    baseUrl: new URL(c.req.url).origin,
    issueDate: nowIso(c.env),
    mode: 'email',
    recipient: { name: 'Margaret', unsubUrl: '#unsubscribe', webUrl: '#view-in-browser' },
  });
  return c.json(result);
});
