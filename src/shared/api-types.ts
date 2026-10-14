// Request/response shapes shared by the Worker API and the React admin.
import type { Block } from './blocks';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export type CampaignDto = {
  id: number;
  subject: string;
  preheader: string;
  blocks: Block[];
  status: CampaignStatus;
  listIds: number[];
  scheduledAt: string | null;
  sentAt: string | null;
  testSentAt: string | null;
  hideFromArchive: boolean;
  slug: string | null;
  updatedAt: string;
  lastError: string | null;
};

export type CampaignSummary = Omit<CampaignDto, 'blocks'>;

export type CardDto = { id: number; type: 'scam_alert' | 'tip' | 'warning'; title: string; data: Block; lastUsedAt: string | null; updatedAt: string };

export type PreflightResult = { ok: true; recipients: number } | { ok: false; reasons: string[] };

export type CampaignStats = {
  sent: number;
  delivered: number;
  opened: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  problems: { email: string; status: string; error: string | null }[];
};

export type StatusDto = {
  /** 'unknown' when the Mailgun key is a sending-only key that can't read domain status. */
  mailgunDomain: 'verified' | 'unverified' | 'unknown';
  nextScheduled: { id: number; subject: string; scheduledAt: string } | null;
  lastSent: { id: number; subject: string; sentAt: string; stats: CampaignStats } | null;
};

export type RecipientCount = { count: number; duplicatesRemoved: number; suppressed: number };
