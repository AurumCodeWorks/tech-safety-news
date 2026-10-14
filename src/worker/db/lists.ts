// Set-based list/contact writes: each operation is a fixed number of queries regardless of list
// size (json_each), so imports stay inside D1's per-invocation query limits.
import type { ContactRow } from '../csv';

export type ListSummary = { id: number; name: string; description: string; memberCount: number; updatedAt: string };
export type ListMember = { email: string; name: string; suppressed: boolean };
export type ImportDiff = { added: string[]; removed: string[]; unchanged: number; suppressed: string[] };

export class ListNameTakenError extends Error {
  constructor() {
    super('A list with that name already exists');
  }
}

export async function listLists(db: D1Database): Promise<ListSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT l.id, l.name, l.description, l.updated_at AS updatedAt,
              (SELECT COUNT(*) FROM list_members m WHERE m.list_id = l.id) AS memberCount
       FROM lists l ORDER BY l.name`,
    )
    .all<ListSummary>();
  return results;
}

export async function getList(db: D1Database, id: number): Promise<{ id: number; name: string } | null> {
  return db.prepare('SELECT id, name FROM lists WHERE id = ?').bind(id).first();
}

export async function createList(db: D1Database, name: string, now: string): Promise<number> {
  const existing = await db.prepare('SELECT id FROM lists WHERE name = ?').bind(name.trim()).first();
  if (existing) throw new ListNameTakenError();
  const row = await db
    .prepare('INSERT INTO lists (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .bind(name.trim(), now, now)
    .first<{ id: number }>();
  return row!.id;
}

export async function deleteList(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM list_members WHERE list_id = ?').bind(id),
    db.prepare('DELETE FROM campaign_lists WHERE list_id = ?').bind(id),
    db.prepare('DELETE FROM lists WHERE id = ?').bind(id),
  ]);
}

export async function listMembers(db: D1Database, listId: number, q = ''): Promise<ListMember[]> {
  const like = `%${q.trim()}%`;
  const { results } = await db
    .prepare(
      `SELECT c.email, c.name, (s.email IS NOT NULL) AS suppressed
       FROM list_members m JOIN contacts c ON c.id = m.contact_id
       LEFT JOIN suppressions s ON s.email = c.email
       WHERE m.list_id = ? AND (c.email LIKE ? OR c.name LIKE ?)
       ORDER BY c.name, c.email`,
    )
    .bind(listId, like, like)
    .all<{ email: string; name: string; suppressed: number }>();
  return results.map((r) => ({ email: r.email, name: r.name, suppressed: Boolean(r.suppressed) }));
}

export async function diffList(db: D1Database, listId: number | null, rows: ContactRow[]): Promise<ImportDiff> {
  const incoming = new Set(rows.map((r) => r.email));
  const current = new Set<string>();
  if (listId !== null) {
    const { results } = await db
      .prepare('SELECT lower(c.email) AS email FROM list_members m JOIN contacts c ON c.id = m.contact_id WHERE m.list_id = ?')
      .bind(listId)
      .all<{ email: string }>();
    for (const r of results) current.add(r.email);
  }
  const { results: supp } = await db
    .prepare('SELECT lower(s.email) AS email FROM suppressions s JOIN json_each(?) j ON lower(j.value) = lower(s.email)')
    .bind(JSON.stringify([...incoming]))
    .all<{ email: string }>();
  return {
    added: [...incoming].filter((e) => !current.has(e)),
    removed: [...current].filter((e) => !incoming.has(e)),
    unchanged: [...incoming].filter((e) => current.has(e)).length,
    suppressed: supp.map((s) => s.email),
  };
}

export async function applyImport(db: D1Database, listId: number, rows: ContactRow[], removeMissing: boolean, now: string): Promise<void> {
  const json = JSON.stringify(rows);
  const emails = JSON.stringify(rows.map((r) => r.email));
  const stmts = [
    db
      .prepare(
        `INSERT INTO contacts (email, name, created_at, updated_at)
         SELECT json_extract(value, '$.email'), json_extract(value, '$.name'), ?1, ?1 FROM json_each(?2) WHERE true
         ON CONFLICT(email) DO UPDATE SET
           name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE contacts.name END,
           updated_at = excluded.updated_at`,
      )
      .bind(now, json),
    db
      .prepare(
        `INSERT OR IGNORE INTO list_members (list_id, contact_id, added_at)
         SELECT ?1, c.id, ?2 FROM contacts c JOIN json_each(?3) j ON c.email = j.value`,
      )
      .bind(listId, now, emails),
  ];
  if (removeMissing) {
    stmts.push(
      db
        .prepare(
          `DELETE FROM list_members WHERE list_id = ?1 AND contact_id NOT IN (
             SELECT c.id FROM contacts c JOIN json_each(?2) j ON c.email = j.value)`,
        )
        .bind(listId, emails),
    );
  }
  stmts.push(db.prepare('UPDATE lists SET updated_at = ? WHERE id = ?').bind(now, listId));
  await db.batch(stmts);
}
