import type { Recipient } from '../recipients';

export type PendingSend = { id: number; email: string; name: string };

export async function insertPendingSends(db: D1Database, campaignId: number, recipients: Recipient[], now: string): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO sends (campaign_id, contact_id, email, name, status, updated_at)
       SELECT ?1, json_extract(value, '$.contactId'), json_extract(value, '$.email'), json_extract(value, '$.name'), 'pending', ?2
       FROM json_each(?3)`,
    )
    .bind(campaignId, now, JSON.stringify(recipients))
    .run();
}

export async function pendingSends(db: D1Database, campaignId: number): Promise<PendingSend[]> {
  const { results } = await db
    .prepare("SELECT id, email, name FROM sends WHERE campaign_id = ? AND status = 'pending' ORDER BY id")
    .bind(campaignId)
    .all<PendingSend>();
  return results;
}

export async function markAccepted(db: D1Database, ids: number[], messageId: string, now: string): Promise<void> {
  await db
    .prepare(`UPDATE sends SET status = 'accepted', mailgun_message_id = ?1, updated_at = ?2 WHERE id IN (SELECT value FROM json_each(?3))`)
    .bind(messageId, now, JSON.stringify(ids))
    .run();
}

export async function sendTotals(db: D1Database, campaignId: number): Promise<{ accepted: number; pending: number }> {
  const row = await db
    .prepare(
      `SELECT SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status <> 'pending' THEN 1 ELSE 0 END) AS accepted
       FROM sends WHERE campaign_id = ?`,
    )
    .bind(campaignId)
    .first<{ pending: number | null; accepted: number | null }>();
  return { accepted: row?.accepted ?? 0, pending: row?.pending ?? 0 };
}
