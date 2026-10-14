// Restricted Markdown subset used by every rich-text field: **bold**, [text](https:… | tel:…),
// blank-line paragraphs and single line breaks. Everything else is escaped.

const TOKEN = /\[([^\]]+)\]\(([^()\s]*(?:\([^()\s]*\))?[^()\s]*)\)|\*\*(.+?)\*\*/g;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isSafeHref(url: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(url) || /^tel:[+0-9]+$/i.test(url);
}

function paragraphs(src: string): string[] {
  return src
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function inlineHtml(s: string): string {
  let out = '';
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    out += escapeHtml(s.slice(last, m.index));
    if (m[3] !== undefined) {
      out += `<strong>${inlineHtml(m[3])}</strong>`;
    } else {
      const label = inlineHtml(m[1]);
      out += isSafeHref(m[2]) ? `<a href="${escapeHtml(m[2])}">${label}</a>` : label;
    }
    last = m.index + m[0].length;
  }
  return out + escapeHtml(s.slice(last));
}

function inlineText(s: string): string {
  return s.replace(TOKEN, (_all, label: string | undefined, url: string | undefined, bold: string | undefined) => {
    if (bold !== undefined) return inlineText(bold);
    const text = inlineText(label ?? '');
    return url && isSafeHref(url) ? `${text} (${url})` : text;
  });
}

export function richToHtml(src: string): string {
  return paragraphs(src)
    .map((p) => `<p>${inlineHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Inline HTML without the wrapping <p> — for single-line fields such as titles and list items. */
export function richInlineHtml(src: string): string {
  return inlineHtml(src.trim()).replace(/\n/g, '<br>');
}

export function richToText(src: string): string {
  return paragraphs(src).map(inlineText).join('\n\n');
}
