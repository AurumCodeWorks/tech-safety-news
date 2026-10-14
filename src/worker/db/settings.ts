import type { Settings } from '../../shared/settings';

export type { Settings };

export const SETTING_KEYS = [
  'sender_name',
  'phone',
  'legal_name',
  'company_number',
  'registered_office',
  'ce_certificate_id',
] as const satisfies readonly (keyof Settings)[];

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, ''])) as Settings;
  for (const row of results) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) out[row.key as keyof Settings] = row.value;
  }
  return out;
}

export async function updateSettings(db: D1Database, patch: Partial<Settings>): Promise<Settings> {
  const entries = Object.entries(patch);
  for (const [key] of entries) {
    if (!(SETTING_KEYS as readonly string[]).includes(key)) throw new Error(`Unknown setting: ${key}`);
  }
  if (entries.length > 0) {
    const stmt = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    await db.batch(entries.map(([k, v]) => stmt.bind(k, String(v ?? '').trim())));
  }
  return getSettings(db);
}
