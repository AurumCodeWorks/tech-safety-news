import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Debounced autosave. Changes to `value` (after the first render) are saved `delay` ms after the
 * last change; `flush()` saves any pending change immediately (used before sending/testing).
 */
export function useAutosave<T>(value: T | null, save: (v: T) => Promise<void>, delay = 1500) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const lastSaved = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = pending.current;
    if (v === null) return;
    pending.current = null;
    setState('saving');
    try {
      await saveRef.current(v);
      lastSaved.current = JSON.stringify(v);
      setState('saved');
      setError(null);
    } catch (e) {
      setState('error');
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (value === null) return;
    // Only real changes are saved: a save bumps updated_at, which would invalidate the last test send.
    const json = JSON.stringify(value);
    if (lastSaved.current === null) {
      lastSaved.current = json;
      return;
    }
    if (json === lastSaved.current) return;
    pending.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), delay);
  }, [value, delay, run]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return { state, error, flush: run };
}
