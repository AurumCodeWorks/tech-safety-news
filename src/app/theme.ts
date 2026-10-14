import { themes, type ThemeMode } from '../shared/tokens';

const KEY = 'tsn-theme';
export type ThemeChoice = ThemeMode | 'system';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Flattens a theme into --tsn-* custom properties, e.g. alert.scam.pillText → --tsn-alert-scam-pill-text. */
function flatten(obj: object, prefix = '--tsn'): [string, string][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatten(v, `${prefix}-${kebab(k)}`) : [[`${prefix}-${kebab(k)}`, String(v)] as [string, string]],
  );
}

export function getStoredTheme(): ThemeMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemMode(): ThemeMode {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function currentMode(): ThemeMode {
  return getStoredTheme() ?? systemMode();
}

function paint(mode: ThemeMode) {
  const root = document.documentElement;
  for (const [name, value] of flatten(themes[mode])) root.style.setProperty(name, value);
  root.setAttribute('data-theme', mode);
  root.style.colorScheme = mode;
}

export function applyTheme(): void {
  paint(currentMode());
}

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked (private window): the choice lasts for this page only.
  }
  paint(choice === 'system' ? systemMode() : choice);
}
