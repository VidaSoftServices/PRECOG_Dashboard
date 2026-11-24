import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type ServerDto = components['schemas']['ServerDto'];
export type SaveServerRequest = components['schemas']['SaveServerRequest'];

/** The PRECOG servers of the caller's Company (Admins and Readers may read; only the platform administrator changes the registry). */
export function useServers() {
  return useQuery({
    queryKey: queryKeys.servers,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Servers', { signal })),
  });
}

/** The servers of any Company, for the platform administrator (VSSSysAdmin) who alone manages the registry. */
export function usePlatformServers(companyId: number) {
  return useQuery({
    queryKey: queryKeys.platformServers(companyId),
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.GET('/api/Platform/Companies/{companyId}/Servers', { params: { path: { companyId } }, signal })),
  });
}

/** After a registry change: the platform list, the Company's own (read) list and the Device lists (they show the server's name). */
function useRefreshServers(companyId: number) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.platformServers(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.servers });
    queryClient.invalidateQueries({ queryKey: queryKeys.devices });
  };
}

export function useCreatePlatformServer(companyId: number) {
  const refresh = useRefreshServers(companyId);
  return useMutation({
    mutationFn: async (body: SaveServerRequest) =>
      unwrap(await apiClient.POST('/api/Platform/Companies/{companyId}/Servers', { params: { path: { companyId } }, body })),
    onSuccess: refresh,
  });
}

export function useUpdatePlatformServer(companyId: number) {
  const refresh = useRefreshServers(companyId);
  return useMutation({
    mutationFn: async ({ serverId, body }: { serverId: number; body: SaveServerRequest }) =>
      unwrap(await apiClient.PUT('/api/Platform/Companies/{companyId}/Servers/{serverId}', { params: { path: { companyId, serverId } }, body })),
    onSuccess: refresh,
  });
}

export function useDeletePlatformServer(companyId: number) {
  const refresh = useRefreshServers(companyId);
  return useMutation({
    mutationFn: async (serverId: number) =>
      unwrap(await apiClient.DELETE('/api/Platform/Companies/{companyId}/Servers/{serverId}', { params: { path: { companyId, serverId } } })),
    onSuccess: refresh,
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
