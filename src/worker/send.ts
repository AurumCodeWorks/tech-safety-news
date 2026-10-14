import type { PreflightResult } from '../shared/api-types';
import { BlockSchema, CampaignContentSchema, type CampaignContent } from '../shared/blocks';
import { renderCampaign } from '../email/render';
import { nowIso } from './clock';
import { getCampaign, markTestSent } from './db/campaigns';
import { getSettings } from './db/settings';
import type { Env } from './env';
import { createMailgun } from './mailgun';
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
