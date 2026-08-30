import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap, ApiError } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type IssueCategorySuggestionDto = components['schemas']['IssueCategorySuggestionDto'];

/** null = no suggestion has ever been requested for this Issue yet (a real, expected state - not an error). */
export function useIssueCategorySuggestion(issueId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.issueCategorySuggestion(issueId ?? -1),
    queryFn: async ({ signal }) => {
      try {
        return unwrap(
          await apiClient.GET('/api/Issue/{issueId}/CategorySuggestion', {
            params: { path: { issueId: issueId! } },
            signal,
          }),
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: issueId !== undefined,
  });
}

export function useRequestCategorySuggestion(issueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.POST('/api/Issue/{issueId}/CategorySuggestion', { params: { path: { issueId } } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.issueCategorySuggestion(issueId) }),
  });
}

export function useDecideCategorySuggestion(issueId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: components['schemas']['DecideCategorySuggestionRequest']) =>
      unwrap(
        await apiClient.POST('/api/Issue/{issueId}/CategorySuggestion/Decision', {
          params: { path: { issueId } },
          body,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issueCategorySuggestion(issueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issue(issueId) });
    },
  });
}
