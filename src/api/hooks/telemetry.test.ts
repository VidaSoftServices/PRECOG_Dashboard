import { describe, it, expect, afterEach } from 'vitest';
import { familyFor, isCurveFamily, isBidirectionalFamily, fetchAndCacheTelemetryTrailingPeriods } from './telemetry';
import { queryClient } from '@/api/queryClient';
import { fetchMock, mockFetchJson } from '@/test/mockFetch';

describe('familyFor', () => {
  it('maps continuous + unidirectional to continuous', () => {
    expect(familyFor('continuous', 'lowerisbetter')).toBe('continuous');
  });

  it('maps continuous + bidirectional to bidirectionalContinuous', () => {
    expect(familyFor('continuous', 'bidirectional')).toBe('bidirectionalContinuous');
  });

  it('maps periodic + unidirectional to periodic', () => {
    expect(familyFor('periodic', 'higherisbetter')).toBe('periodic');
  });

  it('maps periodic + bidirectional to bidirectionalPeriodic', () => {
    expect(familyFor('periodic', 'bidirectional')).toBe('bidirectionalPeriodic');
  });

  it('treats missing direction as unidirectional (never guesses bidirectional)', () => {
    expect(familyFor('continuous', null)).toBe('continuous');
    expect(familyFor('continuous', undefined)).toBe('continuous');
  });
});

describe('isCurveFamily / isBidirectionalFamily', () => {
  it('identifies the two curve families', () => {
    expect(isCurveFamily('periodic')).toBe(true);
    expect(isCurveFamily('bidirectionalPeriodic')).toBe(true);
    expect(isCurveFamily('continuous')).toBe(false);
    expect(isCurveFamily('bidirectionalContinuous')).toBe(false);
  });

  it('identifies the two bidirectional families', () => {
    expect(isBidirectionalFamily('bidirectionalContinuous')).toBe(true);
    expect(isBidirectionalFamily('bidirectionalPeriodic')).toBe(true);
    expect(isBidirectionalFamily('continuous')).toBe(false);
    expect(isBidirectionalFamily('periodic')).toBe(false);
  });
});

// Deliberately imports the real production `queryClient` singleton (not a
// fresh test-only QueryClient) - these two tests exist specifically to catch
// this call silently losing its `retry`/`staleTime` overrides to
// queryClient.ts's global defaults again, which a mocked-hook-level test
// (useLiveMonitoringSchedule.test.tsx mocks this whole function away) can
// never see. A real mocked-browser Live Monitoring run is what originally
// caught both bugs - see CLAUDE.md's "Live Monitoring" section.
describe('fetchAndCacheTelemetryTrailingPeriods (against the real production queryClient)', () => {
  afterEach(() => {
    queryClient.clear();
  });

  it('does not retry internally on a 429 - the caller (the Live Monitoring orchestrator) is the sole retry authority', async () => {
    mockFetchJson(429, { message: 'Too many requests' }, { 'Retry-After': '5' });
    const callsBefore = fetchMock().mock.calls.length;

    await expect(
      fetchAndCacheTelemetryTrailingPeriods(queryClient, { family: 'continuous', deviceId: 1, sensorId: 1, periods: 20 }),
    ).rejects.toThrow();

    // queryClient.ts's global default retries a 429 once more, internally,
    // after a Retry-After-derived delay - if this call ever stopped passing
    // its own `retry: false`, a second fetch would appear here, invisibly,
    // several seconds before this assertion could even run.
    expect(fetchMock().mock.calls.length - callsBefore).toBe(1);
  });

  it('always hits the network, even for a query key fetched moments ago', async () => {
    mockFetchJson(200, [{ sensorId: 2, period: 0, measured: new Date().toISOString(), actual: 1 }]);
    await fetchAndCacheTelemetryTrailingPeriods(queryClient, { family: 'continuous', deviceId: 1, sensorId: 2, periods: 20 });

    const callsBefore = fetchMock().mock.calls.length;
    mockFetchJson(200, [{ sensorId: 2, period: 1, measured: new Date().toISOString(), actual: 2 }]);
    // queryClient.ts's global default (staleTime: 15_000) would otherwise
    // silently serve the previous call's cached value here with zero network
    // traffic - exactly the bug that made Live Monitoring appear "stuck" on
    // resume and after navigating away and back, until this call started
    // passing its own `staleTime: 0`.
    await fetchAndCacheTelemetryTrailingPeriods(queryClient, { family: 'continuous', deviceId: 1, sensorId: 2, periods: 20 });
    expect(fetchMock().mock.calls.length - callsBefore).toBe(1);
  });
});
