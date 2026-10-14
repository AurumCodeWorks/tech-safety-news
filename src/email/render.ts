import type { CampaignContent } from '../shared/blocks';
import { escapeHtml } from '../shared/richtext';
import { formatLondonDate } from '../shared/time';
import { ink, themes } from '../shared/tokens';
import type { Settings } from '../shared/settings';
import { imgPair, renderBlock, type Ctx } from './components';
import { legalLine, NEVER_ASK, oneWayNotice } from './copy';
import { blocksToText } from './plaintext';
import { documentCss, FONT } from './styles';

const L = themes.light;

export type Recipient = { name: string; unsubUrl: string; webUrl: string };

export type RenderInput = {
  content: CampaignContent;
  settings: Settings;
  baseUrl: string;
  issueDate: string;
  mode: 'email' | 'web';
  /** A real person, Mailgun batch placeholders, or nothing (archive / preview). */
  recipient?: Recipient | 'mailgun';
};

export const greetingFor = (name: string) => (name.trim() ? `Hello ${name.trim()},` : 'Hello,');

/** Mailgun recipient-variables for one person; must match the placeholders used below. */
export function mailgunVariables(r: Recipient & { sendId: number }): Record<string, string> {
  const greeting = greetingFor(r.name);
  return {
    greeting,
    greeting_html: escapeHtml(greeting),
    unsub_url: r.unsubUrl,
    web_url: r.webUrl,
    send_id: String(r.sendId),
  };
}

function header(ctx: Ctx, issueDate: string): string {
  const logo = imgPair({
    light: `${ctx.baseUrl}/brand/email-logo-light-2x.png`,
    dark: `${ctx.baseUrl}/brand/email-logo-dark-2x.png`,
    alt: 'Enhanced Group Tech Safety News',
    width: 260,
    height: 52,
  });
  const rule = [ink.cyan, ink.magenta, ink.yellow]
    .map((c) => `<td width="33%" height="4" bgcolor="${c}" style="background-color:${c};height:4px;font-size:0;line-height:0;">&nbsp;</td>`)
    .join('');
  return (
    `<tr><td class="bg-surface pad" bgcolor="${L.surface}" style="background-color:${L.surface};padding:20px 24px 16px 24px;border-radius:5px 5px 0 0;">${logo}` +
    `<p class="t-muted" style="margin:12px 0 0 0;font-family:${FONT};font-size:15px;line-height:1.4;color:${L.textMuted};">${escapeHtml(formatLondonDate(issueDate))}</p></td></tr>` +
    `<tr><td style="padding:0 0 20px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${rule}</tr></table></td></tr>`
  );
}

function ceBadge(certId: string): string {
  const id = encodeURIComponent(certId);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td class="ce-chip" style="padding:6px;border-radius:4px;">` +
    `<a href="https://registry.blockmarktech.com/certificates/${id}/active/?source=email"><img alt="Cyber Essentials Plus logo" src="https://registry.blockmarktech.com/certificates/${id}/email-image/?width=83&height=100&non_padded=t" width="83" height="100" style="display:block;border:0;"/></a>` +
    `</td></tr></table>`
  );
}

function footer(ctx: Ctx, settings: Settings, mode: RenderInput['mode'], links: { webUrl: string; unsubUrl: string } | null): string {
  const p = (cls: string, color: string, html: string, extra = '') =>
    `<p class="${cls}" style="margin:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${color};${extra}">${html}</p>`;
  const safe =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;"><tr>` +
    `<td width="22" valign="top" style="width:22px;padding-top:1px;">${imgPair({ light: `${ctx.baseUrl}/icons/shield-check-light-2x.png`, dark: `${ctx.baseUrl}/icons/shield-check-dark-2x.png`, alt: 'Shield', width: 22, height: 22 })}</td>` +
    `<td valign="top" style="padding-left:8px;">${p('t-safe', L.success, escapeHtml(NEVER_ASK), 'font-size:16px;font-weight:bold;margin:0;')}</td></tr></table>`;
  const linkHtml = links
    ? p(
        't-muted',
        L.textMuted,
        `<a href="${escapeHtml(links.webUrl)}" class="t-link" style="color:${L.accent};">View in browser</a> &nbsp;·&nbsp; <a href="${escapeHtml(links.unsubUrl)}" class="t-link" style="color:${L.accent};">Unsubscribe</a>`,
      )
    : '';
  return (
    `<tr><td class="pad" style="padding:20px 4px 8px 4px;border-top:1px solid ${L.border};" >` +
    safe +
    p('t-muted', L.textMuted, escapeHtml(oneWayNotice(settings.phone))) +
    p('t-muted', L.textMuted, escapeHtml(legalLine(settings))) +
    linkHtml +
    (mode === 'email' ? ceBadge(settings.ce_certificate_id) : '') +
    `</td></tr>`
  );
}

export async function renderCampaign(input: RenderInput): Promise<{ html: string; text: string }> {
  const { content, settings, mode } = input;
  const ctx: Ctx = { baseUrl: input.baseUrl.replace(/\/$/, ''), phone: settings.phone };

  let greetingHtml: string;
  let greetingText: string;
  let links: { webUrl: string; unsubUrl: string } | null = null;
  if (input.recipient === 'mailgun') {
    greetingHtml = '%recipient.greeting_html%';
    greetingText = '%recipient.greeting%';
    links = { webUrl: '%recipient.web_url%', unsubUrl: '%recipient.unsub_url%' };
  } else if (input.recipient) {
    greetingText = greetingFor(input.recipient.name);
    greetingHtml = escapeHtml(greetingText);
    links = { webUrl: input.recipient.webUrl, unsubUrl: input.recipient.unsubUrl };
  } else {
    greetingText = 'Hello,';
    greetingHtml = 'Hello,';
  }

  const preheader = content.preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(content.preheader)}${'&#8199;&#65279;&#847; '.repeat(40)}</div>`
    : '';

  const greeting = `<tr><td class="pad" style="padding:0 4px 8px 4px;"><p class="t-text" style="margin:0 0 12px 0;font-family:${FONT};font-size:18px;line-height:1.5;color:${L.text};">${greetingHtml}</p></td></tr>`;

  const html =
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">` +
    `<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">` +
    `<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no">` +
    `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">` +
    `<title>${escapeHtml(content.subject)}</title>` +
    `<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>td,p,h2,li,a,span{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->` +
    `<style>${documentCss(mode)}</style></head>` +
    `<body class="bg-page" style="margin:0;padding:0;background-color:${L.pageBg};">${preheader}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.pageBg}" class="bg-page" style="background-color:${L.pageBg};"><tr><td align="center" style="padding:24px 12px;">` +
    `<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->` +
    `<table role="presentation" class="container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">` +
    header(ctx, input.issueDate) +
    greeting +
    content.blocks.map((b) => renderBlock(b, ctx)).join('') +
    footer(ctx, settings, mode, links) +
    `</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;

  const text = blocksToText({ content, settings, greeting: greetingText, links });
  return { html, text };
}
