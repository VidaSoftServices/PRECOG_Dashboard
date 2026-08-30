import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type LocationDto = components['schemas']['LocationDto'];
export type DeviceGroupDto = components['schemas']['DeviceGroupDto'];
export type DeviceClassDto = components['schemas']['DeviceClassDto'];

export function useLocations() {
  return useQuery({
    queryKey: queryKeys.locations,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Locations', { signal })),
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: components['schemas']['CreateLocationRequest']) =>
      unwrap(await apiClient.POST('/api/Locations', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.locations }),
  });
}

export function useUpdateLocation(locationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: components['schemas']['UpdateLocationRequest']) =>
      unwrap(await apiClient.PUT('/api/Locations/{locationId}', { params: { path: { locationId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.locations }),
  });
}

export function useDeviceGroups() {
  return useQuery({
    queryKey: queryKeys.deviceGroups,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/DeviceGroups', { signal })),
  });
}

export function useCreateDeviceGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: components['schemas']['CreateDeviceGroupRequest']) =>
      unwrap(await apiClient.POST('/api/DeviceGroups', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.deviceGroups }),
  });
}

export function useAddDeviceGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, deviceId }: { groupId: number; deviceId: number }) =>
      unwrap(
        await apiClient.PUT('/api/DeviceGroups/{groupId}/Members/{deviceId}', { params: { path: { groupId, deviceId } } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.deviceGroups }),
  });
}

export function useRemoveDeviceGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, deviceId }: { groupId: number; deviceId: number }) =>
      unwrap(
        await apiClient.DELETE('/api/DeviceGroups/{groupId}/Members/{deviceId}', {
          params: { path: { groupId, deviceId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.deviceGroups }),
  });
}

export function useDeviceClasses() {
  return useQuery({
    queryKey: queryKeys.deviceClasses,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/DeviceClasses', { signal })),
  });
}
