import { Hono } from 'hono';
import { nowIso, nowMs } from '../clock';
import { addSuppression } from '../db/suppressions';
import type { AppEnv } from '../env';

type MailgunEvent = {
  event?: string;
  severity?: string;
  timestamp?: number;
  'user-variables'?: Record<string, string>;
  'delivery-status'?: { message?: string; description?: string };
};

const MAX_AGE_S = 300;

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return new Uint8Array();
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

async function validSignature(key: string, timestamp: string, token: string, signature: string): Promise<boolean> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', k, hexToBytes(signature), new TextEncoder().encode(timestamp + token));
}

export const webhookRoutes = new Hono<AppEnv>();

webhookRoutes.post('/mailgun', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { signature?: { timestamp?: string; token?: string; signature?: string }; 'event-data'?: MailgunEvent } | null;
  const sig = body?.signature;
  if (!sig?.timestamp || !sig.token || !sig.signature) return c.json({ error: 'Missing signature' }, 401);
  if (Math.abs(nowMs(c.env) / 1000 - Number(sig.timestamp)) > MAX_AGE_S) return c.json({ error: 'Stale webhook' }, 401);
  if (!(await validSignature(c.env.MAILGUN_WEBHOOK_SIGNING_KEY, sig.timestamp, sig.token, sig.signature))) return c.json({ error: 'Bad signature' }, 401);

  const now = nowIso(c.env);
  const fresh = await c.env.DB.prepare('INSERT OR IGNORE INTO webhook_tokens (token, received_at) VALUES (?, ?)').bind(sig.token, now).run();
  if (fresh.meta.changes === 0) return c.json({ ignored: 'replay' });

  // Always answer 200 for events we can't match: Mailgun retries non-2xx responses for hours.
  const data = body?.['event-data'] ?? {};
  const sendId = Number(data['user-variables']?.send_id);
  const send = Number.isInteger(sendId)
    ? await c.env.DB.prepare('SELECT id, email, campaign_id FROM sends WHERE id = ?').bind(sendId).first<{ id: number; email: string; campaign_id: number }>()
    : null;
  if (!send) return c.json({ ignored: 'unknown send' });

  const db = c.env.DB;
  switch (data.event) {
    case 'delivered':
      await db.prepare("UPDATE sends SET status = 'delivered', updated_at = ? WHERE id = ? AND status IN ('pending', 'accepted')").bind(now, send.id).run();
      break;
    case 'opened':
      await db.prepare('UPDATE sends SET opened_at = COALESCE(opened_at, ?), updated_at = ? WHERE id = ?').bind(now, now, send.id).run();
      break;
    case 'failed': {
      if (data.severity !== 'permanent') return c.json({ ignored: 'temporary failure' });
      const reason = data['delivery-status']?.message || data['delivery-status']?.description || 'Permanent failure';
      await db.prepare("UPDATE sends SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status <> 'complained'").bind(reason.slice(0, 500), now, send.id).run();
      await addSuppression(db, send.email, 'bounced', now, send.campaign_id);
      break;
    }
    case 'complained':
      await db.prepare("UPDATE sends SET status = 'complained', updated_at = ? WHERE id = ?").bind(now, send.id).run();
      await addSuppression(db, send.email, 'complained', now, send.campaign_id);
      break;
    case 'unsubscribed':
      await db.prepare('UPDATE sends SET unsubscribed_at = COALESCE(unsubscribed_at, ?), updated_at = ? WHERE id = ?').bind(now, now, send.id).run();
      await addSuppression(db, send.email, 'unsubscribed', now, send.campaign_id);
      break;
    default:
      return c.json({ ignored: 'unhandled event' });
  }
  return c.json({ ok: true });
});
