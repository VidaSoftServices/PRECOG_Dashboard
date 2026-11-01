import { describe, it, expect, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readAllPages, useTelemetryDateRange, TELEMETRY_PAGE_SIZE, type TelemetryPoint } from './telemetry';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const point = (n: number): TelemetryPoint => ({ measured: new Date(Date.UTC(2026, 9, 21, 0, 0, n)).toISOString(), actual: n }) as TelemetryPoint;

describe('readAllPages', () => {
  it('reads page after page, skipping what is already loaded, until a page comes back empty', async () => {
    const all = Array.from({ length: 12 }, (_, i) => point(i));
    const calls: { skip: number; take: number }[] = [];
    const result = await readAllPages(async (skip, take) => {
      calls.push({ skip, take });
      return all.slice(skip, skip + take);
    }, 100, 5);

    expect(result).toEqual(all);
    expect(calls).toEqual([{ skip: 0, take: 5 }, { skip: 5, take: 5 }, { skip: 10, take: 5 }, { skip: 12, take: 5 }]);
  });

  it('stops at the cap: the last page asks only for what is still allowed, and nothing more is requested', async () => {
    const all = Array.from({ length: 50 }, (_, i) => point(i));
    const calls: { skip: number; take: number }[] = [];
    const result = await readAllPages(async (skip, take) => {
      calls.push({ skip, take });
      return all.slice(skip, skip + take);
    }, 8, 5);

    expect(result).toHaveLength(8);
    expect(calls).toEqual([{ skip: 0, take: 5 }, { skip: 5, take: 3 }]);
  });

  it('still gives every point when the server clamps a page below the requested size (a short page is not the end)', async () => {
    const all = Array.from({ length: 9 }, (_, i) => point(i));
    const result = await readAllPages(async (skip) => all.slice(skip, skip + 4), 100, 5); // the server only ever returns 4

    expect(result).toEqual(all);
  });

  it('is one request for a range that holds nothing', async () => {
    let calls = 0;
    expect(await readAllPages(async () => (calls++, []), 100, 5)).toEqual([]);
    expect(calls).toBe(1);
  });

  it('pages by the API\'s documented page size by default', () => {
    expect(TELEMETRY_PAGE_SIZE).toBe(5000);
  });
});

describe('useTelemetryDateRange with maxPoints', () => {
  beforeEach(() => {
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  });

  function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  it('reads a continuous range in pages (skip/take on every request) and returns all of it, newest page first as the API sends it', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ sensorId: 3, period: i, measured: new Date(Date.UTC(2026, 9, 21, 0, 0, i)).toISOString(), actual: i }));
    const queries: { skip: string | null; take: string | null }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL((input as Request).url);
      const skip = Number(url.searchParams.get('skip') ?? 0);
      const take = Number(url.searchParams.get('take') ?? 0);
      queries.push({ skip: url.searchParams.get('skip'), take: url.searchParams.get('take') });
      return new Response(JSON.stringify(rows.slice(skip, skip + take)), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { result } = renderHook(
      () => useTelemetryDateRange({ family: 'continuous', deviceId: 4, sensorId: 3, startDate: '2026-10-20T00:00:00Z', endDate: '2026-10-21T00:00:00Z', maxPoints: 100, pageSize: 3 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(7);
    expect(queries).toEqual([{ skip: '0', take: '3' }, { skip: '3', take: '3' }, { skip: '6', take: '3' }, { skip: '7', take: '3' }]);
  });

  it('without maxPoints it stays ONE request with the given skip/take (every other caller is unchanged)', async () => {
    const queries: string[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      queries.push(new URL((input as Request).url).search);
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { result } = renderHook(
      () => useTelemetryDateRange({ family: 'continuous', deviceId: 4, sensorId: 3, startDate: '2026-10-20T00:00:00Z', endDate: '2026-10-21T00:00:00Z', skip: 10, take: 50 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('skip=10');
    expect(queries[0]).toContain('take=50');
  });
});
