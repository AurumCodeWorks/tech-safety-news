export type Recipient = { contactId: number; email: string; name: string };
export type RecipientResolution = { recipients: Recipient[]; duplicatesRemoved: number; suppressed: number };

/** Everyone on the chosen lists, once each, minus suppressed addresses. */
export async function resolveRecipients(db: D1Database, listIds: number[]): Promise<RecipientResolution> {
  if (listIds.length === 0) return { recipients: [], duplicatesRemoved: 0, suppressed: 0 };
  const ids = JSON.stringify(listIds);
  const [totals, rows] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS memberships, COUNT(DISTINCT m.contact_id) AS people,
                COUNT(DISTINCT CASE WHEN s.email IS NOT NULL THEN m.contact_id END) AS suppressed
         FROM list_members m JOIN contacts c ON c.id = m.contact_id
         LEFT JOIN suppressions s ON s.email = c.email
         WHERE m.list_id IN (SELECT value FROM json_each(?1))`,
      )
      .bind(ids),
    db
      .prepare(
        `SELECT DISTINCT c.id AS contactId, lower(c.email) AS email, c.name
         FROM list_members m JOIN contacts c ON c.id = m.contact_id
         WHERE m.list_id IN (SELECT value FROM json_each(?1))
           AND NOT EXISTS (SELECT 1 FROM suppressions s WHERE s.email = c.email)
         ORDER BY c.id`,
      )
      .bind(ids),
  ]);
  const t = (totals.results as { memberships: number; people: number; suppressed: number }[])[0];
  return {
    recipients: rows.results as Recipient[],
    duplicatesRemoved: t.memberships - t.people,
    suppressed: t.suppressed,
  };
}
