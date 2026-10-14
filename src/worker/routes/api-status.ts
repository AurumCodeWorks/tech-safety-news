import { Hono } from 'hono';
import type { CampaignStats, StatusDto } from '../../shared/api-types';
import { getSettings } from '../db/settings';
import type { AppEnv } from '../env';
import { createMailgun } from '../mailgun';

export async function campaignStats(db: D1Database, campaignId: number): Promise<CampaignStats> {
  const [totals, problems] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS sent,
                SUM(CASE WHEN status IN ('delivered', 'complained') THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS bounced,
                SUM(CASE WHEN status = 'complained' THEN 1 ELSE 0 END) AS complained,
                SUM(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 ELSE 0 END) AS unsubscribed
         FROM sends WHERE campaign_id = ?`,
      )
      .bind(campaignId),
    db.prepare("SELECT email, status, error FROM sends WHERE campaign_id = ? AND status IN ('failed', 'complained') ORDER BY email").bind(campaignId),
  ]);
  const t = (totals.results[0] ?? {}) as Record<string, number | null>;
  const n = (k: string) => Number(t[k] ?? 0);
  return {
    sent: n('sent'),
    delivered: n('delivered'),
    opened: n('opened'),
    bounced: n('bounced'),
    complained: n('complained'),
    unsubscribed: n('unsubscribed'),
    problems: problems.results as CampaignStats['problems'],
  };
}

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get('/:id/stats', async (c) => c.json(await campaignStats(c.env.DB, Number(c.req.param('id')))));

export const statusRoutes = new Hono<AppEnv>();

statusRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const settings = await getSettings(db);
  const [mailgunVerified, next, last] = await Promise.all([
    createMailgun(c.env, settings.sender_name).domainVerified(),
    db.prepare("SELECT id, subject, scheduled_at AS scheduledAt FROM campaigns WHERE status = 'scheduled' ORDER BY scheduled_at LIMIT 1").first<StatusDto['nextScheduled']>(),
    db.prepare("SELECT id, subject, sent_at AS sentAt FROM campaigns WHERE status = 'sent' ORDER BY sent_at DESC, id DESC LIMIT 1").first<{ id: number; subject: string; sentAt: string }>(),
  ]);
  const body: StatusDto = {
    mailgunVerified,
    nextScheduled: next ?? null,
    lastSent: last ? { ...last, stats: await campaignStats(db, last.id) } : null,
  };
  return c.json(body);
});
