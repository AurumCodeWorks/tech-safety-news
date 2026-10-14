import type { CampaignDto, CampaignStatus, CampaignSummary } from '../../shared/api-types';
import type { Block } from '../../shared/blocks';

type Row = {
  id: number;
  subject: string;
  preheader: string;
  blocks: string;
  status: CampaignStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  test_sent_at: string | null;
  hide_from_archive: number;
  slug: string | null;
  updated_at: string;
  last_error: string | null;
  list_ids: string | null;
};

const SELECT = `SELECT c.*, (SELECT json_group_array(list_id) FROM campaign_lists WHERE campaign_id = c.id) AS list_ids FROM campaigns c`;

function toDto(r: Row): CampaignDto {
  return {
    id: r.id,
    subject: r.subject,
    preheader: r.preheader,
    blocks: JSON.parse(r.blocks) as Block[],
    status: r.status,
    listIds: (JSON.parse(r.list_ids ?? '[]') as number[]).sort((a, b) => a - b),
    scheduledAt: r.scheduled_at,
    sentAt: r.sent_at,
    testSentAt: r.test_sent_at,
    hideFromArchive: Boolean(r.hide_from_archive),
    slug: r.slug,
    updatedAt: r.updated_at,
    lastError: r.last_error,
  };
}

export async function listCampaigns(db: D1Database): Promise<CampaignSummary[]> {
  const { results } = await db.prepare(`${SELECT} ORDER BY c.id DESC`).all<Row>();
  return results.map((r) => {
    const { blocks: _blocks, ...rest } = toDto(r);
    return rest;
  });
}

export async function getCampaign(db: D1Database, id: number): Promise<CampaignDto | null> {
  const row = await db.prepare(`${SELECT} WHERE c.id = ?`).bind(id).first<Row>();
  return row ? toDto(row) : null;
}

export async function createCampaign(
  db: D1Database,
  opts: { subject: string; preheader?: string; blocks?: Block[]; listIds?: number[]; createdBy: string; now: string },
): Promise<CampaignDto> {
  const row = await db
    .prepare(
      `INSERT INTO campaigns (subject, preheader, blocks, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(opts.subject, opts.preheader ?? '', JSON.stringify(opts.blocks ?? []), opts.createdBy, opts.now, opts.now)
    .first<{ id: number }>();
  if (opts.listIds?.length) await setCampaignLists(db, row!.id, opts.listIds);
  return (await getCampaign(db, row!.id))!;
}

export async function setCampaignLists(db: D1Database, id: number, listIds: number[]): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM campaign_lists WHERE campaign_id = ?').bind(id),
    db
      .prepare('INSERT OR IGNORE INTO campaign_lists (campaign_id, list_id) SELECT ?1, l.id FROM lists l JOIN json_each(?2) j ON l.id = j.value')
      .bind(id, JSON.stringify(listIds)),
  ]);
}

export const LOCKED_MESSAGES: Partial<Record<CampaignStatus, string>> = {
  sending: 'This email is sending',
  sent: 'This email has already been sent',
};

/** Saves editor content. Editing a scheduled email turns it back into a draft (it needs a fresh test). */
export async function saveCampaignContent(
  db: D1Database,
  id: number,
  patch: { subject: string; preheader: string; blocks: unknown[]; listIds: number[]; hideFromArchive: boolean },
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE campaigns SET subject = ?, preheader = ?, blocks = ?, hide_from_archive = ?, updated_at = ?,
         status = CASE WHEN status = 'scheduled' THEN 'draft' ELSE status END,
         scheduled_at = CASE WHEN status = 'scheduled' THEN NULL ELSE scheduled_at END
       WHERE id = ?`,
    )
    .bind(patch.subject, patch.preheader, JSON.stringify(patch.blocks), patch.hideFromArchive ? 1 : 0, now, id)
    .run();
  await setCampaignLists(db, id, patch.listIds);
}

export async function setScheduled(db: D1Database, id: number, scheduledAt: string | null): Promise<void> {
  await db
    .prepare(`UPDATE campaigns SET status = ?, scheduled_at = ? WHERE id = ? AND status IN ('draft', 'scheduled', 'failed')`)
    .bind(scheduledAt ? 'scheduled' : 'draft', scheduledAt, id)
    .run();
}

export async function deleteCampaign(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare(`DELETE FROM campaigns WHERE id = ? AND status IN ('draft', 'failed')`).bind(id).run();
  return res.meta.changes > 0;
}

export async function markTestSent(db: D1Database, id: number, now: string): Promise<void> {
  await db.prepare('UPDATE campaigns SET test_sent_at = ? WHERE id = ?').bind(now, id).run();
}
