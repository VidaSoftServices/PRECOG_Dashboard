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
