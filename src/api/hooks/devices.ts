import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type DeviceDto = components['schemas']['DeviceDto'];
export type CreateDeviceRequest = components['schemas']['CreateDeviceRequest'];
export type UpdateDeviceRequest = components['schemas']['UpdateDeviceRequest'];

export function useDevices() {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Devices', { signal })),
  });
}

export function useDevice(deviceId: number | undefined) {
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

/** Convenience wrapper for the common "just disable it" action - there is no delete endpoint (see the modernization audit, §7). */
export function useDisableDevice(deviceId: number) {
  const update = useUpdateDevice(deviceId);
  return {
    ...update,
    disable: () => update.mutateAsync({ enabled: false }),
  };
}
