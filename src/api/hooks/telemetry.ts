import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';

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
  endDate: string;
  periods: number;
  /** Refetches on the Live Monitoring cadence (decision #9) when true; off for Smart Analytics' one-shot historical reads. */
  live?: boolean;
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
 */
export function useTelemetryTrailingPeriods({ family, deviceId, sensorId, endDate, periods, live }: TrailingArgs) {
  const bidirectional = isBidirectionalFamily(family);
  return useQuery({
    queryKey: queryKeys.telemetryTrailing(family, deviceId ?? -1, sensorId ?? -1, endDate, periods),
    queryFn: async ({ signal }): Promise<TelemetryPoint[]> => {
      if (bidirectional) {
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
    },
    enabled: deviceId !== undefined && sensorId !== undefined && !isCurveFamily(family),
    refetchInterval: live ? POLL_INTERVALS_MS.liveCompactChart : false,
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
