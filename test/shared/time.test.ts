import { describe, expect, it } from 'vitest';
import { londonLocalToUtc, utcToLondonLocal } from '../../src/shared/time';

describe('London time', () => {
  it('converts summer and winter times', () => {
    expect(londonLocalToUtc('2026-07-01T09:00')).toBe('2026-07-01T08:00:00.000Z');
    expect(londonLocalToUtc('2026-12-01T09:00')).toBe('2026-12-01T09:00:00.000Z');
  });
  it('picks the BST occurrence for an ambiguous clocks-back time', () => {
    expect(londonLocalToUtc('2026-10-25T01:30')).toBe('2026-10-25T00:30:00.000Z');
  });
  it('rejects a time skipped when clocks go forward', () => {
    expect(() => londonLocalToUtc('2027-03-28T01:30')).toThrow("That time doesn't exist because the clocks go forward");
  });
  it('rejects malformed input', () => {
    expect(() => londonLocalToUtc('next tuesday')).toThrow('Enter a date and time');
  });
  it('converts UTC back to London local', () => {
    expect(utcToLondonLocal('2026-07-01T08:00:00.000Z')).toBe('2026-07-01T09:00');
    expect(utcToLondonLocal('2026-12-01T09:00:00.000Z')).toBe('2026-12-01T09:00');
  });
});
