import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { fetchAndCacheTelemetryTrailingBatch } from './telemetry';
import { queryKeys } from '@/api/queryKeys';
import { ApiError } from '@/api/client';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const reading = (sensorId: number, measured: string, actual: number) => ({ sensorId, period: Date.parse(measured), measured, actual });

describe('fetchAndCacheTelemetryTrailingBatch', () => {
  beforeEach(() => {
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  });

  const run = (queryClient: QueryClient, sensors: { id: number; family: 'continuous' | 'bidirectionalContinuous' }[]) =>
    fetchAndCacheTelemetryTrailingBatch(queryClient, { deviceId: 4, sensors, periods: 20 });
  const cached = (queryClient: QueryClient, family: string, sensorId: number) =>
    queryClient.getQueryData<{ measured: string; actual: number }[]>(queryKeys.telemetryTrailing(family, 4, sensorId, 20));

  it('reads all Signal Sensors with ONE request and writes each Sensor\'s readings, oldest first, into that Sensor\'s own query', async () => {
    const urls: string[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      urls.push((input as Request).url);
      // The API: one flat list, per Sensor newest first; Sensor 3 has no data at all.
      const rows = [
        reading(2, '2026-10-21T10:00:10Z', 22), reading(2, '2026-10-21T10:00:05Z', 21),
        reading(1, '2026-10-21T10:00:10Z', 12), reading(1, '2026-10-21T10:00:05Z', 11), reading(1, '2026-10-21T10:00:00Z', 10),
      ];
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const queryClient = new QueryClient();

    await run(queryClient, [{ id: 1, family: 'continuous' }, { id: 2, family: 'continuous' }, { id: 3, family: 'continuous' }]);

    expect(urls).toHaveLength(1);
    const query = new URL(urls[0]!).searchParams;
    expect(new URL(urls[0]!).pathname).toBe('/api/Continuous/MeasuredTrailingPeriodsBatch');
    expect(query.getAll('sensorIds')).toEqual(['1', '2', '3']);
    expect(query.get('periods')).toBe('20');
    expect(cached(queryClient, 'continuous', 1)?.map((r) => r.actual)).toEqual([10, 11, 12]); // oldest first: the last one is the latest
    expect(cached(queryClient, 'continuous', 2)?.map((r) => r.actual)).toEqual([21, 22]);
    expect(cached(queryClient, 'continuous', 3)).toEqual([]); // no data: an empty list, not "never fetched"
  });

  it('a failed request reaches every Sensor\'s query and is thrown for the schedule to inspect', async () => {
    fetchMock().mockImplementation(async () => new Response(JSON.stringify('Too many requests'), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '7' } }));
    const queryClient = new QueryClient();

    const failure = await run(queryClient, [{ id: 1, family: 'continuous' }, { id: 2, family: 'continuous' }]).catch((err) => err);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(429);
    expect((failure as ApiError).retryAfterSeconds).toBe(7);
    for (const id of [1, 2]) expect(queryClient.getQueryState(queryKeys.telemetryTrailing('continuous', 4, id, 20))?.status).toBe('error');
  });

  it('a CANCELLED request (schedule restart, page change, StrictMode) leaves every card as it was and is rethrown, not stored as an error', async () => {
    fetchMock().mockImplementation(
      (input: RequestInfo | URL) =>
        new Promise((_resolve, reject) => {
          const { signal } = input as Request;
          const fail = () => reject(signal.reason ?? new DOMException('This operation was aborted', 'AbortError'));
          if (signal.aborted) fail();
          else signal.addEventListener('abort', fail);
        }),
    );
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.telemetryTrailing('continuous', 4, 1, 20), [{ measured: '2026-10-21T10:00:00Z', actual: 10 }]);
    const controller = new AbortController();

    const pending = fetchAndCacheTelemetryTrailingBatch(queryClient, { deviceId: 4, sensors: [{ id: 1, family: 'continuous' }, { id: 2, family: 'continuous' }], periods: 20 }, controller.signal).catch((err) => err);
    controller.abort();
    const outcome = await pending;

    expect((outcome as Error).name).toBe('AbortError');
    expect(queryClient.getQueryState(queryKeys.telemetryTrailing('continuous', 4, 1, 20))?.status).toBe('success'); // keeps its data
    expect(cached(queryClient, 'continuous', 1)?.map((r) => r.actual)).toEqual([10]);
    expect(queryClient.getQueryState(queryKeys.telemetryTrailing('continuous', 4, 2, 20))).toBeUndefined(); // never touched: no error stored
  });

  it('a bidirectional Sensor is still read one by one (the batch is for Signal Sensors), also oldest first', async () => {
    const paths: string[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL((input as Request).url);
      paths.push(url.pathname);
      const body = url.pathname.endsWith('Batch')
        ? [reading(1, '2026-10-21T10:00:00Z', 5)]
        : [{ sensorId: 7, period: 2, measured: '2026-10-21T10:00:05Z', actual: 71 }, { sensorId: 7, period: 1, measured: '2026-10-21T10:00:00Z', actual: 70 }];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const queryClient = new QueryClient();

    await run(queryClient, [{ id: 1, family: 'continuous' }, { id: 7, family: 'bidirectionalContinuous' }]);

    expect(paths).toEqual(['/api/Continuous/MeasuredTrailingPeriodsBatch', '/api/BiDirectionalContinuous/MeasuredTrailingPeriods']);
    expect(cached(queryClient, 'bidirectionalContinuous', 7)?.map((r) => r.actual)).toEqual([70, 71]);
  });

  it('asks for nothing when there is no Signal Sensor', async () => {
    fetchMock().mockImplementation(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));

    await run(new QueryClient(), []);

    expect(fetchMock()).not.toHaveBeenCalled();
  });
});
