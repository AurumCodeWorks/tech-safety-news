import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getStoredTheme, setTheme } from '../../src/app/theme';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme', () => {
  it('applies dark tokens as CSS variables', () => {
    setTheme('dark');
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.getPropertyValue('--tsn-page-bg')).toBe('#161615');
    expect(root.style.getPropertyValue('--tsn-alert-scam-pill-text')).toBe('#FFB8DE');
    expect(getStoredTheme()).toBe('dark');
  });

  it('applies light tokens', () => {
    setTheme('light');
    expect(document.documentElement.style.getPropertyValue('--tsn-page-bg')).toBe('#F4F4F2');
  });

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setTheme('dark')).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(getStoredTheme()).toBeNull();
    expect(() => applyTheme()).not.toThrow();
  });

  it('follows the system when set to system', () => {
    setTheme('system');
    expect(getStoredTheme()).toBeNull();
    expect(['light', 'dark']).toContain(document.documentElement.getAttribute('data-theme'));
  });
});
