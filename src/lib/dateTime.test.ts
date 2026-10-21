import { describe, it, expect } from 'vitest';
import { freshnessOf, formatDateTime, toApiIso, parseApiDate, formatTime, formatShortDateTime } from './dateTime';

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

describe('formatTime', () => {
  it('shows only the clock time as HH:mm:ss, and a dash for nothing', () => {
    expect(formatTime(new Date(2026, 9, 21, 5, 3, 7))).toBe('05:03:07');
    expect(formatTime(new Date(2026, 9, 21, 23, 59, 59))).toBe('23:59:59');
    expect(formatTime(null)).toBe('—');
    expect(formatTime('not a date')).toBe('—');
  });
});

describe('formatShortDateTime', () => {
  it('shows a two-digit year, month, day and the time', () => {
    expect(formatShortDateTime(new Date(2026, 9, 21, 5, 3, 7))).toBe('26-10-21 05:03:07');
    expect(formatShortDateTime(undefined)).toBe('—');
  });
});
