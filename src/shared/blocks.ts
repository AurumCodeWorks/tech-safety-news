import { z } from 'zod';

const id = z.string().min(1);
const rich = (label: string) => z.string().trim().min(1, `Add ${label}`);

export const ScamAlertBlock = z.object({
  id,
  type: z.literal('scam_alert'),
  title: rich('a title'),
  looksLike: rich('what the scam looks like'),
  warningSigns: z.array(z.string().trim().min(1, 'Warning signs can’t be empty')).min(1, 'Add at least one warning sign').max(6, 'Use six warning signs or fewer'),
  whatToDo: rich('what to do'),
});
export const TipBlock = z.object({ id, type: z.literal('tip'), title: rich('a title'), body: rich('the tip') });
export const WarningBlock = z.object({ id, type: z.literal('warning'), title: rich('a title'), body: rich('the warning') });
export const TextBlock = z.object({ id, type: z.literal('text'), body: rich('some text') });
export const ImageBlock = z.object({
  id,
  type: z.literal('image'),
  r2Key: z.string().min(1, 'Upload an image'),
  alt: z.string().trim().min(1, 'Describe the image for people who can’t see it'),
  caption: z.string().optional(),
  /** Pixel size of the uploaded file, recorded by the uploader so the email can set width/height. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export const CallUsBlock = z.object({ id, type: z.literal('call_us'), text: z.string().trim().min(1).default('Not sure? Call us on {phone}') });
export const DividerBlock = z.object({ id, type: z.literal('divider') });

export const BlockSchema = z.discriminatedUnion('type', [
  ScamAlertBlock,
  TipBlock,
  WarningBlock,
  TextBlock,
  ImageBlock,
  CallUsBlock,
  DividerBlock,
]);
export type Block = z.infer<typeof BlockSchema>;
export type BlockType = Block['type'];

export const CampaignContentSchema = z.object({
  subject: z.string().trim().min(1, 'Add a subject').max(90, 'Keep the subject to 90 characters'),
  preheader: z.string().max(140, 'Keep the preview text to 140 characters').default(''),
  blocks: z.array(BlockSchema).min(1, 'Add at least one block'),
});
export type CampaignContent = z.infer<typeof CampaignContentSchema>;

/** Draft content: same shape, but nothing is required yet. */
export const DraftContentSchema = z.object({
  subject: z.string().max(90).default(''),
  preheader: z.string().max(140).default(''),
  blocks: z.array(z.looseObject({ id, type: z.string() })).default([]),
});

export const CARD_TYPES = ['scam_alert', 'tip', 'warning'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const CardSchema = z
  .object({
    type: z.enum(CARD_TYPES),
    title: z.string().trim().min(1).max(200),
    data: z.union([ScamAlertBlock, TipBlock, WarningBlock]),
  })
  .refine((c) => c.data.type === c.type, { message: 'Card data must match its type' });
export type Card = z.infer<typeof CardSchema>;
