import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type SetpointDto = components['schemas']['SetpointDto'];
export type CreateSetpointRequest = components['schemas']['CreateSetpointRequest'];

export function useSetpoints(deviceId: number | undefined, sensorId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.setpoints(deviceId ?? -1, sensorId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}/Setpoints', {
          params: { path: { deviceId: deviceId!, sensorId: sensorId! } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined && sensorId !== undefined,
  });
}

export function useEffectiveSetpoint(deviceId: number | undefined, sensorId: number | undefined, at?: string) {
  return useQuery({
    queryKey: queryKeys.effectiveSetpoint(deviceId ?? -1, sensorId ?? -1, at),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}/Setpoints/Effective', {
          params: { path: { deviceId: deviceId!, sensorId: sensorId! }, query: at ? { at } : undefined },
          signal,
        }),
      ),
    enabled: deviceId !== undefined && sensorId !== undefined,
    retry: false, // 404 = "no effective setpoint" is an expected outcome, not a transient failure
  });
}

export function useCreateSetpoint(deviceId: number, sensorId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateSetpointRequest) =>
      unwrap(
        await apiClient.POST('/api/Devices/{deviceId}/Sensors/{sensorId}/Setpoints', {
          params: { path: { deviceId, sensorId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.setpoints(deviceId, sensorId) }),
  });
}
