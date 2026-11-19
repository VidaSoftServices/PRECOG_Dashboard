import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type SensorAggregationPolicyDto = components['schemas']['SensorAggregationPolicyDto'];
export type CreateAggregationPolicyRequest = components['schemas']['CreateAggregationPolicyRequest'];
export type UpdateAggregationPolicyRequest = components['schemas']['UpdateAggregationPolicyRequest'];

export function useAggregationPolicies(deviceId: number | undefined, sensorId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.aggregationPolicies(deviceId ?? -1, sensorId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}/AggregationPolicies', {
          params: { path: { deviceId: deviceId!, sensorId: sensorId! } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined && sensorId !== undefined,
  });
}

export function useCreateAggregationPolicy(deviceId: number, sensorId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateAggregationPolicyRequest) =>
      unwrap(
        await apiClient.POST('/api/Devices/{deviceId}/Sensors/{sensorId}/AggregationPolicies', {
          params: { path: { deviceId, sensorId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.aggregationPolicies(deviceId, sensorId) }),
  });
}

export function useUpdateAggregationPolicy(deviceId: number, sensorId: number, policyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateAggregationPolicyRequest) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}/Sensors/{sensorId}/AggregationPolicies/{policyId}', {
          params: { path: { deviceId, sensorId, policyId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.aggregationPolicies(deviceId, sensorId) }),
  });
}

export function useDeactivateAggregationPolicy(deviceId: number, sensorId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (policyId: number) =>
      unwrap(
        await apiClient.DELETE('/api/Devices/{deviceId}/Sensors/{sensorId}/AggregationPolicies/{policyId}', {
          params: { path: { deviceId, sensorId, policyId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.aggregationPolicies(deviceId, sensorId) }),
  });
}

export type BulkCreateAggregationPoliciesRequest = components['schemas']['BulkCreateAggregationPoliciesRequest'];
export type BulkDeactivateAggregationPoliciesRequest = components['schemas']['BulkDeactivateAggregationPoliciesRequest'];
export type BulkAggregationResultDto = components['schemas']['BulkAggregationResultDto'];
export type AggregatedValueDto = components['schemas']['AggregatedValueDto'];

/** Every policy query of the Device: the Device-wide list and each Sensor's own (they all live under the Device's Sensor keys). */
function invalidateDevicePolicies(queryClient: ReturnType<typeof useQueryClient>, deviceId: number) {
  queryClient.invalidateQueries({ queryKey: queryKeys.deviceAggregationPolicies(deviceId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) });
}

/**
 * Gives the same aggregation level (time scale + function, source always the measured value) to many Sensors of a Device in ONE request
 * (`POST /api/Devices/{deviceId}/AggregationPolicies`, Admin; omit `sensorIds` for every Sensor). One transaction on the server; the result
 * lists, per Sensor, Created / Reactivated / Exists / NotFound. The API's aggregation engine then calculates the buckets in the background.
 */
export function useBulkCreateAggregationPolicies(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BulkCreateAggregationPoliciesRequest) =>
      unwrap(await apiClient.POST('/api/Devices/{deviceId}/AggregationPolicies', { params: { path: { deviceId } }, body })),
    onSuccess: () => invalidateDevicePolicies(queryClient, deviceId),
  });
}

/** Deactivates the same non-raw level for many Sensors of a Device in one request (`POST .../AggregationPolicies/Deactivate`, Admin). */
export function useBulkDeactivateAggregationPolicies(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BulkDeactivateAggregationPoliciesRequest) =>
      unwrap(await apiClient.POST('/api/Devices/{deviceId}/AggregationPolicies/Deactivate', { params: { path: { deviceId } }, body })),
    onSuccess: () => invalidateDevicePolicies(queryClient, deviceId),
  });
}

/**
 * The newest calculated buckets of one policy (`GET .../AggregationPolicies/{policyId}/Values`, bounded by `take`), oldest first within the
 * window. The window is the last `hours` hours up to now; the newest bucket may still be open. Disabled for the raw policy (it has no buckets).
 */
export function usePolicyValues(deviceId: number, sensorId: number, policyId: number, enabled: boolean, hours = 24, take = 12) {
  return useQuery({
    queryKey: [...queryKeys.aggregationPolicy(deviceId, sensorId, policyId), 'values', hours, take] as const,
    queryFn: async ({ signal }) => {
      const to = new Date();
      const from = new Date(to.getTime() - hours * 3_600_000);
      const rows = unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}/AggregationPolicies/{policyId}/Values', {
          params: { path: { deviceId, sensorId, policyId }, query: { from: from.toISOString(), to: to.toISOString(), take: 5000 } },
          signal,
        }),
      );
      return rows.slice(-take);
    },
    enabled,
    refetchInterval: 30_000,
  });
}

export type AggregationLevelRef = components['schemas']['AggregationLevelRef'];
export type AggregationLevelDeletionDto = components['schemas']['AggregationLevelDeletionDto'];

/**
 * What a PERMANENT deletion of these aggregation levels would delete (`POST .../AggregationPolicies/DeletionPreview`, Admin; changes nothing): per level its
 * buckets, Issues and reviewed Issues, and why a level would be refused (raw, in a knowledge share, an Ollama job busy, not found). Null levels = disabled.
 */
export function useAggregationLevelDeletionPreview(deviceId: number, levels: AggregationLevelRef[] | null) {
  return useQuery({
    queryKey: ['devices', deviceId, 'aggregation-deletion-preview', levels] as const,
    enabled: levels !== null && levels.length > 0,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.POST('/api/Devices/{deviceId}/AggregationPolicies/DeletionPreview', {
          params: { path: { deviceId } },
          body: { levels: levels!, confirm: false },
          signal,
        }),
      ),
  });
}

/**
 * Deletes aggregation levels PERMANENTLY - the level, its buckets and the Issues it raised (`POST .../AggregationPolicies/Delete` with `confirm: true`, Admin).
 * Refreshes the Device's levels, its Sensors, its Issues and its training requests (deleting a reviewed Issue schedules retraining).
 */
export function useDeleteAggregationLevels(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (levels: AggregationLevelRef[]) =>
      unwrap(await apiClient.POST('/api/Devices/{deviceId}/AggregationPolicies/Delete', { params: { path: { deviceId } }, body: { levels, confirm: true } })),
    onSuccess: () => {
      invalidateDevicePolicies(queryClient, deviceId);
      queryClient.invalidateQueries({ queryKey: ['devices', deviceId, 'sensors'] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['training'] });
    },
  });
}
