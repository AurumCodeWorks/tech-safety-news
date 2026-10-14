import type { CardDto } from '../../shared/api-types';
import type { Card } from '../../shared/blocks';

type Row = { id: number; type: CardDto['type']; title: string; data: string; last_used_at: string | null; updated_at: string };
const toDto = (r: Row): CardDto => ({ id: r.id, type: r.type, title: r.title, data: JSON.parse(r.data), lastUsedAt: r.last_used_at, updatedAt: r.updated_at });

export async function searchCards(db: D1Database, q: string): Promise<CardDto[]> {
  const { results } = await db
    .prepare('SELECT * FROM cards WHERE title LIKE ? ORDER BY COALESCE(last_used_at, updated_at) DESC')
    .bind(`%${q.trim()}%`)
    .all<Row>();
  return results.map(toDto);
}

export async function createCard(db: D1Database, card: Card, now: string): Promise<CardDto> {
  const row = await db
    .prepare('INSERT INTO cards (type, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING *')
    .bind(card.type, card.title, JSON.stringify(card.data), now, now)
    .first<Row>();
  return toDto(row!);
}

export async function markCardUsed(db: D1Database, id: number, now: string): Promise<void> {
  await db.prepare('UPDATE cards SET last_used_at = ? WHERE id = ?').bind(now, id).run();
}

export async function deleteCard(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM cards WHERE id = ?').bind(id).run();
}
