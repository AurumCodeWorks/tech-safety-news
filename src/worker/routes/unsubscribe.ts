import { Hono } from 'hono';
import { escapeHtml } from '../../shared/richtext';
import { nowIso } from '../clock';
import { getSettings, type Settings } from '../db/settings';
import { addSuppression } from '../db/suppressions';
import type { AppEnv } from '../env';
import { simplePage } from '../pages/simple-page';
import { verifyUnsubToken } from '../tokens';

export const unsubscribeRoutes = new Hono<AppEnv>();

const page = (settings: Settings, title: string, body: string) => simplePage({ title, settings, bodyHtml: `<h1>${escapeHtml(title)}</h1>${body}` });

async function resolve(c: { env: AppEnv['Bindings'] }, token: string) {
  const payload = await verifyUnsubToken(c.env.UNSUB_SECRET, token);
  if (!payload) return { kind: 'invalid' as const };
  if ('test' in payload) return { kind: 'test' as const };
  const send = await c.env.DB.prepare('SELECT id, email, campaign_id FROM sends WHERE id = ?').bind(payload.sendId).first<{ id: number; email: string; campaign_id: number }>();
  return send ? { kind: 'send' as const, send } : { kind: 'invalid' as const };
}

function invalid(settings: Settings) {
  return page(settings, 'Link not recognised', `<p>This link isn’t valid. If you need help, call us on ${escapeHtml(settings.phone)}.</p>`);
}

function testPage(settings: Settings) {
  return page(settings, 'Test email', '<p>This is a test email — nothing was changed.</p>');
}

// GET never unsubscribes: email security scanners open every link in a message.
unsubscribeRoutes.get('/:token', async (c) => {
  const settings = await getSettings(c.env.DB);
  const r = await resolve(c, c.req.param('token'));
  if (r.kind === 'invalid') return c.html(invalid(settings), 400);
  if (r.kind === 'test') return c.html(testPage(settings));
  return c.html(
    page(
      settings,
      'Stop receiving Tech Safety News?',
      `<p>Press the button below and we’ll stop sending these emails to <strong>${escapeHtml(r.send.email)}</strong>.</p>
<form method="post"><button class="button" type="submit">Unsubscribe</button></form>`,
    ),
  );
});

// Handles both the button on the page and RFC 8058 one-click (body: List-Unsubscribe=One-Click).
unsubscribeRoutes.post('/:token', async (c) => {
  const settings = await getSettings(c.env.DB);
  const r = await resolve(c, c.req.param('token'));
  if (r.kind === 'invalid') return c.html(invalid(settings), 400);
  if (r.kind === 'test') return c.html(testPage(settings));
  const now = nowIso(c.env);
  await addSuppression(c.env.DB, r.send.email, 'unsubscribed', now, r.send.campaign_id);
  await c.env.DB.prepare('UPDATE sends SET unsubscribed_at = COALESCE(unsubscribed_at, ?), updated_at = ? WHERE id = ?').bind(now, now, r.send.id).run();
  return c.html(page(settings, 'You’re unsubscribed', `<p>You’ve been unsubscribed. If this was a mistake, call us on ${escapeHtml(settings.phone)}.</p>`));
});
