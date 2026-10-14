import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from '../../src/app/editor/useAutosave';

afterEach(() => vi.useRealTimers());

describe('useAutosave', () => {
  it('does not save when the value is replaced by an equal copy (e.g. the email loading twice)', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {});
    const { rerender } = renderHook(({ v }) => useAutosave(v, save, 100), { initialProps: { v: { subject: 'A' } as { subject: string } | null } });
    rerender({ v: { subject: 'A' } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('saves real changes once after the delay', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {});
    const { rerender } = renderHook(({ v }) => useAutosave(v, save, 100), { initialProps: { v: { subject: 'A' } } });
    rerender({ v: { subject: 'AB' } });
    rerender({ v: { subject: 'ABC' } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ subject: 'ABC' });
  });
});
