import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLiveMonitoringSchedule, computeFallbackBackoffMs, type LiveSensor } from './useLiveMonitoringSchedule';
import { ApiError } from '@/api/client';
import type * as TelemetryModule from '@/api/hooks/telemetry';

vi.mock('@/api/hooks/telemetry', async (importOriginal) => {
  const actual = await importOriginal<typeof TelemetryModule>();
  return { ...actual, fetchAndCacheTelemetryTrailingBatch: vi.fn() };
});
import { fetchAndCacheTelemetryTrailingBatch } from '@/api/hooks/telemetry';

const batchMock = vi.mocked(fetchAndCacheTelemetryTrailingBatch);

function makeSensors(count: number): LiveSensor[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, family: 'continuous' as const }));
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** The Sensor ids one call of the batch request was made for. */
const idsOfCall = (call: unknown[]) => (call[1] as { sensors: LiveSensor[] }).sensors.map((s) => s.id);

describe('computeFallbackBackoffMs', () => {
  it('starts at the base delay for the first consecutive rate limit', () => {
    expect(computeFallbackBackoffMs(1)).toBe(5_000);
  });

  it('doubles per consecutive rate limit', () => {
    expect(computeFallbackBackoffMs(2)).toBe(10_000);
    expect(computeFallbackBackoffMs(3)).toBe(20_000);
  });

  it('is bounded - never exceeds the max even for many consecutive rate limits', () => {
    expect(computeFallbackBackoffMs(10)).toBe(60_000);
    expect(computeFallbackBackoffMs(100)).toBe(60_000);
  });
});

