// Branded HTML shell for public pages (unsubscribe, archive index, errors).
// Large type, light/dark following the device, with an optional data-theme override.
import { escapeHtml } from '../../shared/richtext';
import { themes, type ThemeTokens } from '../../shared/tokens';
import type { Settings } from '../db/settings';
import { legalLine } from '../../email/copy';

function vars(t: ThemeTokens): string {
  return `--bg:${t.pageBg};--surface:${t.surface};--text:${t.text};--body:${t.textBody};--muted:${t.textMuted};--border:${t.border};--key:${t.key};--on-key:${t.onKey};--accent:${t.accent};--focus:${t.focus};`;
}

const CSS = `
:root{${vars(themes.light)}color-scheme:light dark;}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars(themes.dark)}}:root:not([data-theme="light"]) .logo-light{display:none}:root:not([data-theme="light"]) .logo-dark{display:block}}
:root[data-theme="dark"]{${vars(themes.dark)}color-scheme:dark;}
:root[data-theme="dark"] .logo-light{display:none}:root[data-theme="dark"] .logo-dark{display:block}
:root[data-theme="light"]{color-scheme:light;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--body);font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.55}
.wrap{max-width:680px;margin:0 auto;padding:24px 16px 48px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}
.logo-dark{display:none}
.rule{display:flex;height:4px;margin:0 0 28px}.rule span{flex:1}
main{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:28px 24px}
h1{color:var(--text);font-size:30px;line-height:1.25;margin:0 0 16px}
h2{color:var(--text);font-size:24px;margin:0 0 8px}
p{margin:0 0 16px}
a{color:var(--accent)}
.button{display:inline-block;background:var(--key);color:var(--on-key);border:0;border-radius:6px;padding:16px 28px;font:bold 20px Arial,Helvetica,sans-serif;cursor:pointer;text-decoration:none}
.button:focus-visible,a:focus-visible,button:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.toggle{background:transparent;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:8px 14px;font:16px Arial,Helvetica,sans-serif;cursor:pointer}
footer{color:var(--muted);font-size:16px;margin-top:28px}
`;

export function simplePage(opts: { title: string; bodyHtml: string; settings: Settings; head?: string; afterMain?: string; headerExtra?: string }): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(opts.title)} · Tech Safety News</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>${CSS}</style>
${opts.head ?? ''}
</head>
<body>
<div class="wrap">
<header>
<a href="/" aria-label="Tech Safety News home">
<img class="logo-light" src="/brand/logo-lockup-light.svg" alt="Enhanced Group Tech Safety News" width="260" height="52">
<img class="logo-dark" src="/brand/logo-lockup-dark.svg" alt="Enhanced Group Tech Safety News" width="260" height="52">
</a>
${opts.headerExtra ?? ''}
</header>
<div class="rule" aria-hidden="true"><span style="background:#00AEEF"></span><span style="background:#EC008C"></span><span style="background:#FFF200"></span></div>
<main>${opts.bodyHtml}</main>
${opts.afterMain ?? ''}
<footer><p>${escapeHtml(legalLine(opts.settings))}</p></footer>
</div>
</body>
</html>`;
}
