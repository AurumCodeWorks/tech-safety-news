import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function pngSize(path: string) {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe('generated brand assets (run `npm run brand` first)', () => {
  it('renders app icons at their stated sizes', () => {
    expect(pngSize('public/icon-512.png')).toEqual({ width: 512, height: 512 });
    expect(pngSize('public/icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(pngSize('public/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(pngSize('public/og-image.png')).toEqual({ width: 1200, height: 630 });
  });
  it('renders email logos at 2x of 260x52', () => {
    expect(pngSize('public/brand/email-logo-light@2x.png')).toEqual({ width: 520, height: 104 });
    expect(pngSize('public/brand/email-logo-dark@2x.png')).toEqual({ width: 520, height: 104 });
  });
  it('renders every email icon in both modes at 68x68', () => {
    for (const name of ['shield-exclamation', 'bulb', 'alert-triangle', 'phone', 'shield-check']) {
      for (const mode of ['light', 'dark']) expect(pngSize(`public/icons/${name}-${mode}@2x.png`)).toEqual({ width: 68, height: 68 });
    }
  });
  it('ships a favicon that swaps in dark mode', () => {
    const svg = readFileSync('public/favicon.svg', 'utf8');
    expect(svg).toContain('prefers-color-scheme: dark');
    expect(readFileSync('public/favicon.ico').readUInt16LE(2)).toBe(1);
  });
  it('outlines the wordmark text so no font is needed', () => {
    const svg = readFileSync('public/brand/logo-lockup-light.svg', 'utf8');
    expect(svg).not.toContain('<text');
    expect(svg).toContain('<path');
  });
});
