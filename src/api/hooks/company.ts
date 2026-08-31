import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type CompanyDto = components['schemas']['CompanyDto'];
export type CompanyMemberDto = components['schemas']['CompanyMemberDto'];
export type ReaderDto = components['schemas']['ReaderDto'];
export type ReaderDeviceGrantDto = components['schemas']['ReaderDeviceGrantDto'];
export type EffectiveDeviceAccessDto = components['schemas']['EffectiveDeviceAccessDto'];

export function useCompany() {
  return useQuery({
    queryKey: queryKeys.company,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Company', { signal })),
  });
}

/** Gate any call on CompanyDto.nameEditable, not on profileSource alone - nameEditable already folds in the caller's own Admin permission (see CompanyDto's own doc comment). */
export function useUpdateCompanyName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      unwrap(await apiClient.PUT('/api/Company/Name', { body: { name } })),
    onSuccess: (updated) => queryClient.setQueryData(queryKeys.company, updated),
  });
}

export function useCompanyMembers() {
  return useQuery({
    queryKey: queryKeys.companyMembers,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Company/Members', { signal })),
  });
}

/** Assigning/revoking "Reader" also changes who Company_GetReaders returns, so both invalidate readers too - not just companyMembers - regardless of which role name was touched (a harmless extra refetch for an Admin-only role change, and correct for a Reader-role change). */
function invalidateMembership(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.companyMembers });
  queryClient.invalidateQueries({ queryKey: queryKeys.readers });
}

export function useAssignCompanyRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roleName }: { userId: number; roleName: 'Admin' | 'Reader' }) =>
      unwrap(
        await apiClient.POST('/api/Company/Members/{userId}/Roles', { params: { path: { userId } }, body: { roleName } }),
      ),
    onSuccess: () => invalidateMembership(queryClient),
  });
}

export function useRevokeCompanyRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roleName }: { userId: number; roleName: string }) =>
      unwrap(
        await apiClient.DELETE('/api/Company/Members/{userId}/Roles/{roleName}', {
          params: { path: { userId, roleName } },
        }),
      ),
    onSuccess: () => invalidateMembership(queryClient),
  });
}

export function useReaders() {
  return useQuery({
    queryKey: queryKeys.readers,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Company/Readers', { signal })),
  });
}

export function useReaderDeviceGrants(userId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.readerGrants(userId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Company/Readers/{userId}/Devices', { params: { path: { userId: userId! } }, signal }),
      ),
    enabled: userId !== undefined,
  });
}

export function useReaderEffectiveAccess(userId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.readerEffectiveAccess(userId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Company/Readers/{userId}/EffectiveAccess', {
          params: { path: { userId: userId! } },
          signal,
        }),
      ),
    enabled: userId !== undefined,
  });
}

export function useGrantReaderDevices(userId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (deviceIds: number[]) =>
      unwrap(
        await apiClient.POST('/api/Company/Readers/{userId}/Devices', { params: { path: { userId } }, body: { deviceIds } }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.readerGrants(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.readerEffectiveAccess(userId) });
    },
  });
}

export function useRevokeReaderDeviceGrant(userId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (deviceId: number) =>
      unwrap(
        await apiClient.DELETE('/api/Company/Readers/{userId}/Devices/{deviceId}', {
          params: { path: { userId, deviceId } },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.readerGrants(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.readerEffectiveAccess(userId) });
    },
  });
}
