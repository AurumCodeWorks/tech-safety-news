// Outlook-safe HTML builders for each content block. Everything is tables + inline styles;
// class names exist only so dark-mode CSS (styles.ts) can override colours.
import type { Block } from '../shared/blocks';
import { escapeHtml, richInlineHtml, richToHtml } from '../shared/richtext';
import { themes, type AlertTokens } from '../shared/tokens';
import { FONT } from './styles';

const L = themes.light;

export type Ctx = { baseUrl: string; phone: string };

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Light/dark image pair. The dark copy is hidden from Outlook desktop entirely. */
export function imgPair(opts: { light: string; dark: string; alt: string; width: number; height: number; inline?: boolean; style?: string }): string {
  const style = opts.style ?? '';
  const display = opts.inline ? 'inline-block' : 'block';
  return (
    `<img class="img-light" src="${opts.light}" alt="${escapeHtml(opts.alt)}" width="${opts.width}" height="${opts.height}" style="display:${display};border:0;${style}">` +
    `<!--[if !mso]><!--><img class="${opts.inline ? 'img-dark-inline' : 'img-dark'}" src="${opts.dark}" alt="${escapeHtml(opts.alt)}" width="${opts.width}" height="${opts.height}" style="display:none;max-height:0;overflow:hidden;mso-hide:all;border:0;${style}"><!--<![endif]-->`
  );
}

const icon = (ctx: Ctx, name: string, alt: string, size = 34) =>
  imgPair({ light: `${ctx.baseUrl}/icons/${name}-light-2x.png`, dark: `${ctx.baseUrl}/icons/${name}-dark-2x.png`, alt, width: size, height: size });

/** Rich text with inline styles added to every <p> and <a>. */
export function styledRich(src: string, color: string, cls: string, linkColor: string, linkCls: string, extra = ''): string {
  return richToHtml(src)
    .replace(/<p>/g, `<p class="${cls}" style="margin:0 0 12px 0;font-family:${FONT};font-size:18px;line-height:1.5;color:${color};${extra}">`)
    .replace(/<a href="([^"]+)">/g, `<a href="$1" class="${linkCls}" style="color:${linkColor};text-decoration:underline;">`);
}

function pill(text: string, a: AlertTokens, cls: string): string {
  return `<span class="${cls}-pill" style="display:inline-block;background-color:${a.pillBg};color:${a.pillText};font-family:${FONT};font-size:14px;font-weight:bold;line-height:1;padding:6px 12px;border-radius:6px;mso-padding-alt:0;">${text}</span>`;
}

function card(cls: string, a: AlertTokens, inner: string): string {
  return (
    `<tr><td style="padding:0 0 16px 0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${a.cardBg}" class="${cls}-card" style="background-color:${a.cardBg};border:1px solid ${a.border};border-radius:5px;">` +
    `<tr><td class="pad" style="padding:20px 22px;">${inner}</td></tr></table></td></tr>`
  );
}

function cardHeader(ctx: Ctx, iconName: string, label: string, a: AlertTokens, cls: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="34" valign="middle" style="width:34px;">${icon(ctx, iconName, label)}</td>` +
    `<td valign="middle" style="padding-left:12px;">${pill(label, a, cls)}</td></tr></table>`
  );
}

function cardTitle(title: string, a: AlertTokens, cls: string): string {
  return `<h2 class="${cls}-title h-title" style="margin:14px 0 8px 0;font-family:${FONT};font-size:23px;line-height:1.3;font-weight:bold;color:${a.title};">${richInlineHtml(title)}</h2>`;
}

function subhead(text: string, color: string, cls: string): string {
  return `<p class="${cls}" style="margin:4px 0 6px 0;font-family:${FONT};font-size:18px;line-height:1.4;font-weight:bold;color:${color};">${text}</p>`;
}

export function renderBlock(block: Block, ctx: Ctx): string {
  switch (block.type) {
    case 'scam_alert': {
      const a = L.alert.scam;
      const signs = block.warningSigns
        .map((s) => `<li class="scam-body" style="margin:0 0 6px 0;font-family:${FONT};font-size:18px;line-height:1.5;color:${a.body};">${richInlineHtml(s)}</li>`)
        .join('');
      return card(
        'scam',
        a,
        cardHeader(ctx, 'shield-exclamation', 'Scam alert', a, 'scam') +
          cardTitle(block.title, a, 'scam') +
          styledRich(block.looksLike, a.body, 'scam-body', a.title, 'scam-link') +
          subhead('Warning signs', a.subhead!, 'scam-sub') +
          `<ul style="margin:0 0 12px 0;padding:0 0 0 24px;">${signs}</ul>` +
          subhead('What to do', a.strong!, 'scam-strong') +
          styledRich(block.whatToDo, a.body, 'scam-body', a.title, 'scam-link'),
      );
    }
    case 'tip': {
      const a = L.alert.tip;
      return card('tip', a, cardHeader(ctx, 'bulb', 'Tip of the month', a, 'tip') + cardTitle(block.title, a, 'tip') + styledRich(block.body, a.body, 'tip-body', a.title, 'tip-link'));
    }
    case 'warning': {
      const a = L.alert.warning;
      return card('warning', a, cardHeader(ctx, 'alert-triangle', 'Watch out', a, 'warning') + cardTitle(block.title, a, 'warning') + styledRich(block.body, a.body, 'warning-body', a.title, 'warning-link'));
    }
    case 'text':
      return `<tr><td class="pad" style="padding:4px 4px 12px 4px;">${styledRich(block.body, L.textBody, 't-body', L.accent, 't-link')}</td></tr>`;
    case 'image': {
      const src = `${ctx.baseUrl}/media/${block.r2Key.split('/').map(encodeURIComponent).join('/')}`;
      const height = block.width && block.height ? Math.round((600 * block.height) / block.width) : 400;
      const caption = block.caption
        ? `<p class="t-muted" style="margin:8px 0 0 0;font-family:${FONT};font-size:16px;line-height:1.4;color:${L.textMuted};">${escapeHtml(block.caption)}</p>`
        : '';
      return `<tr><td style="padding:0 0 16px 0;"><img src="${src}" alt="${escapeHtml(block.alt)}" width="600" height="${height}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:5px;">${caption}</td></tr>`;
    }
    case 'call_us': {
      const text = escapeHtml(block.text.replace('{phone}', ctx.phone));
      return (
        `<tr><td style="padding:0 0 16px 0;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.key}" class="key-bar" style="background-color:${L.key};border-radius:5px;">` +
        `<tr><td class="pad" style="padding:16px 22px;">` +
        `<a href="${telHref(ctx.phone)}" class="on-key" style="color:${L.onKey};text-decoration:none;font-family:${FONT};font-size:20px;line-height:1.4;font-weight:bold;">` +
        imgPair({ light: `${ctx.baseUrl}/icons/phone-light-2x.png`, dark: `${ctx.baseUrl}/icons/phone-dark-2x.png`, alt: 'Phone', width: 26, height: 26, inline: true, style: 'vertical-align:middle;margin-right:10px;' }) +
        `<span class="on-key" style="color:${L.onKey};vertical-align:middle;">${text}</span></a></td></tr></table></td></tr>`
      );
    }
    case 'divider':
      return `<tr><td style="padding:8px 0 24px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="divider" style="border-top:1px solid ${L.border};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`;
  }
}
