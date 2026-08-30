import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap, ApiError } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type DevicePrincipalDto = components['schemas']['DevicePrincipalDto'];
export type ProvisionDevicePrincipalResponse = components['schemas']['ProvisionDevicePrincipalResponse'];

/** Returns null (not an error state) when no principal has been provisioned yet - a real, expected condition, not a failure. */
export function useDevicePrincipal(deviceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.devicePrincipal(deviceId ?? -1),
    queryFn: async ({ signal }) => {
      try {
        return unwrap(
          await apiClient.GET('/api/Devices/{deviceId}/Principal', {
            params: { path: { deviceId: deviceId! } },
            signal,
          }),
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: deviceId !== undefined,
  });
}

export function useProvisionDevicePrincipal(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(await apiClient.POST('/api/Devices/{deviceId}/Principal/Provision', { params: { path: { deviceId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.devicePrincipal(deviceId) }),
  });
}

export function useRotateDevicePrincipalCredential(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(await apiClient.POST('/api/Devices/{deviceId}/Principal/Rotate', { params: { path: { deviceId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.devicePrincipal(deviceId) }),
  });
}

export function useRevokeDevicePrincipalCredential(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credentialId: number) =>
      unwrap(
        await apiClient.POST('/api/Devices/{deviceId}/Principal/Credentials/{credentialId}/Revoke', {
          params: { path: { deviceId, credentialId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.devicePrincipal(deviceId) }),
  });
}

export function useSetDevicePrincipalEnabled(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}/Principal/Enabled', {
          params: { path: { deviceId } },
          body: { enabled },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.devicePrincipal(deviceId) }),
  });
}
