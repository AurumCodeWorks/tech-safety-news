import { Hono } from 'hono';
import { CardSchema } from '../../shared/blocks';
import { nowIso, nowMs } from '../clock';
import { createCard, deleteCard, markCardUsed, searchCards } from '../db/cards';
import { getSettings, updateSettings } from '../db/settings';
import type { AppEnv } from '../env';

export const cardsRoutes = new Hono<AppEnv>();

cardsRoutes.get('/', async (c) => c.json({ cards: await searchCards(c.env.DB, c.req.query('q') ?? '') }));

cardsRoutes.post('/', async (c) => {
  const body = CardSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Finish the card before saving it', issues: body.error.issues }, 400);
  return c.json(await createCard(c.env.DB, body.data, nowIso(c.env)), 201);
});

cardsRoutes.post('/:id/used', async (c) => {
  await markCardUsed(c.env.DB, Number(c.req.param('id')), nowIso(c.env));
  return c.body(null, 204);
});

cardsRoutes.delete('/:id', async (c) => {
  await deleteCard(c.env.DB, Number(c.req.param('id')));
  return c.body(null, 204);
});

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get('/', async (c) => c.json(await getSettings(c.env.DB)));

settingsRoutes.put('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ error: 'Invalid settings' }, 400);
  try {
    return c.json(await updateSettings(c.env.DB, body as Record<string, string>));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

export const mediaUploadRoutes = new Hono<AppEnv>();

mediaUploadRoutes.post('/', async (c) => {
  const type = (c.req.header('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) return c.json({ error: 'Use a PNG or JPEG image' }, 415);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) return c.json({ error: 'That image is too large. Use one under 2 MB' }, 413);
  if (bytes.byteLength === 0) return c.json({ error: 'That file is empty' }, 400);
  const d = new Date(nowMs(c.env));
  const key = `img/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type } });
  return c.json({ key, url: `${c.env.PUBLIC_BASE_URL}/media/${key}` }, 201);
});

export const mediaPublicRoutes = new Hono<AppEnv>();

mediaPublicRoutes.get('/*', async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/media\//, ''));
  if (!/^img\/\d{4}\/\d{2}\/[0-9a-f-]+\.(png|jpg)$/.test(key)) return c.notFound();
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});
