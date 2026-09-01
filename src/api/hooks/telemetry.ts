import { useQuery, type QueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';
import { toApiIso } from '@/lib/dateTime';

export type TelemetryFamily = 'continuous' | 'periodic' | 'bidirectionalContinuous' | 'bidirectionalPeriodic';

/**
 * One normalized point shape for every telemetry family, used by the shared
 * chart components (see src/components/charts). Curve/BiCurve reads come
 * back as {sensorId, curvePeriod, outputData:[...]} wrapper arrays (one
 * curve run has many points); Signal/BiSignal reads come back flat, one
 * point per Period. Both are flattened into this one shape here, once, so
 * nothing downstream needs to know which family it's looking at.
 */
export interface TelemetryPoint {
  sensorId: number;
  curvePeriod?: number;
  period?: number;
  measured?: string;
  actual?: number | null;
  target?: number | null;
  tolerance?: number | null;
  targetAbove?: number | null;
  toleranceAbove?: number | null;
  targetBelow?: number | null;
  toleranceBelow?: number | null;
  upperControlLimit3S?: number | null;
  upperControlLimit2S?: number | null;
  lowerControlLimit2S?: number | null;
  lowerControlLimit3S?: number | null;
  analysed?: boolean;
  anomaly?: number | null;
  anomalyAbove?: number | null;
  anomalyBelow?: number | null;
}

export function isBidirectionalFamily(family: TelemetryFamily): boolean {
  return family === 'bidirectionalContinuous' || family === 'bidirectionalPeriodic';
}

export function isCurveFamily(family: TelemetryFamily): boolean {
  return family === 'periodic' || family === 'bidirectionalPeriodic';
}

function normalizeFlat(
  sensorId: number,
  rows: (components['schemas']['SignalOutputData'] | components['schemas']['BiSignalOutputData'])[],
): TelemetryPoint[] {
  return rows.map((row) => ({ ...row, sensorId, period: row.period ?? undefined }));
}

function normalizeCurve(
  rows: (components['schemas']['CurveOutputData'] | components['schemas']['BiCurveOutputData'])[],
): TelemetryPoint[] {
  return rows.flatMap((run) =>
    (run.outputData ?? []).map((point) => ({
      ...point,
      sensorId: run.sensorId!,
      curvePeriod: run.curvePeriod ?? undefined,
      period: point.period ?? undefined,
    })),
  );
}

interface TrailingArgs {
  family: TelemetryFamily;
  deviceId: number | undefined;
  sensorId: number | undefined;
  periods: number;
}

/**
 * The actual GET call, extracted from the hook below so Live Monitoring's
 * own orchestrator (`useLiveMonitoringSchedule.ts`) can trigger exactly the
 * same fetch imperatively via `queryClient.fetchQuery` - never a second,
 * divergent copy of this request-building logic, and never a raw `fetch`
 * (AGENTS.md: all API access goes through `apiClient`).
 *
 * `endDate` is deliberately not a caller-supplied argument - "trailing
 * periods" always means ending *now*, computed fresh at the moment this
 * actually runs, and is intentionally NOT part of the cache key (see
 * `queryKeys.ts`'s `telemetryTrailing` comment): a real bug this rewrite
 * fixed had it in both the request and the key, so every render produced a
 * logically "new" query the cache had never seen before, each one eligible
 * to auto-fetch on its own.
 */
async function fetchTelemetryTrailingPeriods(
  { family, deviceId, sensorId, periods }: TrailingArgs,
  signal?: AbortSignal,
): Promise<TelemetryPoint[]> {
  const endDate = toApiIso(new Date());
  if (isBidirectionalFamily(family)) {
    const data = unwrap(
      await apiClient.GET('/api/BiDirectionalContinuous/MeasuredTrailingPeriods', {
        params: { query: { deviceId, sensorId, endDate, periods } },
        signal,
      }),
    );
    return normalizeFlat(sensorId!, data);
  }
  const data = unwrap(
    await apiClient.GET('/api/Continuous/MeasuredTrailingPeriods', {
      params: { query: { deviceId, sensorId, endDate, periods } },
      signal,
    }),
  );
  return normalizeFlat(sensorId!, data);
}

/**
 * The one supported "bounded latest value" mechanism (decision #8):
 * MeasuredTrailingPeriods with a small `periods` count. There is no
 * dedicated single-reading endpoint - periods=1 is the efficient path,
 * confirmed adequate rather than a missing capability. Only meaningful for
 * the two continuous families - Periodic Devices have no trailing-periods
 * concept (curve runs aren't a regular clock tick), so Live Monitoring for a
 * Periodic Device instead shows its most recent curve run (see
 * useTelemetryPeriodRange with the family's Last(Analysed)CurvePeriod).
 *
 * Deliberately PASSIVE - never triggers its own fetch
 * (`enabled`/`refetchInterval`/`refetchOnWindowFocus`/`refetchOnReconnect`/
 * `retry` are all off/false unconditionally). Every real Live Monitoring
 * telemetry request is dispatched by exactly one place,
 * `useLiveMonitoringSchedule.ts`'s orchestrator, via `queryClient.fetchQuery`
 * for one Sensor at a time - this hook only *subscribes* to whatever that
 * orchestrator last wrote into the cache for this Sensor's query key, so
 * `SensorLiveCard` keeps its familiar `data`/`isLoading`/`isFetching`/`error`
 * shape without 25 independent components each deciding for themselves when
 * to hit the network. See CLAUDE.md's "Live Monitoring" section for the full
 * rate-limit math this design is built around.
 */
export function useTelemetryTrailingPeriods({ family, deviceId, sensorId, periods }: TrailingArgs) {
  return useQuery({
    queryKey: queryKeys.telemetryTrailing(family, deviceId ?? -1, sensorId ?? -1, periods),
    queryFn: ({ signal }) => fetchTelemetryTrailingPeriods({ family, deviceId, sensorId, periods }, signal),
    enabled: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/**
 * Imperative counterpart used only by `useLiveMonitoringSchedule.ts`'s
 * orchestrator: fetches (and, on success, caches under the exact same key
 * `useTelemetryTrailingPeriods` reads) one Sensor's trailing periods right
 * now. Throws the normalized `ApiError` on failure - including a 429, which
 * the orchestrator inspects directly for `Retry-After`-driven cooldown.
 *
 * `retry: false` here is load-bearing, not a stylistic default override -
 * `queryClient.fetchQuery` otherwise inherits `queryClient.ts`'s global
 * `shouldRetry`/`retryDelay` defaults (retry-once-after-Retry-After on a
 * 429), which would silently retry *inside* this call, on its own timer,
 * before the orchestrator's own catch block ever runs. That is a second,
 * uncoordinated per-Sensor retry racing the orchestrator's single shared
 * cooldown - confirmed empirically (a mocked-browser rate-limit run showed
 * a duplicate real request for the *same* Sensor a moment after its first
 * 429, which the rotation logic itself never does - it always advances to
 * the next Sensor).
 *
 * `staleTime: 0` is equally load-bearing. `fetchQuery` otherwise inherits
 * the global `staleTime: 15_000` (`queryClient.ts`) and, per TanStack
 * Query's own documented `fetchQuery` behavior, silently returns the
 * existing cached value *without calling queryFn at all* whenever that
 * cache is still fresh - no network request, and `dataUpdatedAt` stays at
 * the original fetch time. The orchestrator's rotation restarts at index 0
 * every time its effect (re)mounts (pause/resume, route away/back, Device
 * switch), so without this override, resuming or returning to the page
 * within 15s of Sensor 1's last real fetch produced a "successful" tick
 * that never actually touched the network - confirmed empirically (a
 * mocked-browser pass showed 0 requests on resume and rotation appearing
 * "stuck" after navigating away and back). The orchestrator is the sole
 * authority over when a fetch happens for this polling path (CLAUDE.md's
 * "Live Monitoring" section - the 3-second cadence is meaningless if a
 * "tick" can silently no-op); every other `useQuery` in the app keeps the
 * sensible global staleTime.
 */
export function fetchAndCacheTelemetryTrailingPeriods(
  queryClient: QueryClient,
  args: TrailingArgs,
  signal?: AbortSignal,
) {
  return queryClient.fetchQuery({
    queryKey: queryKeys.telemetryTrailing(args.family, args.deviceId ?? -1, args.sensorId ?? -1, args.periods),
    queryFn: () => fetchTelemetryTrailingPeriods(args, signal),
    retry: false,
    staleTime: 0,
  });
}

interface PeriodRangeArgs {
  family: TelemetryFamily;
  deviceId: number | undefined;
  sensorId: number | undefined;
  periodFrom: number;
  periodTo: number;
  skip?: number;
  take?: number;
}

export function useTelemetryPeriodRange({ family, deviceId, sensorId, periodFrom, periodTo, skip, take }: PeriodRangeArgs) {
  return useQuery({
    queryKey: queryKeys.telemetryPeriodRange(family, deviceId ?? -1, sensorId ?? -1, periodFrom, periodTo),
    queryFn: async ({ signal }): Promise<TelemetryPoint[]> => {
      switch (family) {
        case 'continuous':
          return normalizeFlat(
            sensorId!,
            unwrap(
              await apiClient.GET('/api/Continuous/PeriodRange', {
                params: { query: { deviceId, sensorId, periodFrom, periodTo, skip, take } },
                signal,
              }),
            ),
          );
        case 'bidirectionalContinuous':
          return normalizeFlat(
            sensorId!,
            unwrap(
              await apiClient.GET('/api/BiDirectionalContinuous/PeriodRange', {
                params: { query: { deviceId, sensorId, periodFrom, periodTo, skip, take } },
                signal,
              }),
            ),
          );
        case 'periodic':
          return normalizeCurve(
            unwrap(
              await apiClient.GET('/api/Periodic/CurvePeriodRange', {
                params: {
                  query: { deviceId, sensorId, curvePeriodFrom: periodFrom, curvePeriodTo: periodTo, skip, take },
                },
                signal,
              }),
            ),
          );
        case 'bidirectionalPeriodic':
          return normalizeCurve(
            unwrap(
              await apiClient.GET('/api/BiDirectionalPeriodic/CurvePeriodRange', {
                params: {
                  query: { deviceId, sensorId, curvePeriodFrom: periodFrom, curvePeriodTo: periodTo, skip, take },
                },
                signal,
              }),
            ),
          );
      }
    },
    enabled: deviceId !== undefined && sensorId !== undefined,
  });
}

interface DateRangeArgs {
  family: TelemetryFamily;
  deviceId: number | undefined;
  sensorId: number | undefined;
  startDate: string;
  endDate: string;
  skip?: number;
  take?: number;
}

/** The primary read for Smart Analytics - a human-picked wall-clock time range, not period numbers. Server clamps the span (documented MaxQueryRangeDays); a 400 here surfaces as a normal ErrorState, not a special case. */
export function useTelemetryDateRange({ family, deviceId, sensorId, startDate, endDate, skip, take }: DateRangeArgs) {
  return useQuery({
    queryKey: queryKeys.telemetryDateRange(family, deviceId ?? -1, sensorId ?? -1, startDate, endDate),
    queryFn: async ({ signal }): Promise<TelemetryPoint[]> => {
      switch (family) {
        case 'continuous':
          return normalizeFlat(
            sensorId!,
            unwrap(
              await apiClient.GET('/api/Continuous/MeasuredDateRange', {
                params: { query: { deviceId, sensorId, startDate, endDate, skip, take } },
                signal,
              }),
            ),
          );
        case 'bidirectionalContinuous':
          return normalizeFlat(
            sensorId!,
            unwrap(
              await apiClient.GET('/api/BiDirectionalContinuous/MeasuredDateRange', {
                params: { query: { deviceId, sensorId, startDate, endDate, skip, take } },
                signal,
              }),
            ),
          );
        case 'periodic':
          return normalizeCurve(
            unwrap(
              await apiClient.GET('/api/Periodic/CurveMeasuredDateRange', {
                params: { query: { deviceId, sensorId, startDate, endDate, skip, take } },
                signal,
              }),
            ),
          );
        case 'bidirectionalPeriodic':
          return normalizeCurve(
            unwrap(
              await apiClient.GET('/api/BiDirectionalPeriodic/CurveMeasuredDateRange', {
                params: { query: { deviceId, sensorId, startDate, endDate, skip, take } },
                signal,
              }),
            ),
          );
      }
    },
    enabled: deviceId !== undefined && sensorId !== undefined,
  });
}

export function useLastPeriod(family: TelemetryFamily, deviceId: number | undefined, sensorId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.telemetryLastPeriod(family, deviceId ?? -1, sensorId ?? -1),
    queryFn: async ({ signal }): Promise<number | null> => {
      switch (family) {
        case 'continuous':
          return unwrap(await apiClient.GET('/api/Continuous/LastPeriod', { params: { query: { deviceId, sensorId } }, signal }));
        case 'bidirectionalContinuous':
          return unwrap(
            await apiClient.GET('/api/BiDirectionalContinuous/LastPeriod', { params: { query: { deviceId, sensorId } }, signal }),
          );
        case 'periodic':
          return unwrap(
            await apiClient.GET('/api/Periodic/LastCurvePeriod', { params: { query: { deviceId, sensorId } }, signal }),
          );
        case 'bidirectionalPeriodic':
          return unwrap(
            await apiClient.GET('/api/BiDirectionalPeriodic/LastCurvePeriod', {
              params: { query: { deviceId, sensorId } },
              signal,
            }),
          );
      }
    },
    enabled: deviceId !== undefined && sensorId !== undefined,
  });
}

/** Direction now lives on the Sensor, never the Device - see the modernization audit's migration matrix. */
export function familyFor(applicationMode: 'continuous' | 'periodic', direction: string | undefined | null): TelemetryFamily {
  const bidirectional = direction === 'bidirectional';
  if (applicationMode === 'continuous') return bidirectional ? 'bidirectionalContinuous' : 'continuous';
  return bidirectional ? 'bidirectionalPeriodic' : 'periodic';
}
