import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type PlatformCompany = components['schemas']['PlatformCompanyDto'];
export type PlatformMember = components['schemas']['CompanyMemberDto'];
export type PendingInvitation = components['schemas']['InvitationDto'];
export type InviteResult = components['schemas']['InviteResultDto'];
export type PlatformUser = components['schemas']['PlatformUserDto'];

/**
 * The platform administrator's (VSSSysAdmin) operations. The platform account sees no telemetry, Issue, Device or model: these lists hold only
 * Company names and states, counts, and the people who administer a Company.
 */
export function usePlatformCompanies() {
  return useQuery({
    queryKey: queryKeys.platformCompanies,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Platform/Companies', { signal })),
  });
}

export function useCreatePlatformCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string; website?: string }) => unwrap(await apiClient.POST('/api/Platform/Companies', { body: vars })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.platformCompanies }),
  });
}

export function useSetPlatformCompanyEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; enabled: boolean }) =>
      unwrap(
        await apiClient.PUT('/api/Platform/Companies/{companyId}/Enabled', {
          params: { path: { companyId: vars.companyId } },
          body: { enabled: vars.enabled },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.platformCompanies }),
  });
}

export function usePlatformMembers(companyId: number | null) {
  return useQuery({
    queryKey: queryKeys.platformMembers(companyId ?? 0),
    enabled: companyId !== null,
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.GET('/api/Platform/Companies/{companyId}/Members', { params: { path: { companyId: companyId! } }, signal })),
  });
}

export function usePlatformInvitations(companyId: number | null) {
  return useQuery({
    queryKey: queryKeys.platformInvitations(companyId ?? 0),
    enabled: companyId !== null,
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.GET('/api/Platform/Companies/{companyId}/Invitations', { params: { path: { companyId: companyId! } }, signal })),
  });
}

export function useInviteToCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; email: string; roleName: 'Admin' | 'Reader'; language: 'en' | 'hu' }) =>
      unwrap(
        await apiClient.POST('/api/Platform/Companies/{companyId}/Invitations', {
          params: { path: { companyId: vars.companyId } },
          body: { email: vars.email, roleName: vars.roleName, language: vars.language },
        }),
      ),
    onSuccess: (_, vars) => queryClient.invalidateQueries({ queryKey: queryKeys.platformInvitations(vars.companyId) }),
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; invitationId: number }) =>
      unwrap(
        await apiClient.DELETE('/api/Platform/Companies/{companyId}/Invitations/{invitationId}', {
          params: { path: { companyId: vars.companyId, invitationId: vars.invitationId } },
        }),
      ),
    onSuccess: (_, vars) => queryClient.invalidateQueries({ queryKey: queryKeys.platformInvitations(vars.companyId) }),
  });
}

function invalidatePeople(queryClient: ReturnType<typeof useQueryClient>, companyId: number) {
  queryClient.invalidateQueries({ queryKey: queryKeys.platformMembers(companyId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.platformCompanies });
  queryClient.invalidateQueries({ queryKey: queryKeys.platformUsersAll });
}

export function useGrantPlatformRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; userId: number; roleName: 'Admin' | 'Reader' }) =>
      unwrap(
        await apiClient.POST('/api/Platform/Companies/{companyId}/Members/{userId}/Roles/{roleName}', {
          params: { path: { companyId: vars.companyId, userId: vars.userId, roleName: vars.roleName } },
        }),
      ),
    onSuccess: (_, vars) => invalidatePeople(queryClient, vars.companyId),
  });
}

export function useRevokePlatformRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; userId: number; roleName: 'Admin' | 'Reader'; confirmLastAdmin?: boolean }) =>
      unwrap(
        await apiClient.DELETE('/api/Platform/Companies/{companyId}/Members/{userId}/Roles/{roleName}', {
          params: {
            path: { companyId: vars.companyId, userId: vars.userId, roleName: vars.roleName },
            query: { confirmLastAdmin: vars.confirmLastAdmin ?? false },
          },
        }),
      ),
    onSuccess: (_, vars) => invalidatePeople(queryClient, vars.companyId),
  });
}

export function useRemovePlatformMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; userId: number }) =>
      unwrap(await apiClient.DELETE('/api/Platform/Companies/{companyId}/Members/{userId}', { params: { path: vars } })),
    onSuccess: (_, vars) => invalidatePeople(queryClient, vars.companyId),
  });
}

// ---------------------------------------------------------------- the Company profile (name, website, logo)

function refreshCompanies(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.platformCompanies });
  queryClient.invalidateQueries({ queryKey: queryKeys.platformUsersAll });
}

