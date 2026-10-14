import type { PreflightResult } from '../shared/api-types';
import { BlockSchema, CampaignContentSchema, type CampaignContent } from '../shared/blocks';
import { mailgunVariables, renderCampaign } from '../email/render';
import { nowIso } from './clock';
import { getCampaign, markTestSent } from './db/campaigns';
import { insertPendingSends, markAccepted, pendingSends, sendTotals } from './db/sends';
import { getSettings } from './db/settings';
import type { Env } from './env';
import { createMailgun, MailgunError } from './mailgun';
import { resolveRecipients } from './recipients';
import { signUnsubToken } from './tokens';

export const REASONS = {
  mailgun: (domain: string) => `Mailgun hasn't verified ${domain} yet`,
  test: 'Send yourself a test after your latest changes',
  subject: 'Add a subject',
  blocks: 'Add at least one block',
  invalid: 'Fix the highlighted blocks',
  recipients: 'Pick at least one list with people on it',
} as const;

/** Content-only checks (no network): used by preflight and before a test send. */
export function contentProblems(c: { subject: string; blocks: unknown[] }): string[] {
  const out: string[] = [];
  if (!c.subject.trim()) out.push(REASONS.subject);
  if (c.blocks.length === 0) out.push(REASONS.blocks);
  else if (c.blocks.some((b) => !BlockSchema.safeParse(b).success)) out.push(REASONS.invalid);
  return out;
}

export async function preflight(env: Env, campaignId: number): Promise<PreflightResult> {
  const campaign = await getCampaign(env.DB, campaignId);
  if (!campaign) return { ok: false, reasons: ['Email not found'] };
  const settings = await getSettings(env.DB);
  const [verified, recipients] = await Promise.all([
    createMailgun(env, settings.sender_name).domainVerified(),
    resolveRecipients(env.DB, campaign.listIds),
  ]);
  const reasons: string[] = [];
  if (!verified) reasons.push(REASONS.mailgun(env.MAILGUN_DOMAIN));
  if (!campaign.testSentAt || campaign.testSentAt < campaign.updatedAt) reasons.push(REASONS.test);
  reasons.push(...contentProblems(campaign));
  if (recipients.recipients.length === 0) reasons.push(REASONS.recipients);
  return reasons.length ? { ok: false, reasons } : { ok: true, recipients: recipients.recipients.length };
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .slice(0, 60)
      .replace(/-+$/, '') || 'alert'
  );
}

async function ensureSlug(env: Env, campaignId: number, subject: string, now: string): Promise<string> {
  const existing = await env.DB.prepare('SELECT slug FROM campaigns WHERE id = ?').bind(campaignId).first<{ slug: string | null }>();
  if (existing?.slug) return existing.slug;
  const base = `${now.slice(0, 7)}-${slugify(subject)}`;
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const res = await env.DB.prepare('UPDATE campaigns SET slug = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM campaigns WHERE slug = ?)')
      .bind(slug, campaignId, slug)
      .run();
    if (res.meta.changes > 0) return slug;
  }
}

async function fail(env: Env, campaignId: number, message: string) {
  await env.DB.prepare("UPDATE campaigns SET status = 'failed', last_error = ? WHERE id = ?").bind(message, campaignId).run();
}

export type SendOutcome = { status: 'sent' | 'failed' | 'skipped'; accepted: number; pending: number };

/**
 * Sends a campaign to everyone still pending. Safe against overlapping runs: only the run that
 * flips the status to 'sending' proceeds. A Mailgun failure leaves the rest 'pending' for a retry.
 */
