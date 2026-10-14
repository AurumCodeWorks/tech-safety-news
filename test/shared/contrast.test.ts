import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from '../../src/shared/contrast';
import { contrastPairs, ink, logo, themes } from '../../src/shared/tokens';

describe('contrast maths', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });
  it('documents why process cyan is never text on white', () => {
    expect(contrastRatio(ink.cyan, '#FFFFFF')).toBeLessThan(3);
  });
});

describe('design tokens', () => {
  it('uses the approved alert colours', () => {
    expect(themes.light.alert.scam.pillText).toBe('#8A0053');
    expect(themes.light.alert.tip.icon).toBe('#006E96');
    expect(themes.light.alert.warning.cardBg).toBe('#FFF8B3');
    expect(themes.dark.alert.warning.pillBg).toBe('#FFF200');
    expect(logo.light).toEqual({ tile: '#0B0B0B', icon: '#FFFFFF' });
    expect(logo.dark).toEqual({ tile: '#FFFFFF', icon: '#0B0B0B' });
  });
  it('covers both themes with contrast pairs', () => {
    expect(contrastPairs.some((p) => p.name.startsWith('light.'))).toBe(true);
    expect(contrastPairs.some((p) => p.name.startsWith('dark.'))).toBe(true);
    expect(contrastPairs.length).toBeGreaterThan(30);
  });
  it('every declared pair meets its minimum', () => {
    for (const p of contrastPairs) expect(contrastRatio(p.fg, p.bg), p.name).toBeGreaterThanOrEqual(p.min);
  });
});
