import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { pub, uid } from './helpers';

const scam = { id: 's1', type: 'scam_alert', title: 'Fake bank calls', looksLike: 'A caller says…', warningSigns: ['Urgency'], whatToDo: 'Hang up.' };

async function campaign(opts: { status: string; hidden?: boolean; sentAt?: string; subject?: string }) {
  const slug = `2026-11-${uid()}`;
  await env.DB.prepare(
    `INSERT INTO campaigns (subject, blocks, status, sent_at, slug, hide_from_archive, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'x', 'x', 'x')`,
  )
    .bind(opts.subject ?? `Alert ${slug}`, JSON.stringify([scam]), opts.status, opts.sentAt ?? '2026-11-02T09:00:00.000Z', slug, opts.hidden ? 1 : 0)
    .run();
  return slug;
}

describe('archive index', () => {
  it('lists sent, visible emails newest first', async () => {
    const older = await campaign({ status: 'sent', sentAt: '2026-10-01T09:00:00.000Z', subject: `Older ${uid()}` });
    const newer = await campaign({ status: 'sent', sentAt: '2026-11-01T09:00:00.000Z', subject: `Newer ${uid()}` });
    const hidden = await campaign({ status: 'sent', hidden: true });
    const draft = await campaign({ status: 'draft' });
    const res = await pub('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.indexOf(`/archive/${newer}`)).toBeGreaterThan(-1);
    expect(html.indexOf(`/archive/${newer}`)).toBeLessThan(html.indexOf(`/archive/${older}`));
    expect(html).not.toContain(`/archive/${hidden}`);
    expect(html).not.toContain(`/archive/${draft}`);
    expect(html).toContain('Fake bank calls');
    expect(html).toContain('og:image');
    expect(res.headers.get('Content-Security-Policy')).toContain('frame-src https://registry.blockmarktech.com');
  });
});

describe('archive page', () => {
  it('renders the web version with the toggle, badge and no personal links', async () => {
    const slug = await campaign({ status: 'sent' });
    const res = await pub(`/archive/${slug}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Fake bank calls');
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).toContain('[data-theme="dark"]');
    expect(html).toContain('<iframe src="https://registry.blockmarktech.com/certificates/79f52d13-3d5b-4e58-b17a-7e40adecb563/widget/?tooltip_position=bottom_right&amp;theme=transparent&amp;non_padded=t&amp;hover=t"');
    expect(html).toContain('title="Cyber Essentials Plus certificate"');
    expect(html).toContain('property="og:image" content="https://news.enhancedgroup.co.uk/og-image.png"');
    expect(html).not.toContain('/u/');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it('404s hidden, unsent and unknown emails', async () => {
    expect((await pub(`/archive/${await campaign({ status: 'sent', hidden: true })}`)).status).toBe(404);
    expect((await pub(`/archive/${await campaign({ status: 'draft' })}`)).status).toBe(404);
    const missing = await pub('/archive/nope');
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain('We couldn’t find that alert');
  });
});
