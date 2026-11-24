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

export type CompanyInvitation = components['schemas']['InvitationDto'];

/** The Company Admin's own invitations: one person at a time, by e-mail, as Admin or Reader. */
export function useCompanyInvitations() {
  return useQuery({
    queryKey: queryKeys.companyInvitations,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Company/Invitations', { signal })),
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { email: string; roleName: 'Admin' | 'Reader'; language: 'en' | 'hu' }) =>
      unwrap(await apiClient.POST('/api/Company/Invitations', { body: vars })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.companyInvitations }),
  });
}

export function useRevokeCompanyInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: number) =>
      unwrap(await apiClient.DELETE('/api/Company/Invitations/{invitationId}', { params: { path: { invitationId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.companyInvitations }),
  });
}

/** Removes a User from the Company. A User with a history is deactivated instead of deleted (the result says so); the API refuses a User synchronized from WordPress (while the sync is on) and the last Admin. */
export function useRemoveCompanyMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: number) => unwrap(await apiClient.DELETE('/api/Company/Members/{userId}', { params: { path: { userId } } })),
    onSuccess: () => invalidateMembership(queryClient),
  });
}

/** Decides where the person manages the password: linked = in WordPress, unlinked = here. */
export function useLinkMemberToWordPress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: number) => unwrap(await apiClient.POST('/api/Company/Members/{userId}/WordPressLink', { params: { path: { userId } } })),
    onSuccess: () => invalidateMembership(queryClient),
  });
}

export function useUnlinkMemberFromWordPress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: number) => unwrap(await apiClient.DELETE('/api/Company/Members/{userId}/WordPressLink', { params: { path: { userId } } })),
    onSuccess: () => invalidateMembership(queryClient),
  });
}

/** The Company website (an http(s) address; blank removes it). The API returns the updated Company. */
export function useUpdateCompanyWebsite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (website: string) => unwrap(await apiClient.PUT('/api/Company/Website', { body: { website } })),
    onSuccess: (updated) => queryClient.setQueryData(queryKeys.company, updated),
  });
}

/** Uploads the Company logo (multipart, one `file` field). The API checks the CONTENT (PNG, JPEG or WebP, at most 512 KB), not the file name. */
export function useUploadCompanyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) =>
      unwrap(
        await apiClient.PUT('/api/Company/Logo', {
          // The generated body type is the file field itself; the real body is the multipart form below (the browser sets the boundary).
          body: { file: file as unknown as string },
          bodySerializer: () => {
            const form = new FormData();
            form.append('file', file);
            return form;
          },
        }),
      ),
    onSuccess: (updated) => queryClient.setQueryData(queryKeys.company, updated),
  });
}

export function useDeleteCompanyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await apiClient.DELETE('/api/Company/Logo')),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.company }),
  });
}
