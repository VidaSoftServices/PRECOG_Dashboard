import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import type { TelemetryPoint } from '@/api/hooks/telemetry';
import type { components } from '@/api/schema.generated';

type AggregatedValueDto = components['schemas']['AggregatedValueDto'];

/** Most buckets the API returns in one read. */
const MAX_BUCKETS = 5000;

/**
 * A calculated bucket as a chart point: its value at the START of the bucket. An aggregated bucket has no target, tolerance or control limits of
 * its own (the setpoint of a slice and the evaluation are the platform's business); only the value is drawn.
 */
export function bucketToPoint(sensorId: number, bucket: AggregatedValueDto): TelemetryPoint {
  return { sensorId, measured: bucket.bucketStart, actual: bucket.value ?? null };
}

export interface AggregatedPointsArgs {
  deviceId: number | undefined;
  sensorId: number | undefined;
  policyId: number | undefined;
  /**
   * Either the newest `count` buckets (a window of `count` x `bucketMs` up to now - Live Monitoring), or a wall-clock range (Smart Analytics; the buckets
   * that START inside it, at most 5,000, oldest first).
   */
  newest?: { count: number; bucketMs: number };
  range?: { startDate: string; endDate: string };
  enabled?: boolean;
  /** Re-read every so many ms (the newest bucket is recalculated continuously). */
  refetchMs?: number;
}

export function useAggregatedPoints({ deviceId, sensorId, policyId, newest, range, enabled = true, refetchMs }: AggregatedPointsArgs) {
  return useQuery({
    queryKey: ['aggregated-points', deviceId ?? -1, sensorId ?? -1, policyId ?? -1, newest ? `newest-${newest.count}` : (range?.startDate ?? ''), range?.endDate ?? ''] as const,
    queryFn: async ({ signal }): Promise<TelemetryPoint[]> => {
      const to = range ? new Date(range.endDate) : new Date();
      // A little more than count x length, so a gap at the start does not cost the oldest bucket.
      const from = range ? new Date(range.startDate) : new Date(to.getTime() - Math.ceil(newest!.count * 1.1) * newest!.bucketMs);
      const rows = unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}/AggregationPolicies/{policyId}/Values', {
          params: { path: { deviceId: deviceId!, sensorId: sensorId!, policyId: policyId! }, query: { from: from.toISOString(), to: to.toISOString(), take: MAX_BUCKETS } },
          signal,
        }),
      );
      const points = rows.map((r) => bucketToPoint(sensorId!, r));
      return newest ? points.slice(-newest.count) : points;
    },
    enabled: enabled && deviceId !== undefined && sensorId !== undefined && policyId !== undefined,
    refetchInterval: refetchMs,
  });
}
