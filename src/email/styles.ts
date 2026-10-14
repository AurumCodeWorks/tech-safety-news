import { themes } from '../shared/tokens';

export const FONT = 'Arial, Helvetica, sans-serif';

type Rule = { sel: string; css: string };

const d = themes.dark;

/** Dark-mode overrides, keyed by the class names the components put on elements. */
const darkRules: Rule[] = [
  { sel: '.bg-page', css: `background-color:${d.pageBg} !important;` },
  { sel: '.bg-surface', css: `background-color:${d.surface} !important;` },
  { sel: '.t-text', css: `color:${d.text} !important;` },
  { sel: '.t-body', css: `color:${d.textBody} !important;` },
  { sel: '.t-muted', css: `color:${d.textMuted} !important;` },
  { sel: '.t-link', css: `color:${d.accent} !important;` },
  { sel: '.t-safe', css: `color:${d.success} !important;` },
  { sel: '.divider', css: `border-color:${d.border} !important;` },
  { sel: '.key-bar', css: `background-color:${d.key} !important;` },
  { sel: '.on-key', css: `color:${d.onKey} !important;` },
  { sel: '.ce-chip', css: 'background-color:#FFFFFF !important;' },
  ...(['scam', 'tip', 'warning'] as const).flatMap((k): Rule[] => {
    const a = d.alert[k];
    return [
      { sel: `.${k}-card`, css: `background-color:${a.cardBg} !important;border-color:${a.border} !important;` },
      { sel: `.${k}-pill`, css: `background-color:${a.pillBg} !important;color:${a.pillText} !important;` },
      { sel: `.${k}-title`, css: `color:${a.title} !important;` },
      { sel: `.${k}-body`, css: `color:${a.body} !important;` },
      { sel: `.${k}-link`, css: `color:${a.title} !important;` },
      ...(a.subhead ? [{ sel: `.${k}-sub`, css: `color:${a.subhead} !important;` }] : []),
      ...(a.strong ? [{ sel: `.${k}-strong`, css: `color:${a.strong} !important;` }] : []),
    ];
  }),
];

const swapRules: Rule[] = [
  { sel: '.img-light', css: 'display:none !important;' },
  { sel: '.img-dark', css: 'display:block !important;max-height:none !important;overflow:visible !important;' },
  { sel: '.img-dark-inline', css: 'display:inline-block !important;max-height:none !important;overflow:visible !important;' },
];

function block(prefix: string, rules: Rule[]): string {
  return rules.map((r) => `${prefix}${r.sel}{${r.css}}`).join('');
}

const base = `
body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a{text-decoration:underline;}
@media only screen and (max-width:620px){
.container{width:100% !important;}
.pad{padding-left:16px !important;padding-right:16px !important;}
.h-title{font-size:21px !important;}
}`;

/**
 * mode 'email': prefers-color-scheme for Apple Mail/iOS, plus [data-ogsc]/[data-ogsb] for Outlook.com.
 * mode 'web':   same rules gated so the archive's light/dark toggle (data-theme on <html>) wins.
 */
export function documentCss(mode: 'email' | 'web'): string {
  const all = [...darkRules, ...swapRules];
  if (mode === 'email') {
    const ogsc = darkRules.filter((r) => r.css.startsWith('color')).map((r) => ({ sel: r.sel, css: r.css }));
    const ogsb = darkRules.filter((r) => r.css.startsWith('background')).map((r) => ({ sel: r.sel, css: r.css }));
    return `${base}
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (prefers-color-scheme: dark){${block('', all)}}
${block('[data-ogsc] ', ogsc)}${block('[data-ogsb] ', ogsb)}`;
  }
  return `${base}
:root{color-scheme:light dark;}
:root[data-theme="light"]{color-scheme:light;}
:root[data-theme="dark"]{color-scheme:dark;}
@media (prefers-color-scheme: dark){${block(':root:not([data-theme="light"]) ', all)}}
${block('[data-theme="dark"] ', all)}`;
}
