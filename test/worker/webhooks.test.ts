import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CampaignStats, StatusDto } from '../../src/shared/api-types';
import { api, mockFetch, pub, uid } from './helpers';

const NOW = '2026-11-02T08:00:00.000Z';
const nowSec = Math.floor(Date.parse(NOW) / 1000);

async function hmacHex(key: string, data: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hook(eventData: Record<string, unknown>, opts: { token?: string; timestamp?: number; key?: string } = {}) {
  const timestamp = String(opts.timestamp ?? nowSec);
  const token = opts.token ?? uid() + uid();
  const signature = await hmacHex(opts.key ?? 'test-signing-key', timestamp + token);
  return pub('/webhooks/mailgun', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature: { timestamp, token, signature }, 'event-data': eventData }),
  }, { TEST_NOW: NOW });
}

async function campaignWithSends(n: number) {
  const c = await env.DB.prepare("INSERT INTO campaigns (subject, created_by, created_at, updated_at, status, sent_at) VALUES ('Stats', 'x', ?, ?, 'sent', ?) RETURNING id")
    .bind(NOW, NOW, NOW)
    .first<{ id: number }>();
  const ids: number[] = [];
  const emails: string[] = [];
  for (let i = 0; i < n; i++) {
    const email = `w${i}${uid()}@x.com`;
    const s = await env.DB.prepare("INSERT INTO sends (campaign_id, email, status, updated_at) VALUES (?, ?, 'accepted', ?) RETURNING id").bind(c!.id, email, NOW).first<{ id: number }>();
    ids.push(s!.id);
    emails.push(email);
  }
  return { campaignId: c!.id, ids, emails };
}

const ev = (event: string, sendId: number | undefined, extra: Record<string, unknown> = {}) => ({
  event,
  timestamp: nowSec,
  'user-variables': sendId === undefined ? {} : { send_id: String(sendId) },
  ...extra,
});

const sendRow = (id: number) => env.DB.prepare('SELECT status, opened_at, error FROM sends WHERE id = ?').bind(id).first<{ status: string; opened_at: string | null; error: string | null }>();
const suppressed = (email: string) => env.DB.prepare('SELECT reason FROM suppressions WHERE email = ?').bind(email).first<{ reason: string }>();

afterEach(() => vi.unstubAllGlobals());

describe('Mailgun webhook', () => {
  it('rejects a bad signature and a stale timestamp', async () => {
    const { ids } = await campaignWithSends(1);
    expect((await hook(ev('delivered', ids[0]), { key: 'wrong' })).status).toBe(401);
    expect((await hook(ev('delivered', ids[0]), { timestamp: nowSec - 600 })).status).toBe(401);
    expect((await sendRow(ids[0]))?.status).toBe('accepted');
  });

  it('ignores replayed tokens', async () => {
    const { ids } = await campaignWithSends(1);
    expect((await hook(ev('opened', ids[0]), { token: 'replay-me' })).status).toBe(200);
    const replay = await hook(ev('complained', ids[0]), { token: 'replay-me' });
    expect(await replay.json()).toEqual({ ignored: 'replay' });
    expect((await sendRow(ids[0]))?.status).toBe('accepted');
  });

  it('records delivery and the first open only', async () => {
    const { ids } = await campaignWithSends(1);
    await hook(ev('delivered', ids[0]));
    await hook(ev('opened', ids[0]));
    const first = (await sendRow(ids[0]))!.opened_at;
    await hook(ev('opened', ids[0], { timestamp: nowSec + 100 }));
    const row = await sendRow(ids[0]);
    expect(row?.status).toBe('delivered');
    expect(row?.opened_at).toBe(first);
  });

  it('suppresses permanent bounces but not temporary ones', async () => {
    const { ids, emails } = await campaignWithSends(2);
    await hook(ev('failed', ids[0], { severity: 'permanent', 'delivery-status': { message: '550 No such user' } }));
    await hook(ev('failed', ids[1], { severity: 'temporary' }));
    expect(await sendRow(ids[0])).toMatchObject({ status: 'failed', error: '550 No such user' });
    expect((await suppressed(emails[0]))?.reason).toBe('bounced');
    expect((await sendRow(ids[1]))?.status).toBe('accepted');
    expect(await suppressed(emails[1])).toBeNull();
  });

  it('suppresses complaints and Mailgun unsubscribes', async () => {
    const { ids, emails } = await campaignWithSends(2);
    await hook(ev('complained', ids[0]));
    await hook(ev('unsubscribed', ids[1]));
    expect((await sendRow(ids[0]))?.status).toBe('complained');
    expect((await suppressed(emails[0]))?.reason).toBe('complained');
    expect((await suppressed(emails[1]))?.reason).toBe('unsubscribed');
  });

  it('accepts and ignores events for unknown sends (test emails)', async () => {
    const missing = await hook(ev('delivered', undefined));
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ ignored: 'unknown send' });
    const unknown = await hook(ev('delivered', 99999999));
    expect(await unknown.json()).toEqual({ ignored: 'unknown send' });
  });
});

describe('stats and status', () => {
  it('summarises a campaign', async () => {
    const { campaignId, ids } = await campaignWithSends(4);
    await hook(ev('delivered', ids[0]));
    await hook(ev('opened', ids[0]));
    await hook(ev('delivered', ids[1]));
    await hook(ev('failed', ids[2], { severity: 'permanent', 'delivery-status': { message: 'Mailbox full' } }));
    await hook(ev('complained', ids[3]));
    const stats = (await (await api(`/api/campaigns/${campaignId}/stats`)).json()) as CampaignStats;
    expect(stats).toMatchObject({ sent: 4, delivered: 3, opened: 1, bounced: 1, complained: 1, unsubscribed: 0 });
    expect(stats.problems.map((p) => p.status).sort()).toEqual(['complained', 'failed']);
  });

  it('reports Mailgun verification and the next scheduled email', async () => {
    vi.stubGlobal('fetch', mockFetch(() => Response.json({ domain: { state: 'unverified' }, sending_dns_records: [] })).fn);
    await env.DB.prepare("INSERT INTO campaigns (subject, created_by, created_at, updated_at, status, scheduled_at) VALUES ('Soon', 'x', ?, ?, 'scheduled', '2030-01-01T09:00:00.000Z')")
      .bind(NOW, NOW)
      .run();
    const status = (await (await api('/api/status')).json()) as StatusDto;
    expect(status.mailgunVerified).toBe(false);
    expect(status.nextScheduled).toMatchObject({ subject: 'Soon', scheduledAt: '2030-01-01T09:00:00.000Z' });
    expect(status.lastSent).not.toBeNull();
  });
});
