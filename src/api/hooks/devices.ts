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

/** Convenience wrapper for the common "just disable it" action - there is no delete endpoint (see the modernization audit, §7). */
export function useDisableDevice(deviceId: number) {
  const update = useUpdateDevice(deviceId);
  return {
    ...update,
    disable: () => update.mutateAsync({ enabled: false }),
  };
}
