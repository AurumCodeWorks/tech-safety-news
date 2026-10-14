import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { signUnsubToken } from '../../src/worker/tokens';
import { pub, uid } from './helpers';

const now = '2026-11-02T08:00:00.000Z';

async function sendRow() {
  const email = `u${uid()}@x.com`;
  const c = await env.DB.prepare("INSERT INTO campaigns (subject, created_by, created_at, updated_at, status) VALUES ('S', 'x', ?, ?, 'sent') RETURNING id")
    .bind(now, now)
    .first<{ id: number }>();
  const s = await env.DB.prepare("INSERT INTO sends (campaign_id, email, name, status, updated_at) VALUES (?, ?, 'U', 'delivered', ?) RETURNING id")
    .bind(c!.id, email, now)
    .first<{ id: number }>();
  const token = await signUnsubToken('test-unsub-secret', { sendId: s!.id });
  return { email, sendId: s!.id, token, campaignId: c!.id };
}

const suppression = (email: string) => env.DB.prepare('SELECT reason, campaign_id FROM suppressions WHERE email = ?').bind(email).first<{ reason: string; campaign_id: number }>();

describe('unsubscribe', () => {
  it('GET shows a confirmation page and changes nothing', async () => {
    const { email, token } = await sendRow();
    const res = await pub(`/u/${token}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Stop receiving Tech Safety News?');
    expect(html).toContain('<form method="post"');
    expect(await suppression(email)).toBeNull();
  });

  it('POST unsubscribes, records the time, and is idempotent', async () => {
    const { email, token, sendId, campaignId } = await sendRow();
    const res = await pub(`/u/${token}`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('You’ve been unsubscribed. If this was a mistake, call us on 0117 472 9200.');
    expect(await suppression(email)).toEqual({ reason: 'unsubscribed', campaign_id: campaignId });
    const send = await env.DB.prepare('SELECT unsubscribed_at FROM sends WHERE id = ?').bind(sendId).first<{ unsubscribed_at: string }>();
    expect(send?.unsubscribed_at).toBeTruthy();
    expect((await pub(`/u/${token}`, { method: 'POST' })).status).toBe(200);
  });

  it('supports RFC 8058 one-click unsubscribe', async () => {
    const { email, token } = await sendRow();
    const res = await pub(`/u/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(res.status).toBe(200);
    expect((await suppression(email))?.reason).toBe('unsubscribed');
  });

  it('test tokens change nothing', async () => {
    const token = await signUnsubToken('test-unsub-secret', { test: 1 });
    for (const method of ['GET', 'POST']) {
      const res = await pub(`/u/${token}`, { method });
      expect(await res.text()).toContain('This is a test email — nothing was changed');
    }
  });

  it('invalid tokens get a friendly page with the phone number', async () => {
    const res = await pub('/u/garbage');
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('This link isn’t valid. If you need help, call us on 0117 472 9200.');
  });

  it('pages support light and dark mode', async () => {
    const html = await (await pub('/u/garbage')).text();
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('/brand/logo-lockup-dark.svg');
  });
});
