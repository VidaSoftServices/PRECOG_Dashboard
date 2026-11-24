import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type PlatformCompany = components['schemas']['PlatformCompanyDto'];
export type PlatformMember = components['schemas']['CompanyMemberDto'];
export type PendingInvitation = components['schemas']['InvitationDto'];
export type InviteResult = components['schemas']['InviteResultDto'];

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
    mutationFn: async (vars: { companyId: number; userId: number; roleName: 'Admin' | 'Reader' }) =>
      unwrap(
        await apiClient.DELETE('/api/Platform/Companies/{companyId}/Members/{userId}/Roles/{roleName}', {
          params: { path: { companyId: vars.companyId, userId: vars.userId, roleName: vars.roleName } },
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

export function useLinkPlatformMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; userId: number }) =>
      unwrap(await apiClient.POST('/api/Platform/Companies/{companyId}/Members/{userId}/WordPressLink', { params: { path: vars } })),
    onSuccess: (_, vars) => invalidatePeople(queryClient, vars.companyId),
  });
}

export function useUnlinkPlatformMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: number; userId: number }) =>
      unwrap(await apiClient.DELETE('/api/Platform/Companies/{companyId}/Members/{userId}/WordPressLink', { params: { path: vars } })),
    onSuccess: (_, vars) => invalidatePeople(queryClient, vars.companyId),
  });
}
