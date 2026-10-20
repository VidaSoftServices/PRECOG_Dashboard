import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type DeviceDto = components['schemas']['DeviceDto'];
export type CreateDeviceRequest = components['schemas']['CreateDeviceRequest'];
export type UpdateDeviceRequest = components['schemas']['UpdateDeviceRequest'];
export type DeviceDeletionResult = components['schemas']['DeviceDeletionResultDto'];
export type DeviceDataDeletionResult = components['schemas']['DeviceDataDeletionResultDto'];

export function useDevices() {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Devices', { signal })),
  });
}

/**
 * One Device's master data, including `heartBeat` - the server's "last observed
 * activity" instant that the detail page renders as "Last heartbeat".
 *
 * `refetchIntervalMs` is opt-in and defaults to no polling, so every existing
 * caller keeps its current behaviour. Pass a value (from
 * `POLL_INTERVALS_MS`, never a literal) only on a screen that displays a value
 * which changes on its own while the page sits open.
 */
export function useDevice(deviceId: number | undefined, refetchIntervalMs?: number) {
  return useQuery({
    queryKey: queryKeys.device(deviceId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}', {
          params: { path: { deviceId: deviceId! } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined,
    refetchInterval: refetchIntervalMs ?? false,
  });
}

export function useCreateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateDeviceRequest) => unwrap(await apiClient.POST('/api/Devices', { body })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

export function useUpdateDevice(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateDeviceRequest) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}', {
          params: { path: { deviceId } },
          body,
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.device(deviceId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

/**
 * PERMANENTLY deletes the Device and everything of it (Admin only). The API requires the Device's name as confirmation
 * (`confirmDeviceName`) and checks it itself; it audits and logs the deletion. Only the device list is invalidated here -
 * the caller navigates away from the (now gone) Device's pages.
 */
export function useDeleteDevice(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (confirmDeviceName: string) =>
      unwrap(
        await apiClient.DELETE('/api/Devices/{deviceId}', {
          params: { path: { deviceId } },
          body: { confirmDeviceName },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

/**
 * PERMANENTLY deletes all data of the Device (Admin only): the telemetry of every Sensor and the aggregation derived from it,
 * plus the analysis built on it - Issues, models, training requests. The Device, its Sensors and settings, credentials and
 * share configuration stay. Same typed-name confirmation as `useDeleteDevice`, checked by the API. Everything that may
 * display that data is refetched afterwards.
 */
export function useDeleteDeviceData(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (confirmDeviceName: string) =>
      unwrap(
        await apiClient.DELETE('/api/Devices/{deviceId}/Data', {
          params: { path: { deviceId } },
          body: { confirmDeviceName },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['training'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.device(deviceId) });
    },
  });
}

/** Convenience wrapper for the common "just disable it" action - the non-destructive alternative to `useDeleteDevice`. */
export function useDisableDevice(deviceId: number) {
  const update = useUpdateDevice(deviceId);
  return {
    ...update,
    disable: () => update.mutateAsync({ enabled: false }),
  };
}
