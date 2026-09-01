import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useLiveMonitoringSchedule,
  computeFallbackBackoffMs,
  nextRotationIndex,
  type RotationSensor,
} from './useLiveMonitoringSchedule';
import { ApiError } from '@/api/client';
import type * as TelemetryModule from '@/api/hooks/telemetry';

vi.mock('@/api/hooks/telemetry', async (importOriginal) => {
  const actual = await importOriginal<typeof TelemetryModule>();
  return { ...actual, fetchAndCacheTelemetryTrailingPeriods: vi.fn() };
});
import { fetchAndCacheTelemetryTrailingPeriods } from '@/api/hooks/telemetry';

const fetchMock = vi.mocked(fetchAndCacheTelemetryTrailingPeriods);

function makeSensors(count: number): RotationSensor[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, family: 'continuous' as const }));
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

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

describe('nextRotationIndex', () => {
  it('wraps around to 0 after the last Sensor', () => {
    expect(nextRotationIndex(0, 3)).toBe(1);
    expect(nextRotationIndex(1, 3)).toBe(2);
    expect(nextRotationIndex(2, 3)).toBe(0);
  });

  it('is safe for an empty Sensor list', () => {
    expect(nextRotationIndex(0, 0)).toBe(0);
  });
});

describe('useLiveMonitoringSchedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('fetches exactly one Sensor immediately on activation, not the whole Sensor list at once', async () => {
    const sensors = makeSensors(25);
    renderHook(() => useLiveMonitoringSchedule({ active: true, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('advances exactly one Sensor per 3s tick - single active cycle, no burst', async () => {
    const sensors = makeSensors(25);
    renderHook(() => useLiveMonitoringSchedule({ active: true, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // tick 1 (Sensor 1)
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000); // tick 2 (Sensor 2)
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000); // tick 3 (Sensor 3)
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 25 Sensors x 20 ticks/min sustained = the documented 20 req/min, not
    // a 25-at-once burst - confirmed here at the 3-tick mark already: never
    // more than 1 call per elapsed 3s window.
  });

  it('rotates through Sensor ids in order and wraps around', async () => {
    const sensors = makeSensors(3);
    renderHook(() => useLiveMonitoringSchedule({ active: true, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }), {
      wrapper: makeWrapper(),
    });
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(i === 0 ? 0 : 3_000);
      });
    }
    const calledSensorIds = fetchMock.mock.calls.map((call) => call[1].sensorId);
    expect(calledSensorIds).toEqual([1, 2, 3, 1]);
  });

  it('does not start a new cycle while the previous fetch is still in flight, even past the interval', async () => {
    let resolveFirst!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = () => resolve([]))));
    const sensors = makeSensors(5);
    renderHook(() => useLiveMonitoringSchedule({ active: true, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Well past the 3s interval, but the first fetch never resolved - no
    // second call must have been dispatched (no overlapping cycle).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Once it resolves, the next tick is scheduled immediately (elapsed
    // already exceeded the interval), not stacked/duplicated.
    fetchMock.mockResolvedValue([]);
    await act(async () => {
      resolveFirst();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not poll at all while inactive (paused or hidden tab)', async () => {
    const sensors = makeSensors(5);
    renderHook(() => useLiveMonitoringSchedule({ active: false, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resuming from inactive triggers exactly one immediate tick, not every pending Sensor at once', async () => {
    const sensors = makeSensors(25);
    const { rerender } = renderHook(
      ({ active }) => useLiveMonitoringSchedule({ active, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }),
      { wrapper: makeWrapper(), initialProps: { active: false } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ active: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops scheduling further ticks after unmount (route change) - no leaked timer', async () => {
    const sensors = makeSensors(5);
    const { unmount } = renderHook(
      () => useLiveMonitoringSchedule({ active: true, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a 429 enters a shared cooldown and skips the normal 3s schedule until it expires', async () => {
    fetchMock.mockRejectedValueOnce(new ApiError({ status: 429, message: 'Too many requests', retryAfterSeconds: 10, raw: null }));
    fetchMock.mockResolvedValue([]);
    const sensors = makeSensors(5);
    const { result } = renderHook(
      () => useLiveMonitoringSchedule({ active: true, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.cooldownUntil).not.toBeNull();

    // Well before the 10s Retry-After expires, and well past the normal 3s
    // interval - must NOT have retried yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Past the 10s Retry-After - exactly one controlled refresh.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.cooldownUntil).toBeNull();
  });

  it('uses a bounded fallback backoff when a 429 has no Retry-After header', async () => {
    fetchMock.mockRejectedValueOnce(new ApiError({ status: 429, message: 'Too many requests', raw: null }));
    fetchMock.mockResolvedValue([]);
    const sensors = makeSensors(5);
    const { result } = renderHook(
      () => useLiveMonitoringSchedule({ active: true, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.cooldownUntil).not.toBeNull();
    // computeFallbackBackoffMs(1) === 5_000 - confirmed by the dedicated
    // pure-function tests above; this just checks the hook actually uses it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_900);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a non-429 (partial Sensor) failure does not stop the rotation for the rest', async () => {
    fetchMock.mockRejectedValueOnce(new ApiError({ status: 500, message: 'boom', raw: null }));
    fetchMock.mockResolvedValue([]);
    const sensors = makeSensors(3);
    renderHook(() => useLiveMonitoringSchedule({ active: true, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refreshNow triggers an immediate extra tick without waiting for the rest of the current interval', async () => {
    const sensors = makeSensors(5);
    const { result } = renderHook(
      () => useLiveMonitoringSchedule({ active: true, deviceId: 1, sensors, periods: 20, intervalMs: 3_000 }),
      { wrapper: makeWrapper() },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refreshNow();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing when there are no Sensors to rotate through', async () => {
    renderHook(() => useLiveMonitoringSchedule({ active: true, deviceId: 1, sensors: [], periods: 20, intervalMs: 3_000 }), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
