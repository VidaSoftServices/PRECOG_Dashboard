import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type ServerDto = components['schemas']['ServerDto'];
export type SaveServerRequest = components['schemas']['SaveServerRequest'];

/** The PRECOG servers of the caller's Company (Admins and Readers may read; only Admins change the registry). */
export function useServers() {
  return useQuery({
    queryKey: queryKeys.servers,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Servers', { signal })),
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SaveServerRequest) => unwrap(await apiClient.POST('/api/Servers', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.servers }),
  });
}

export function useUpdateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serverId, body }: { serverId: number; body: SaveServerRequest }) =>
      unwrap(await apiClient.PUT('/api/Servers/{serverId}', { params: { path: { serverId } }, body })),
    // the Devices list shows the server's name, so it is refreshed with it
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.servers });
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

export function useDeleteServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (serverId: number) => unwrap(await apiClient.DELETE('/api/Servers/{serverId}', { params: { path: { serverId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.servers }),
  });
}

/** Says which server a Device lives on (null takes it off every server). */
export function useAssignDeviceServer(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (serverId: number | null) =>
      unwrap(await apiClient.PUT('/api/Devices/{deviceId}/Server', { params: { path: { deviceId } }, body: { serverId } })),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.device(deviceId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
      queryClient.invalidateQueries({ queryKey: queryKeys.servers });
    },
  });
}
