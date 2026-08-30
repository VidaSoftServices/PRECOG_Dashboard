import { describe, it, expect } from 'vitest';
import { freshnessOf, formatDateTime, toApiIso, parseApiDate } from './dateTime';

describe('freshnessOf', () => {
  it('is fresh within the fresh-minutes window', () => {
    const now = new Date();
    expect(freshnessOf(new Date(now.getTime() - 5 * 60_000))).toBe('fresh');
  });

  it('is aging between fresh and aging windows', () => {
    const now = new Date();
    expect(freshnessOf(new Date(now.getTime() - 30 * 60_000))).toBe('aging');
  });

  it('is stale beyond the aging window', () => {
    const now = new Date();
    expect(freshnessOf(new Date(now.getTime() - 120 * 60_000))).toBe('stale');
  });

  it('is unknown for null/undefined/invalid input', () => {
    expect(freshnessOf(null)).toBe('unknown');
    expect(freshnessOf(undefined)).toBe('unknown');
    expect(freshnessOf('not-a-date')).toBe('unknown');
  });
});

describe('formatDateTime', () => {
  it('formats a valid ISO string as yyyy-MM-dd HH:mm:ss in the viewer local zone', () => {
    // Minutes/seconds are timezone-shift-independent for the vast majority of
    // real offsets (whole/half-hour), so this stays stable across CI machines
    // without hardcoding a specific hour.
    expect(formatDateTime('2026-08-30T12:00:00Z')).toMatch(/^2026-08-3[01] \d{2}:00:00$/);
  });

  it('returns an em dash for missing/invalid input', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('garbage')).toBe('—');
  });
});

describe('toApiIso / parseApiDate round-trip', () => {
  it('round-trips a Date through ISO 8601', () => {
    const original = new Date('2026-01-15T08:00:00.000Z');
    const iso = toApiIso(original);
    const parsed = parseApiDate(iso);
    expect(parsed?.getTime()).toBe(original.getTime());
  });

  it('parseApiDate returns null for empty/invalid input', () => {
    expect(parseApiDate(null)).toBeNull();
    expect(parseApiDate('')).toBeNull();
    expect(parseApiDate('not-a-date')).toBeNull();
  });
});