export function useRenamePlatformCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; name: string }) =>
      unwrap(await apiClient.PUT('/api/Platform/Companies/{companyId}/Name', { params: { path: { companyId: vars.companyId } }, body: { name: vars.name } })),
    onSuccess: () => refreshCompanies(queryClient),
  });
}

export function useChangePlatformCompanyWebsite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; website: string }) =>
      unwrap(await apiClient.PUT('/api/Platform/Companies/{companyId}/Website', { params: { path: { companyId: vars.companyId } }, body: { website: vars.website } })),
    onSuccess: () => refreshCompanies(queryClient),
  });
}

/** Uploads a Company's logo (multipart, one `file` field). The API checks the CONTENT (PNG, JPEG or WebP, at most 512 KB), not the file name. */
export function useUploadPlatformCompanyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; file: File }) =>
      unwrap(
        await apiClient.PUT('/api/Platform/Companies/{companyId}/Logo', {
          params: { path: { companyId: vars.companyId } },
          // The generated body type is the file field itself; the real body is the multipart form below (the browser sets the boundary).
          body: { file: vars.file as unknown as string },
          bodySerializer: () => {
            const form = new FormData();
            form.append('file', vars.file);
            return form;
          },
        }),
      ),
    onSuccess: () => refreshCompanies(queryClient),
  });
}

export function useDeletePlatformCompanyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: number) => unwrap(await apiClient.DELETE('/api/Platform/Companies/{companyId}/Logo', { params: { path: { companyId } } })),
    onSuccess: () => refreshCompanies(queryClient),
  });
}

// ---------------------------------------------------------------- the People of every Company

export interface PlatformUserFilters {
  search: string;
  companyId: number | null;
  role: '' | 'Admin' | 'Reader' | 'None';
  enabled: '' | 'true' | 'false';
  skip: number;
  take: number;
  /** The column the API sorts by (the page is sorted there, not in the browser); '' = by name. */
  sortBy: '' | 'name' | 'loginName' | 'email' | 'company' | 'state';
  descending: boolean;
}

export function usePlatformUsers(filters: PlatformUserFilters) {
  return useQuery({
    queryKey: queryKeys.platformUsers(filters),
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Platform/Users', {
          params: {
            query: {
              search: filters.search.trim() || undefined,
              companyId: filters.companyId ?? undefined,
              role: filters.role || undefined,
              enabled: filters.enabled === '' ? undefined : filters.enabled === 'true',
              skip: filters.skip,
              take: filters.take,
              sortBy: filters.sortBy || undefined,
              descending: filters.descending || undefined,
            },
          },
          signal,
        }),
      ),
  });
}

/** Moves a User to another Company (only the platform administrator can). `confirmLastAdmin` confirms taking the last Admin out of a Company that has Devices. */
export function useChangePlatformUserCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { userId: number; companyId: number; confirmLastAdmin?: boolean }) =>
      unwrap(
        await apiClient.PUT('/api/Platform/Users/{userId}/Company', {
          params: { path: { userId: vars.userId } },
          body: { companyId: vars.companyId, confirmLastAdmin: vars.confirmLastAdmin ?? false },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}

/**
 * Sets a new password for a person (platform administrator only). The password is held only by the dialog that sends it: `gcTime: 0` and the dialog's `reset()` keep it
 * out of the mutation cache.
 */
export function useSetPlatformUserPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { userId: number; password: string }) =>
      unwrap(await apiClient.PUT('/api/Platform/Users/{userId}/Password', { params: { path: { userId: vars.userId } }, body: { password: vars.password } })),
    gcTime: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}

export function useSetPlatformUserEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { userId: number; enabled: boolean; confirmLastAdmin?: boolean }) =>
      unwrap(
        await apiClient.PUT('/api/Platform/Users/{userId}/Enabled', {
          params: { path: { userId: vars.userId } },
          body: { enabled: vars.enabled, confirmLastAdmin: vars.confirmLastAdmin ?? false },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}

/** Permanently deletes a Company that has no Admin (its name typed exactly). Every Device goes with all its data; its Users stay, disabled, with no Company. */
export function useDeletePlatformCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; confirmName: string }) =>
      unwrap(await apiClient.DELETE('/api/Platform/Companies/{companyId}', { params: { path: { companyId: vars.companyId } }, body: { confirmName: vars.confirmName } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}

/** Removes a person who belongs to no Company (a person with a Company is removed from that Company's page). */
export function useRemovePlatformUserWithoutCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: number) => unwrap(await apiClient.DELETE('/api/Platform/Users/{userId}', { params: { path: { userId } } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platformUsersAll });
    },
  });
}
