// Single source of truth for every colour in the admin app, archive and emails (spec §13).
// scripts/check-contrast.ts fails CI if any pair in `contrastPairs` drops below its minimum.

export const ink = { cyan: '#00AEEF', magenta: '#EC008C', yellow: '#FFF200' } as const;

export const logo = {
  light: { tile: '#0B0B0B', icon: '#FFFFFF' },
  dark: { tile: '#FFFFFF', icon: '#0B0B0B' },
} as const;

export type AlertTokens = {
  cardBg: string;
  border: string;
  badgeBg: string;
  badgeBorder?: string;
  icon: string;
  pillBg: string;
  pillText: string;
  title: string;
  body: string;
  subhead?: string;
  strong?: string;
};

export type ThemeTokens = {
  pageBg: string;
  surface: string;
  text: string;
  textBody: string;
  textMuted: string;
  border: string;
  key: string;
  onKey: string;
  accent: string;
  danger: string;
  dangerBg: string;
  success: string;
  focus: string;
  wordmark: string;
  wordmarkSub: string;
  alert: { scam: AlertTokens; tip: AlertTokens; warning: AlertTokens };
};

const light: ThemeTokens = {
  pageBg: '#F4F4F2',
  surface: '#FFFFFF',
  text: '#0B0B0B',
  textBody: '#3D3D3A',
  textMuted: '#5F5E5A',
  border: '#D3D1C7',
  key: '#0B0B0B',
  onKey: '#FFFFFF',
  accent: '#006E96',
  danger: '#8A0053',
  dangerBg: '#FCE4F1',
  success: '#3B6D11',
  focus: '#006E96',
  wordmark: '#0B0B0B',
  wordmarkSub: '#3D3D3A',
  alert: {
    scam: { cardBg: '#FFFFFF', border: '#F3B6D6', badgeBg: '#FCE4F1', icon: '#B0006A', pillBg: '#FCE4F1', pillText: '#8A0053', title: '#0B0B0B', body: '#3D3D3A', subhead: '#B0006A', strong: '#0B0B0B' },
    tip: { cardBg: '#FFFFFF', border: '#A6DDF2', badgeBg: '#E0F4FB', icon: '#006E96', pillBg: '#E0F4FB', pillText: '#005273', title: '#0B0B0B', body: '#3D3D3A' },
    warning: { cardBg: '#FFF8B3', border: '#E6D500', badgeBg: '#FFF200', badgeBorder: '#E6D500', icon: '#0B0B0B', pillBg: '#0B0B0B', pillText: '#FFF200', title: '#0B0B0B', body: '#2A2A10' },
  },
};

const dark: ThemeTokens = {
  pageBg: '#161615',
  surface: '#232322',
  text: '#FFFFFF',
  textBody: '#D3D1C7',
  textMuted: '#B4B2A9',
  border: '#444441',
  key: '#FFFFFF',
  onKey: '#0B0B0B',
  accent: '#5CCBF2',
  danger: '#FFB8DE',
  dangerBg: '#4A0F30',
  success: '#97C459',
  focus: '#5CCBF2',
  wordmark: '#FFFFFF',
  wordmarkSub: '#D3D1C7',
  alert: {
    scam: { cardBg: '#232322', border: '#6B1F48', badgeBg: '#4A0F30', icon: '#FF7AC2', pillBg: '#4A0F30', pillText: '#FFB8DE', title: '#FFFFFF', body: '#D3D1C7', subhead: '#FF7AC2', strong: '#FFFFFF' },
    tip: { cardBg: '#232322', border: '#0E4D66', badgeBg: '#08384B', icon: '#5CCBF2', pillBg: '#08384B', pillText: '#A9E6FA', title: '#FFFFFF', body: '#D3D1C7' },
    warning: { cardBg: '#2A2810', border: '#6B6300', badgeBg: '#FFF200', icon: '#0B0B0B', pillBg: '#FFF200', pillText: '#0B0B0B', title: '#FFF6A0', body: '#E8E4C0' },
  },
};

export const themes = { light, dark } as const;
export type ThemeMode = keyof typeof themes;

export type ContrastPair = { name: string; fg: string; bg: string; min: 4.5 | 3 };

function pairsFor(mode: ThemeMode): ContrastPair[] {
  const t = themes[mode];
  const p = (name: string, fg: string, bg: string, min: 4.5 | 3 = 4.5): ContrastPair => ({ name: `${mode}.${name}`, fg, bg, min });
  const out: ContrastPair[] = [];
  for (const bgName of ['pageBg', 'surface'] as const) {
    const bg = t[bgName];
    out.push(
      p(`text/${bgName}`, t.text, bg),
      p(`textBody/${bgName}`, t.textBody, bg),
      p(`textMuted/${bgName}`, t.textMuted, bg),
      p(`accent/${bgName}`, t.accent, bg),
      p(`success/${bgName}`, t.success, bg),
      p(`wordmark/${bgName}`, t.wordmark, bg),
      p(`wordmarkSub/${bgName}`, t.wordmarkSub, bg),
      p(`border-is-decorative-key/${bgName}`, t.key, bg, 3),
    );
  }
  out.push(p('onKey/key', t.onKey, t.key), p('danger/dangerBg', t.danger, t.dangerBg), p('focus/surface', t.focus, t.surface, 3));
  for (const [name, a] of Object.entries(t.alert)) {
    out.push(
      p(`alert.${name}.title`, a.title, a.cardBg),
      p(`alert.${name}.body`, a.body, a.cardBg),
      p(`alert.${name}.pill`, a.pillText, a.pillBg),
      p(`alert.${name}.icon`, a.icon, a.badgeBg, 3),
    );
    if (a.subhead) out.push(p(`alert.${name}.subhead`, a.subhead, a.cardBg));
    if (a.strong) out.push(p(`alert.${name}.strong`, a.strong, a.cardBg));
  }
  out.push(p('logo.icon/tile', logo[mode].icon, logo[mode].tile, 3));
  return out;
}

export const contrastPairs: ContrastPair[] = [...pairsFor('light'), ...pairsFor('dark')];
