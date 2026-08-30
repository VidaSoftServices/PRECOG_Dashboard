import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type IssueCategoryDto = components['schemas']['IssueCategoryDto'];

export function useIssueCategories(includeRetired = false) {
  return useQuery({
    queryKey: queryKeys.issueCategories(includeRetired),
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.GET('/api/IssueCategories', { params: { query: { includeRetired } }, signal })),
  });
}

function invalidateCategories(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['issueCategories'] });
}

export function useCreateIssueCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: components['schemas']['CreateIssueCategoryRequest']) =>
      unwrap(await apiClient.POST('/api/IssueCategories', { body })),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

export function useUpdateIssueCategory(categoryId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: components['schemas']['UpdateIssueCategoryRequest']) =>
      unwrap(await apiClient.PUT('/api/IssueCategories/{categoryId}', { params: { path: { categoryId } }, body })),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

export function useSetIssueCategoryEnabled(categoryId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) =>
      unwrap(
        await apiClient.POST('/api/IssueCategories/{categoryId}/Enabled', {
          params: { path: { categoryId } },
          body: { enabled },
        }),
      ),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

export function useMergeIssueCategory(categoryId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetCategoryId: number) =>
      unwrap(
        await apiClient.POST('/api/IssueCategories/{categoryId}/Merge', {
          params: { path: { categoryId } },
          body: { targetCategoryId },
        }),
      ),
    onSuccess: () => invalidateCategories(queryClient),
  });
}
