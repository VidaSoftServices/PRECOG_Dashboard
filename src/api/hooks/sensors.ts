import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type SensorDto = components['schemas']['SensorDto'];
export type CreateSensorRequest = components['schemas']['CreateSensorRequest'];
export type UpdateSensorRequest = components['schemas']['UpdateSensorRequest'];

export function useSensors(deviceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.sensors(deviceId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors', {
          params: { path: { deviceId: deviceId! } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined,
  });
}

export function useSensor(deviceId: number | undefined, sensorId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.sensor(deviceId ?? -1, sensorId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}', {
          params: { path: { deviceId: deviceId!, sensorId: sensorId! } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined && sensorId !== undefined,
  });
}

export function useCreateSensor(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateSensorRequest) =>
      unwrap(
        await apiClient.POST('/api/Devices/{deviceId}/Sensors', {
          params: { path: { deviceId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) }),
  });
}

export function useUpdateSensor(deviceId: number, sensorId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateSensorRequest) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}/Sensors/{sensorId}', {
          params: { path: { deviceId, sensorId } },
          body,
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.sensor(deviceId, sensorId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) });
    },
  });
}
