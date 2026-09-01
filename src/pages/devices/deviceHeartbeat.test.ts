import { describe, it, expect } from 'vitest';
import { freshnessOf, formatRelative, parseApiDate } from '@/lib/dateTime';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';

/**
 * The Device detail page's "Last heartbeat" display.
 *
 * This value is produced by `DeviceDto.heartBeat`, which the API now stamps on
 * every accepted DevicePrincipal telemetry ingestion and on every
 * `POST /api/Devices/{deviceId}/Heartbeat`. Before that it was never written at
 * all, so the page permanently showed "never" - these tests pin down both the
 * null case that produced the original bug report and the live case that
 * replaces it.
 */
describe('Last heartbeat display', () => {
  it('renders a Device that has never reported as "never"', () => {
    // The exact symptom the field investigation started from: a NULL heartBeat.
    expect(formatRelative(null)).toBe('never');
    expect(formatRelative(undefined)).toBe('never');
    expect(freshnessOf(null)).toBe('unknown');
  });

  it('renders a recent heartbeat as a relative time, not "never"', () => {
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

    const rendered = formatRelative(oneMinuteAgo);
    expect(rendered).not.toBe('never');
    expect(rendered).toMatch(/ago$/);
  });

  it('parses the API\'s UTC instant without shifting it', () => {
    // The API returns a "timestamp with time zone" value; the stored instant is
    // the server's UTC clock, never the device's.
    const parsed = parseApiDate('2026-09-01T12:34:56Z');
    expect(parsed).not.toBeNull();
    expect(parsed!.toISOString()).toBe('2026-09-01T12:34:56.000Z');
  });

  it('classifies freshness around the documented 15 and 60 minute boundaries', () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

    // A Device reporting every 30 s stays comfortably "fresh".
    expect(freshnessOf(minutesAgo(0.5))).toBe('fresh');
    expect(freshnessOf(minutesAgo(14))).toBe('fresh');
    expect(freshnessOf(minutesAgo(16))).toBe('aging');
    expect(freshnessOf(minutesAgo(61))).toBe('stale');
  });

  it('polls slowly enough not to be a request storm, and fast enough to stay truthful', () => {
    // One request per 30 s per open page. Fast enough that an actively
    // reporting Device never visibly ages past its real heartbeat, slow enough
    // that the page is not hammering the API.
    expect(POLL_INTERVALS_MS.deviceDetail).toBe(30_000);
    expect(POLL_INTERVALS_MS.deviceDetail).toBeGreaterThanOrEqual(10_000);

    // A full "fresh" window holds ~30 polls, so the display cannot silently
    // drift into "aging" while the Device is in fact reporting normally.
    const freshWindowMs = 15 * 60_000;
    expect(freshWindowMs / POLL_INTERVALS_MS.deviceDetail).toBeGreaterThan(20);
  });
});