export async function runCampaignSend(env: Env, campaignId: number, sentBy: string, opts: { retryOnly?: boolean } = {}): Promise<SendOutcome> {
  const from = opts.retryOnly ? "('failed')" : "('draft', 'scheduled')";
  const claim = await env.DB.prepare(`UPDATE campaigns SET status = 'sending', last_error = NULL WHERE id = ? AND status IN ${from}`).bind(campaignId).run();
  if (claim.meta.changes === 0) return { status: 'skipped', ...(await sendTotals(env.DB, campaignId)) };

  const ready = await preflight(env, campaignId);
  const blocking = ready.ok ? [] : ready.reasons.filter((r) => !(opts.retryOnly && r === REASONS.recipients));
  if (blocking.length) {
    await fail(env, campaignId, blocking.join('; '));
    return { status: 'failed', ...(await sendTotals(env.DB, campaignId)) };
  }

  const campaign = (await getCampaign(env.DB, campaignId))!;
  const settings = await getSettings(env.DB);
  const now = nowIso(env);
  const base = env.PUBLIC_BASE_URL;
  const slug = await ensureSlug(env, campaignId, campaign.subject, now);
  if (!opts.retryOnly) {
    const { recipients } = await resolveRecipients(env.DB, campaign.listIds);
    await insertPendingSends(env.DB, campaignId, recipients, now);
  }

  const content = CampaignContentSchema.parse(campaign);
  const { html, text } = await renderCampaign({ content, settings, baseUrl: base, issueDate: now, mode: 'email', recipient: 'mailgun' });
  const mailgun = createMailgun(env, settings.sender_name);
  const batchSize = Math.max(1, Math.min(1000, Number(env.MAILGUN_BATCH_SIZE) || 1000));
  const pending = await pendingSends(env.DB, campaignId);

  for (let i = 0; i < pending.length; i += batchSize) {
    const chunk = pending.slice(i, i + batchSize);
    const recipientVariables: Record<string, Record<string, string>> = {};
    for (const p of chunk) {
      const token = await signUnsubToken(env.UNSUB_SECRET, { sendId: p.id });
      recipientVariables[p.email] = mailgunVariables({ name: p.name, sendId: p.id, unsubUrl: `${base}/u/${token}`, webUrl: `${base}/archive/${slug}` });
    }
    try {
      const { id } = await mailgun.sendBatch({
        to: chunk.map((p) => p.email),
        subject: content.subject,
        html,
        text,
        recipientVariables,
        headers: { 'List-Unsubscribe': '<%recipient.unsub_url%>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        variables: { send_id: '%recipient.send_id%' },
      });
      await markAccepted(env.DB, chunk.map((p) => p.id), id, nowIso(env));
    } catch (e) {
      await fail(env, campaignId, e instanceof MailgunError ? e.message : `Sending stopped: ${String(e).slice(0, 200)}`);
      return { status: 'failed', ...(await sendTotals(env.DB, campaignId)) };
    }
  }

  await env.DB.prepare("UPDATE campaigns SET status = 'sent', sent_at = ?, sent_by = ? WHERE id = ?").bind(now, sentBy, campaignId).run();
  return { status: 'sent', ...(await sendTotals(env.DB, campaignId)) };
}

export class NotReadyError extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join('; '));
  }
}

export async function sendTest(env: Env, campaignId: number, to: string): Promise<void> {
  const campaign = await getCampaign(env.DB, campaignId);
  if (!campaign) throw new NotReadyError(['Email not found']);
  const problems = contentProblems(campaign);
  if (problems.length) throw new NotReadyError(problems);
  const content: CampaignContent = CampaignContentSchema.parse(campaign);
  const settings = await getSettings(env.DB);
  const base = env.PUBLIC_BASE_URL;
  const token = await signUnsubToken(env.UNSUB_SECRET, { test: campaignId });
  const { html, text } = await renderCampaign({
    content,
    settings,
    baseUrl: base,
    issueDate: nowIso(env),
    mode: 'email',
    recipient: { name: 'Test', unsubUrl: `${base}/u/${token}`, webUrl: `${base}/` },
  });
  await createMailgun(env, settings.sender_name).sendBatch({ to: [to], subject: `[TEST] ${content.subject}`, html, text });
  await markTestSent(env.DB, campaignId, nowIso(env));
}
