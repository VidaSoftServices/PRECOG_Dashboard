import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type IssueDto = components['schemas']['IssueDto'];
export type CreateIssueRequest = components['schemas']['CreateIssueRequest'];
export type UpdateIssueRequest = components['schemas']['UpdateIssueRequest'];
export type ReviewIssueRequest = components['schemas']['ReviewIssueRequest'];
export type IssueReviewResultDto = components['schemas']['IssueReviewResultDto'];
export type IssueGroupDto = components['schemas']['IssueGroupDto'];
export type AssignIssueCategoryRequest = components['schemas']['AssignIssueCategoryRequest'];

/**
 * `deviceId` is genuinely optional on this operation (confirmed against the
 * generated schema, correcting an earlier assumption in the modernization
 * audit that it was required). Per the approved Overview-KPI decision, this
 * hook is still always called with an explicit deviceId from page code - the
 * omitted-deviceId, "all accessible Devices" behavior is unconfirmed against
 * source and is not relied on anywhere in this app.
 */
export function useIssues(deviceId: number | undefined, options?: { includeMembers?: boolean; take?: number }) {
  return useQuery({
    queryKey: queryKeys.issues(deviceId, options?.includeMembers),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Issue', {
          params: { query: { deviceId, includeMembers: options?.includeMembers, take: options?.take } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined,
  });
}

export function useIssue(issueId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.issue(issueId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.GET('/api/Issue/{issueId}', { params: { path: { issueId: issueId! } }, signal })),
    enabled: issueId !== undefined,
  });
}

export function useIssueGroup(issueId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.issueGroup(issueId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Issue/{issueId}/Group', { params: { path: { issueId: issueId! } }, signal }),
      ),
    enabled: issueId !== undefined,
  });
}

function invalidateIssue(queryClient: ReturnType<typeof useQueryClient>, deviceId: number, issueId?: number) {
  queryClient.invalidateQueries({ queryKey: ['issues', deviceId] });
  queryClient.invalidateQueries({ queryKey: ['issues', 'all'] });
  if (issueId !== undefined) {
    queryClient.invalidateQueries({ queryKey: queryKeys.issue(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issueGroup(issueId) });
  }
}

export function useCreateIssue(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateIssueRequest) =>
      unwrap(await apiClient.POST('/api/Issue', { params: { query: { deviceId } }, body })),
    onSuccess: () => invalidateIssue(queryClient, deviceId),
  });
}

/** Legacy Confirmed/IsAnomaly-style edit - prefer useReviewIssue for the authoritative reviewState workflow. */
export function useUpdateIssue(deviceId: number, issueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateIssueRequest) =>
      unwrap(await apiClient.PUT('/api/Issue/{issueId}', { params: { path: { issueId } }, body })),
    onSuccess: () => invalidateIssue(queryClient, deviceId, issueId),
  });
}

export function useReviewIssue(deviceId: number, issueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ReviewIssueRequest) =>
      unwrap(await apiClient.POST('/api/Issue/{issueId}/Review', { params: { path: { issueId } }, body })),
    onSuccess: () => invalidateIssue(queryClient, deviceId, issueId),
  });
}

/** Withdraws the verdict back to PendingReview. Never deletes the Issue - see the modernization audit's copy-correction note. */
export function useReopenIssue(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (issueId: number) =>
      unwrap(await apiClient.DELETE('/api/Issue/{issueId}', { params: { path: { issueId } } })),
    onSuccess: (_, issueId) => invalidateIssue(queryClient, deviceId, issueId),
  });
}

export function useAssignIssueCategory(deviceId: number, issueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AssignIssueCategoryRequest) =>
      unwrap(await apiClient.PUT('/api/Issue/{issueId}/Category', { params: { path: { issueId } }, body })),
    onSuccess: () => invalidateIssue(queryClient, deviceId, issueId),
  });
}

export function useGroupIssues(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: components['schemas']['GroupIssuesRequest']) =>
      unwrap(await apiClient.POST('/api/Issue/Group', { body })),
    onSuccess: () => invalidateIssue(queryClient, deviceId),
  });
}

export function useUngroupIssue(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (issueId: number) =>
      unwrap(await apiClient.POST('/api/Issue/{issueId}/Ungroup', { params: { path: { issueId } } })),
    onSuccess: (_, issueId) => invalidateIssue(queryClient, deviceId, issueId),
  });
}

export function useMoveGroupMember(deviceId: number, issueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: components['schemas']['MoveGroupMemberRequest']) =>
      unwrap(await apiClient.POST('/api/Issue/{issueId}/MoveGroup', { params: { path: { issueId } }, body })),
    onSuccess: () => invalidateIssue(queryClient, deviceId, issueId),
  });
}

export function useReassignCanonical(deviceId: number, canonicalIssueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: components['schemas']['ReassignCanonicalRequest']) =>
      unwrap(
        await apiClient.POST('/api/Issue/{canonicalIssueId}/ReassignCanonical', {
          params: { path: { canonicalIssueId } },
          body,
        }),
      ),
    onSuccess: () => invalidateIssue(queryClient, deviceId, canonicalIssueId),
  });
}
