export type SuppressionReason = 'unsubscribed' | 'bounced' | 'complained' | 'manual';
export type Suppression = { email: string; reason: SuppressionReason; createdAt: string; campaignId: number | null; note: string | null };

// Higher wins; a suppression is never downgraded (an unsubscribe stays an unsubscribe).
const RANK: Record<SuppressionReason, number> = { manual: 1, bounced: 2, unsubscribed: 3, complained: 4 };
const PERMANENT: SuppressionReason[] = ['unsubscribed', 'complained'];

export class PermanentSuppressionError extends Error {
  constructor() {
    super("Unsubscribes and complaints can't be removed");
  }
}

export async function addSuppression(db: D1Database, email: string, reason: SuppressionReason, now: string, campaignId?: number): Promise<void> {
  const existing = await db.prepare('SELECT reason FROM suppressions WHERE email = ?').bind(email).first<{ reason: SuppressionReason }>();
  if (existing && RANK[existing.reason] >= RANK[reason]) return;
  await db
    .prepare(
      `INSERT INTO suppressions (email, reason, campaign_id, created_at) VALUES (lower(?1), ?2, ?3, ?4)
       ON CONFLICT(email) DO UPDATE SET reason = excluded.reason, campaign_id = excluded.campaign_id, created_at = excluded.created_at`,
    )
    .bind(email, reason, campaignId ?? null, now)
    .run();
}

export async function removeSuppression(db: D1Database, email: string, note: string): Promise<void> {
  const existing = await db.prepare('SELECT reason FROM suppressions WHERE email = ?').bind(email).first<{ reason: SuppressionReason }>();
  if (!existing) return;
  if (PERMANENT.includes(existing.reason)) throw new PermanentSuppressionError();
  // The row is deleted, so the reason goes to the Worker logs (observability is enabled).
  console.log(JSON.stringify({ event: 'suppression_removed', email, previousReason: existing.reason, note }));
  await db.prepare('DELETE FROM suppressions WHERE email = ?').bind(email).run();
}

export async function listSuppressions(db: D1Database): Promise<Suppression[]> {
  const { results } = await db
    .prepare('SELECT email, reason, created_at AS createdAt, campaign_id AS campaignId, note FROM suppressions ORDER BY created_at DESC')
    .all<Suppression>();
  return results;
}
