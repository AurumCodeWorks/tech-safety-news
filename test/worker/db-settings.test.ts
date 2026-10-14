import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getSettings, updateSettings } from '../../src/worker/db/settings';
import { nowMs } from '../../src/worker/clock';

const now = new Date().toISOString();

describe('settings', () => {
  it('seeds Enhanced Group settings', async () => {
    const s = await getSettings(env.DB);
    expect(s.sender_name).toBe('Enhanced Group Tech Safety');
    expect(s.company_number).toBe('13094854');
    expect(s.registered_office).toBe('Unit 43 Dixon Business Centre, Dixon Road, Bristol, BS4 5QW');
    expect(s.phone).toBe('0117 472 9200');
    expect(s.legal_name).toBe('Enhanced Technology Solutions Ltd');
    expect(s.ce_certificate_id).toBe('79f52d13-3d5b-4e58-b17a-7e40adecb563');
  });

  it('updates a setting and leaves the others alone', async () => {
    const s = await updateSettings(env.DB, { phone: '0117 000 0000' });
    expect(s.phone).toBe('0117 000 0000');
    expect(s.legal_name).toBe('Enhanced Technology Solutions Ltd');
  });

  it('rejects unknown keys', async () => {
    await expect(updateSettings(env.DB, { nope: 'x' } as never)).rejects.toThrow('Unknown setting: nope');
  });
});

describe('schema', () => {
  it('treats contact emails case-insensitively', async () => {
    const ins = "INSERT INTO contacts (email, name, created_at, updated_at) VALUES (?, 'A', ?, ?)";
    await env.DB.prepare(ins).bind('A@x.com', now, now).run();
    await expect(env.DB.prepare(ins).bind('a@X.com', now, now).run()).rejects.toThrow();
  });

  it('has every table from the spec', async () => {
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const t of ['lists', 'contacts', 'list_members', 'suppressions', 'cards', 'campaigns', 'campaign_lists', 'sends', 'settings', 'webhook_tokens']) {
      expect(names).toContain(t);
    }
  });
});

describe('clock', () => {
  it('uses TEST_NOW when present', () => {
    expect(nowMs({ TEST_NOW: '2026-11-02T08:00:00.000Z' } as never)).toBe(Date.parse('2026-11-02T08:00:00.000Z'));
  });
});