describe('useLiveMonitoringSchedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    batchMock.mockReset();
    batchMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const render = (props: { active?: boolean; count?: number; sensors?: LiveSensor[] } = {}) =>
    renderHook(
      ({ active, sensors }) => useLiveMonitoringSchedule({ active, deviceId: 1, sensors, periods: 20, intervalMs: 5_000 }),
      { wrapper: makeWrapper(), initialProps: { active: props.active ?? true, sensors: props.sensors ?? makeSensors(props.count ?? 25) } },
    );

  it('refreshes EVERY Sensor on screen with ONE request, immediately on activation', async () => {
    render({ count: 25 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(idsOfCall(batchMock.mock.calls[0]!)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(batchMock.mock.calls[0]![1]).toMatchObject({ deviceId: 1, periods: 20 });
  });

  it('then makes one more request per 5 s - not one per Sensor, however many are shown', async () => {
    render({ count: 50 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_900);
    });
    expect(batchMock).toHaveBeenCalledTimes(1); // not due yet

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(batchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(batchMock).toHaveBeenCalledTimes(3); // 12 requests a minute whether 10 or 50 Sensors are shown
    for (const call of batchMock.mock.calls) expect(idsOfCall(call)).toHaveLength(50);
  });

  it('does not start a new cycle while the previous request is still in flight, even past the interval', async () => {
    let resolveFirst!: () => void;
    batchMock.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveFirst = () => resolve())));
    render({ count: 5 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000); // well past the interval, but the first request never came back
    });
    expect(batchMock).toHaveBeenCalledTimes(1);

    batchMock.mockResolvedValue(undefined);
    await act(async () => {
      resolveFirst();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(2); // the next one follows at once (the interval has long passed), not stacked
  });

  it('does not poll at all while inactive (paused or hidden tab)', async () => {
    render({ active: false, count: 5 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(batchMock).not.toHaveBeenCalled();
  });

  it('resuming from inactive makes exactly one immediate request', async () => {
    const sensors = makeSensors(25);
    const { rerender } = render({ active: false, sensors });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(batchMock).not.toHaveBeenCalled();

    rerender({ active: true, sensors });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);
  });

  it('turning the page (other Sensors on screen) restarts the cycle with exactly those Sensors', async () => {
    const { rerender } = render({ sensors: makeSensors(3) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(idsOfCall(batchMock.mock.calls[0]!)).toEqual([1, 2, 3]);

    rerender({ active: true, sensors: [{ id: 11, family: 'continuous' }, { id: 12, family: 'continuous' }] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(2);
    expect(idsOfCall(batchMock.mock.calls[1]!)).toEqual([11, 12]);
  });

  it('stops scheduling further requests after unmount (route change) - no leaked timer', async () => {
    const { unmount } = render({ count: 5 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);
  });

  it('a 429 enters a shared cooldown and skips the normal 5 s schedule until it expires', async () => {
    batchMock.mockRejectedValueOnce(new ApiError({ status: 429, message: 'Too many requests', retryAfterSeconds: 20, raw: null }));
    const { result } = render({ count: 5 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(result.current.cooldownUntil).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000); // well before the 20 s Retry-After, well past the normal interval
    });
    expect(batchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_100);
    });
    expect(batchMock).toHaveBeenCalledTimes(2); // exactly one controlled request
    expect(result.current.cooldownUntil).toBeNull();
  });

  it('uses a bounded fallback backoff when a 429 has no Retry-After header', async () => {
    batchMock.mockRejectedValueOnce(new ApiError({ status: 429, message: 'Too many requests', raw: null }));
    const { result } = render({ count: 5 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.cooldownUntil).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_900); // computeFallbackBackoffMs(1) === 5_000
    });
    expect(batchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(batchMock).toHaveBeenCalledTimes(2);
  });

  it('a non-429 failure does not stop the schedule', async () => {
    batchMock.mockRejectedValueOnce(new ApiError({ status: 500, message: 'boom', raw: null }));
    const { result } = render({ count: 3 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(result.current.lastTickAt).toBeNull(); // a failed request is not a refresh
    expect(result.current.cooldownUntil).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(batchMock).toHaveBeenCalledTimes(2);
    expect(result.current.lastTickAt).not.toBeNull();
  });

  it('does nothing when there are no Sensors to refresh', async () => {
    render({ sensors: [] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(batchMock).not.toHaveBeenCalled();
  });
});

describe('useLiveMonitoringSchedule - manual refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    batchMock.mockReset();
    batchMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const render = (active: boolean, count = 5) =>
    renderHook(() => useLiveMonitoringSchedule({ active, deviceId: 1, sensors: makeSensors(count), periods: 20, intervalMs: 5_000 }), { wrapper: makeWrapper() });

  it('refreshes exactly the chosen Sensor once, in one request - also while the schedule is paused - and nothing else', async () => {
    const { result } = render(false);
    await act(async () => {
      result.current.refreshSensors([3]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(idsOfCall(batchMock.mock.calls[0]!)).toEqual([3]);
    expect(batchMock.mock.calls[0]![1]).toMatchObject({ deviceId: 1, periods: 20 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(batchMock).toHaveBeenCalledTimes(1); // it did not start the schedule
    expect(result.current.manualSensorIds).toEqual([]);
  });

  it('refreshes SEVERAL Sensors in ONE request (Refresh shown), and says which are being refreshed meanwhile', async () => {
    let finish!: () => void;
    batchMock.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = () => resolve())));
    const { result } = render(false);
    await act(async () => {
      result.current.refreshSensors([3, 1, 2]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(idsOfCall(batchMock.mock.calls[0]!).sort()).toEqual([1, 2, 3]);
    expect(result.current.manualSensorIds.sort()).toEqual([1, 2, 3]);

    await act(async () => {
      finish();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.manualSensorIds).toEqual([]);
  });

  it('never runs two manual refreshes at once', async () => {
    let finish!: () => void;
    batchMock.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = () => resolve())));
    const { result } = render(false);
    await act(async () => {
      result.current.refreshSensors([1]);
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      result.current.refreshSensors([2]); // ignored: one is in flight
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      result.current.refreshSensors([2]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(2);
  });

  it('waits for the scheduled request already on its way - never two requests in flight', async () => {
    let finishScheduled!: () => void;
    batchMock.mockImplementationOnce(() => new Promise<void>((resolve) => (finishScheduled = () => resolve()))); // the scheduled one at t=0
    const { result } = render(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refreshSensors([4]); // the click arrives while the scheduled request is open
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1); // it waits, it does not overlap

    await act(async () => {
      finishScheduled();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(2); // now the manual one
    expect(idsOfCall(batchMock.mock.calls[1]!)).toEqual([4]);
  });

  it('holds the schedule back while a manual refresh is open', async () => {
    let finish!: () => void;
    const { result } = render(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // scheduled request 1 (done at once)
    });
    batchMock.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = () => resolve()))); // the manual one stays open
    await act(async () => {
      result.current.refreshSensors([4]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000); // the schedule's 5 s ticks fall due, but the manual request is still open
    });
    expect(batchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish();
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(batchMock).toHaveBeenCalledTimes(3); // the schedule resumed
  });

  it('a 429 starts the shared cooldown: no further manual refresh, and the schedule waits out Retry-After too', async () => {
    const { result } = render(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // scheduled request 1
    });
    batchMock.mockRejectedValueOnce(new ApiError({ status: 429, message: 'Too many requests', retryAfterSeconds: 30, raw: null }));
    await act(async () => {
      result.current.refreshSensors([2]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(2);
    expect(result.current.cooldownUntil).not.toBeNull();

    await act(async () => {
      result.current.refreshSensors([3]); // refused during the cooldown
      await vi.advanceTimersByTimeAsync(25_000);
    });
    expect(batchMock).toHaveBeenCalledTimes(2); // neither the click nor the schedule fired

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(batchMock.mock.calls.length).toBeGreaterThanOrEqual(3); // the schedule resumed after the cooldown
    expect(result.current.cooldownUntil).toBeNull();
  });

  it('ends the cooldown by itself when the schedule is paused', async () => {
    batchMock.mockRejectedValueOnce(new ApiError({ status: 429, message: 'Too many requests', retryAfterSeconds: 10, raw: null }));
    const { result } = render(false);
    await act(async () => {
      result.current.refreshSensors([1]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.cooldownUntil).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(result.current.cooldownUntil).toBeNull();
    await act(async () => {
      result.current.refreshSensors([1]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(2);
  });

  it('a failed manual refresh leaves the controls usable and starts no cooldown', async () => {
    batchMock.mockRejectedValueOnce(new ApiError({ status: 500, message: 'boom', raw: null }));
    const { result } = render(false);
    await act(async () => {
      result.current.refreshSensors([1, 2]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(result.current.cooldownUntil).toBeNull();
    expect(result.current.manualSensorIds).toEqual([]);
  });
});
