import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type KnowledgeShareDto = components['schemas']['KnowledgeShareDto'];
export type ShareCompatibilityReportDto = components['schemas']['ShareCompatibilityReportDto'];

export function useKnowledgeShares(sourceDeviceId?: number, targetDeviceId?: number) {
  return useQuery({
    queryKey: queryKeys.knowledgeShares(sourceDeviceId, targetDeviceId),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/KnowledgeSharing', {
          params: { query: { sourceDeviceId, targetDeviceId } },
          signal,
        }),
      ),
  });
}

export function useKnowledgeCompatibility(sourceDeviceId: number | undefined, targetDeviceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.knowledgeCompatibility(sourceDeviceId ?? -1, targetDeviceId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/KnowledgeSharing/Compatibility', {
          params: { query: { sourceDeviceId: sourceDeviceId!, targetDeviceId: targetDeviceId! } },
          signal,
        }),
      ),
    enabled: sourceDeviceId !== undefined && targetDeviceId !== undefined && sourceDeviceId !== targetDeviceId,
  });
}

function invalidateShares(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['knowledgeSharing'] });
}

export function useCreateKnowledgeShareDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: components['schemas']['CreateKnowledgeShareRequest']) =>
      unwrap(await apiClient.POST('/api/KnowledgeSharing', { body })),
    onSuccess: () => invalidateShares(queryClient),
  });
}

export function useApproveKnowledgeShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shareId: number) =>
      unwrap(await apiClient.POST('/api/KnowledgeSharing/{shareId}/Approve', { params: { path: { shareId } } })),
    onSuccess: () => invalidateShares(queryClient),
  });
}

export function useRevokeKnowledgeShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shareId: number) =>
      unwrap(await apiClient.POST('/api/KnowledgeSharing/{shareId}/Revoke', { params: { path: { shareId } } })),
    onSuccess: () => invalidateShares(queryClient),
  });
}

export function useEnableSharedIssues(shareId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (issueIds: number[]) =>
      unwrap(
        await apiClient.POST('/api/KnowledgeSharing/{shareId}/Issues', { params: { path: { shareId } }, body: { issueIds } }),
      ),
    onSuccess: () => invalidateShares(queryClient),
  });
}

export function useRevokeSharedIssues(shareId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (issueIds: number[]) =>
      unwrap(
        await apiClient.DELETE('/api/KnowledgeSharing/{shareId}/Issues', {
          params: { path: { shareId } },
          body: { issueIds },
        }),
      ),
    onSuccess: () => invalidateShares(queryClient),
  });
}
