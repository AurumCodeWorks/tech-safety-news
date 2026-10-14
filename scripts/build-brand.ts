// Generates every brand asset from code: the logo mark geometry lives here (single source),
// wordmark text is converted to outlines with Inter, and PNG/ICO files are rasterised with resvg.
// Run: npm run brand
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import pngToIco from 'png-to-ico';
import { ink, logo, themes, type ThemeMode } from '../src/shared/tokens';

const ICONS = 'node_modules/@tabler/icons/icons/outline';
const FONTS = 'node_modules/@fontsource/inter/files';

mkdirSync('public/brand', { recursive: true });
mkdirSync('public/icons', { recursive: true });
mkdirSync('brand', { recursive: true });

function tablerPaths(name: string): string {
  const svg = readFileSync(`${ICONS}/${name}.svg`, 'utf8');
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => `<path d="${m[1]}"/>`).join('');
}

/** Tabler icon (24-unit grid) drawn as a stroked group centred at (cx, cy) with the given size. */
function iconGroup(name: string, cx: number, cy: number, size: number, stroke: string, cls = ''): string {
  const s = size / 24;
  return `<g${cls ? ` class="${cls}"` : ''} transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${s})" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${tablerPaths(name)}</g>`;
}

/** The approved mark: rounded tile, shield-search icon, CMY strip on the bottom edge. viewBox 0 0 48 48. */
function markInner(mode: ThemeMode, idSuffix: string, withClasses = false): string {
  const c = logo[mode];
  const clip = `tile-${idSuffix}`;
  return (
    `<defs><clipPath id="${clip}"><rect x="2" y="2" width="44" height="44" rx="9"/></clipPath></defs>` +
    `<g clip-path="url(#${clip})">` +
    `<rect${withClasses ? ' class="tile"' : ''} x="2" y="2" width="44" height="44" fill="${c.tile}"/>` +
    `<rect x="2" y="38.5" width="14.67" height="7.5" fill="${ink.cyan}"/>` +
    `<rect x="16.66" y="38.5" width="14.67" height="7.5" fill="${ink.magenta}"/>` +
    `<rect x="31.33" y="38.5" width="14.67" height="7.5" fill="${ink.yellow}"/>` +
    `</g>` +
    iconGroup('shield-search', 24, 21.5, 26, c.icon, withClasses ? 'icon' : '')
  );
}

function markSvg(mode: ThemeMode): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">${markInner(mode, mode)}</svg>`;
}

function loadFont(path: string): opentype.Font {
  const b = readFileSync(path);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

// Glyph-by-glyph layout with kerning. Inter's ccmp lookups aren't supported by opentype.js's
// shaper, and plain Latin wordmark text needs no shaping.
function textPath(font: opentype.Font, text: string, x: number, y: number, size: number, fill: string): string {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  let d = '';
  let prev: opentype.Glyph | null = null;
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    if (prev) cursor += font.getKerningValue(prev, glyph) * scale;
    d += glyph.getPath(cursor, y, size).toPathData(2);
    cursor += (glyph.advanceWidth ?? 0) * scale;
    prev = glyph;
  }
  return `<path fill="${fill}" d="${d}"/>`;
}

const font500 = loadFont(`${FONTS}/inter-latin-500-normal.woff`);
const font400 = loadFont(`${FONTS}/inter-latin-400-normal.woff`);

/** Horizontal lockup, 260 x 52: mark + "Enhanced Group" over "Tech Safety News". */
function lockupInner(mode: ThemeMode, idSuffix: string): string {
  const t = themes[mode];
  return (
    `<g transform="translate(2 2)">${markInner(mode, idSuffix)}</g>` +
    textPath(font500, 'Enhanced Group', 62, 24, 19, t.wordmark) +
    textPath(font400, 'Tech Safety News', 62, 44, 15, t.wordmarkSub)
  );
}

function lockupSvg(mode: ThemeMode): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 52" width="260" height="52">${lockupInner(mode, `lockup-${mode}`)}</svg>`;
}

function png(svg: string, width: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)' }).render().asPng();
}

function write(path: string, data: string | Buffer) {
  writeFileSync(path, data);
  console.log(`wrote ${path}`);
}

// Master SVGs (for designers) and web logos
for (const mode of ['light', 'dark'] as const) {
  write(`brand/logo-mark-${mode}.svg`, markSvg(mode));
  write(`brand/logo-lockup-${mode}.svg`, lockupSvg(mode));
  write(`public/brand/logo-mark-${mode}.svg`, markSvg(mode));
  write(`public/brand/logo-lockup-${mode}.svg`, lockupSvg(mode));
  write(`public/brand/email-logo-${mode}@2x.png`, png(lockupSvg(mode), 520));
}

// Favicon that swaps with the browser theme
write(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><style>@media (prefers-color-scheme: dark){.tile{fill:${logo.dark.tile}}.icon{stroke:${logo.dark.icon}}}</style>${markInner('light', 'fav', true)}</svg>`,
);
const lightMark = markSvg('light');
write('public/apple-touch-icon.png', png(lightMark, 180));
write('public/icon-192.png', png(lightMark, 192));
write('public/icon-512.png', png(lightMark, 512));
write('public/favicon.ico', await pngToIco([png(lightMark, 16), png(lightMark, 32), png(lightMark, 48)]));

// Social share image
write(
  'public/og-image.png',
  png(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">` +
      `<rect width="1200" height="630" fill="${themes.light.pageBg}"/>` +
      `<g transform="translate(210 210) scale(3)">${lockupInner('light', 'og')}</g>` +
      `<rect x="210" y="430" width="260" height="10" fill="${ink.cyan}"/><rect x="470" y="430" width="260" height="10" fill="${ink.magenta}"/><rect x="730" y="430" width="260" height="10" fill="${ink.yellow}"/>` +
      textPath(font400, 'Scam alerts and tech tips from Enhanced Group', 210, 500, 34, themes.light.textBody) +
      `</svg>`,
    1200,
  ),
);

// Email icons: 34px badges rendered at 2x (68px), colours baked in per mode
type IconSpec = { name: string; circle?: (m: ThemeMode) => { fill: string; stroke?: string }; color: (m: ThemeMode) => string };
const emailIcons: IconSpec[] = [
  { name: 'shield-exclamation', circle: (m) => ({ fill: themes[m].alert.scam.badgeBg }), color: (m) => themes[m].alert.scam.icon },
  { name: 'bulb', circle: (m) => ({ fill: themes[m].alert.tip.badgeBg }), color: (m) => themes[m].alert.tip.icon },
  {
    name: 'alert-triangle',
    circle: (m) => ({ fill: themes[m].alert.warning.badgeBg, stroke: themes[m].alert.warning.badgeBorder }),
    color: (m) => themes[m].alert.warning.icon,
  },
  { name: 'phone', color: (m) => themes[m].onKey },
  { name: 'shield-check', color: (m) => themes[m].success },
];
for (const spec of emailIcons) {
  for (const mode of ['light', 'dark'] as const) {
    const c = spec.circle?.(mode);
    const circle = c ? `<circle cx="34" cy="34" r="${c.stroke ? 33 : 34}" fill="${c.fill}"${c.stroke ? ` stroke="${c.stroke}" stroke-width="2"` : ''}/>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 68" width="68" height="68">${circle}${iconGroup(spec.name, 34, 34, c ? 38 : 52, spec.color(mode))}</svg>`;
    write(`public/icons/${spec.name}-${mode}@2x.png`, png(svg, 68));
  }
}
