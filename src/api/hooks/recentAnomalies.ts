import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';

/** Most Sensors one call may name (the largest page of Live Monitoring). */
const MAX_SENSORS = 50;
/** How many of a level's newest values count - what the card's chart shows. */
export const CARD_VALUES = 20;

/**
 * Which aggregation levels of the Sensors on screen have an anomaly among their newest values - ONE request for the whole page (the raw readings' anomalies are
 * in the cards' own data). Only while "Highlight anomalies" is on.
 */
export function useRecentLevelAnomalies(deviceId: number | undefined, sensorIds: readonly number[], enabled: boolean, refetchMs: number | undefined) {
  const ids = [...sensorIds].sort((a, b) => a - b).slice(0, MAX_SENSORS);
  return useQuery({
    queryKey: ['recent-level-anomalies', deviceId ?? -1, ids.join(',')] as const,
    enabled: enabled && deviceId !== undefined && ids.length > 0,
    refetchInterval: refetchMs,
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/AggregationPolicies/RecentAnomalies', {
          params: { path: { deviceId: deviceId! }, query: { sensorIds: ids, buckets: CARD_VALUES } },
          signal,
        }),
      ),
  });
}
