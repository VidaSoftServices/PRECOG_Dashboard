import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type SensorDescriptionDto = components['schemas']['SensorDescriptionDto'];
export type DeviceSensorDescriptionDto = components['schemas']['DeviceSensorDescriptionDto'];
export type UpdateSensorDescriptionsRequest = components['schemas']['UpdateSensorDescriptionsRequest'];
export type ImportSensorDescriptionItem = components['schemas']['ImportSensorDescriptionItem'];

/**
 * The descriptions of ONE Sensor (at most one per language), stored by the API. Any level with access to the Device may read them. The text is
 * markdown and only ever rendered as formatted text. A failed read simply means "no description": nothing is shown (see useSensorDescriptions).
 */
export function useSensorDescriptionTexts(deviceId: number | undefined, sensorId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.sensorDescriptions(deviceId ?? -1, sensorId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}/Descriptions', {
          params: { path: { deviceId: deviceId!, sensorId: sensorId! } },
          signal,
        }),
      ),
    enabled: enabled && deviceId !== undefined && sensorId !== undefined,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** Admin: set or remove the English and Hungarian description of one Sensor (the Sensor edit dialog). A blank text removes that language. */
export function useUpdateSensorDescriptions(deviceId: number, sensorId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateSensorDescriptionsRequest) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}/Sensors/{sensorId}/Descriptions', {
          params: { path: { deviceId, sensorId } },
          body,
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.sensorDescriptions(deviceId, sensorId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.deviceDescriptions(deviceId) });
    },
  });
}

/** Admin: every description of the Device (what the export writes, and how many there are). Read when the Descriptions dialog opens. */
export function useDeviceDescriptions(deviceId: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.deviceDescriptions(deviceId),
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.GET('/api/Devices/{deviceId}/SensorDescriptions', { params: { path: { deviceId } }, signal })),
    enabled,
    staleTime: 0,
  });
}

/** Admin: import (upsert) many descriptions at once; what is not in the request stays. */
export function useImportDescriptions(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: ImportSensorDescriptionItem[]) =>
      unwrap(await apiClient.POST('/api/Devices/{deviceId}/SensorDescriptions', { params: { path: { deviceId } }, body: { items } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', deviceId, 'sensors'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.deviceDescriptions(deviceId) });
    },
  });
}

/** Admin: remove every description of the Device. */
export function useDeleteDescriptions(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await apiClient.DELETE('/api/Devices/{deviceId}/SensorDescriptions', { params: { path: { deviceId } } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', deviceId, 'sensors'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.deviceDescriptions(deviceId) });
    },
  });
}
