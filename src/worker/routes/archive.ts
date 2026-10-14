import { Hono } from 'hono';
import { CampaignContentSchema, type Block } from '../../shared/blocks';
import { escapeHtml } from '../../shared/richtext';
import { formatLondonDate } from '../../shared/time';
import { renderCampaign } from '../../email/render';
import { getSettings, type Settings } from '../db/settings';
import type { AppEnv } from '../env';
import { simplePage } from '../pages/simple-page';

const CSP =
  "default-src 'self'; img-src 'self' https://registry.blockmarktech.com data:; frame-src https://registry.blockmarktech.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'";

// Tabler (MIT) sun / moon outlines for the theme toggle.
const SUN = '<path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>';
const MOON = '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008"/>';
const svg = (paths: string, cls: string) =>
  `<svg class="${cls}" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px;margin-right:6px">${paths}</svg>`;

const TOGGLE_BUTTON = `<button id="theme-toggle" class="toggle t-text" type="button" aria-label="Switch to dark mode" style="background:transparent;border:1px solid #D3D1C7;color:inherit;border-radius:999px;padding:8px 14px;font:16px Arial,Helvetica,sans-serif;cursor:pointer">${svg(MOON, 'i-moon')}${svg(SUN, 'i-sun')}<span>Dark mode</span></button>`;

const TOGGLE_SCRIPT = `<script>(function(){var r=document.documentElement,b=document.getElementById('theme-toggle');
try{var s=localStorage.getItem('tsn-theme');if(s==='light'||s==='dark')r.setAttribute('data-theme',s);}catch(e){}
function isDark(){var t=r.getAttribute('data-theme');return t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;}
function sync(){var d=isDark();b.setAttribute('aria-label',d?'Switch to light mode':'Switch to dark mode');b.querySelector('span').textContent=d?'Light mode':'Dark mode';b.querySelector('.i-sun').style.display=d?'inline':'none';b.querySelector('.i-moon').style.display=d?'none':'inline';}
b.addEventListener('click',function(){var n=isDark()?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('tsn-theme',n);}catch(e){}sync();});sync();})();</script>`;

function ogTags(base: string, title: string, description: string) {
  return [
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:image" content="${base}/og-image.png">`,
    `<meta property="og:type" content="article">`,
    `<meta name="description" content="${escapeHtml(description)}">`,
  ].join('');
}

function ceWidget(certId: string) {
  const id = encodeURIComponent(certId);
  return `<div class="ce-panel" style="max-width:600px;margin:0 auto 40px;padding:0 12px"><div style="display:inline-block;background:#FFFFFF;border-radius:12px;padding:8px"><iframe src="https://registry.blockmarktech.com/certificates/${id}/widget/?tooltip_position=bottom_right&amp;theme=transparent&amp;non_padded=t&amp;hover=t" style="border:none;height:187px;width:132px;" loading="lazy" title="Cyber Essentials Plus certificate"></iframe></div></div>`;
}

function notFound(settings: Settings) {
  return simplePage({
    title: 'Alert not found',
    settings,
    bodyHtml: '<h1>We couldn’t find that alert</h1><p>It may have been removed. <a href="/">See all alerts</a>.</p>',
  });
}

type Row = { subject: string; blocks: string; sent_at: string; slug: string };

const firstScamTitle = (blocks: Block[]) => blocks.find((b) => b.type === 'scam_alert')?.title ?? null;

export const archiveRoutes = new Hono<AppEnv>();

archiveRoutes.get('/', async (c) => {
  c.header('Content-Security-Policy', CSP);
  const settings = await getSettings(c.env.DB);
  const { results } = await c.env.DB.prepare(
    "SELECT subject, blocks, sent_at, slug FROM campaigns WHERE status = 'sent' AND hide_from_archive = 0 AND slug IS NOT NULL ORDER BY sent_at DESC, id DESC",
  ).all<Row>();
  const items = results.map((r) => {
    const scam = firstScamTitle(JSON.parse(r.blocks) as Block[]);
    return `<li style="padding:18px 0;border-bottom:1px solid var(--border)"><h2><a href="/archive/${escapeHtml(r.slug)}">${escapeHtml(r.subject)}</a></h2><p style="color:var(--muted);margin:0">${escapeHtml(formatLondonDate(r.sent_at))}${scam ? ` · Scam alert: ${escapeHtml(scam)}` : ''}</p></li>`;
  });
  const body = items.length
    ? `<h1>Scam alerts and tech tips</h1><p>Every issue of Tech Safety News from Enhanced Group, newest first.</p><ul style="list-style:none;margin:0;padding:0">${items.join('')}</ul>`
    : '<h1>Scam alerts and tech tips</h1><p>No alerts published yet.</p>';
  return c.html(
    simplePage({
      title: 'All alerts',
      settings,
      bodyHtml: body,
      headerExtra: TOGGLE_BUTTON,
      afterMain: `${ceWidget(settings.ce_certificate_id).replace('margin:0 auto 40px;padding:0 12px', 'margin:24px 0 0')}${TOGGLE_SCRIPT}`,
      head: ogTags(c.env.PUBLIC_BASE_URL, 'Tech Safety News', 'Scam alerts and tech tips from Enhanced Group.'),
    }),
  );
});

archiveRoutes.get('/archive/:slug', async (c) => {
  c.header('Content-Security-Policy', CSP);
  const settings = await getSettings(c.env.DB);
  const row = await c.env.DB.prepare("SELECT subject, preheader, blocks, sent_at, slug FROM campaigns WHERE slug = ? AND status = 'sent' AND hide_from_archive = 0")
    .bind(c.req.param('slug'))
    .first<Row & { preheader: string }>();
  if (!row) return c.html(notFound(settings), 404);
  const content = CampaignContentSchema.safeParse({ subject: row.subject, preheader: row.preheader, blocks: JSON.parse(row.blocks) });
  if (!content.success) return c.html(notFound(settings), 404);
  const { html } = await renderCampaign({ content: content.data, settings, baseUrl: c.env.PUBLIC_BASE_URL, issueDate: row.sent_at, mode: 'web' });
  const scam = firstScamTitle(content.data.blocks);
  const page = html
    .replace('</head>', `${ogTags(c.env.PUBLIC_BASE_URL, row.subject, scam ? `Scam alert: ${scam}` : 'Tech Safety News from Enhanced Group')}<link rel="icon" href="/favicon.svg" type="image/svg+xml"></head>`)
    .replace(/(<body[^>]*>)/, `$1<div style="max-width:600px;margin:12px auto 0;padding:0 12px;text-align:right"><a href="/" class="t-link" style="float:left;line-height:40px;color:#006E96;font:16px Arial,Helvetica,sans-serif">All alerts</a>${TOGGLE_BUTTON}</div>`)
    .replace('</body>', `${ceWidget(settings.ce_certificate_id)}${TOGGLE_SCRIPT}</body>`);
  return c.html(page);
});
