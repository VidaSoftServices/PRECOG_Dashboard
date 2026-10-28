import { useQuery, type QueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

/** A Setpoint interval together with the Sensor it belongs to (the Device-wide listing). */
export type DeviceSetpointDto = components['schemas']['DeviceSetpointDto'];

async function getDeviceSetpoints(deviceId: number, signal?: AbortSignal) {
  return unwrap(await apiClient.GET('/api/Devices/{deviceId}/Setpoints', { params: { path: { deviceId } }, signal }));
}

async function getDeviceAggregationPolicies(deviceId: number, signal?: AbortSignal) {
  return unwrap(await apiClient.GET('/api/Devices/{deviceId}/AggregationPolicies', { params: { path: { deviceId } }, signal }));
}

/**
 * Every Setpoint interval of every Sensor of the Device in one request. Always re-read when the component mounts: an export or the
 * diff of an import must start from what is stored now, not from a cache.
 */
export function useDeviceSetpoints(deviceId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.deviceSetpoints(deviceId ?? -1),
    queryFn: ({ signal }) => getDeviceSetpoints(deviceId!, signal),
    enabled: enabled && deviceId !== undefined,
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 0,
  });
}

/** Fresh read for an action (a download): bypasses the cache. */
export function fetchDeviceSetpoints(queryClient: QueryClient, deviceId: number, signal?: AbortSignal) {
  return queryClient.fetchQuery({ queryKey: queryKeys.deviceSetpoints(deviceId), queryFn: () => getDeviceSetpoints(deviceId, signal), staleTime: 0 });
}

/** Fresh read of every aggregation policy of every Sensor of the Device (one request), for the Sensor export. */
export function fetchDeviceAggregationPolicies(queryClient: QueryClient, deviceId: number, signal?: AbortSignal) {
  return queryClient.fetchQuery({ queryKey: queryKeys.deviceAggregationPolicies(deviceId), queryFn: () => getDeviceAggregationPolicies(deviceId, signal), staleTime: 0 });
}
