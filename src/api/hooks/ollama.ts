import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';
import type { OllamaJobStatus } from '@/api/domainTypes';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';

export type OllamaJobDto = components['schemas']['OllamaJobDto'];

/** D4: the real terminal-success value is "Succeeded", not "Completed" - see src/api/domainTypes.ts. */
const TERMINAL_STATUSES: OllamaJobStatus[] = ['Succeeded', 'Failed', 'Cancelled'];

/** Exported for unit testing - see ollama.test.ts. */
export function ollamaRefetchInterval(status: OllamaJobStatus | undefined): number | false {
  return status && !TERMINAL_STATUSES.includes(status) ? POLL_INTERVALS_MS.activeJob : false;
}

export function useOllamaJob(jobId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.ollamaJob(jobId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.GET('/api/Ollama/Jobs/{jobId}', { params: { path: { jobId: jobId! } }, signal })),
    enabled: jobId !== undefined,
    refetchInterval: (query) =>
      ollamaRefetchInterval((query.state.data as OllamaJobDto | undefined)?.status as OllamaJobStatus | undefined),
  });
}

export function useSubmitOllamaSummaryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (issueId: number) => {
      const result = await apiClient.POST('/api/Ollama/Jobs', { params: { query: { issueId } } });
      // D6: swagger declares 202 with no content schema; confirmed from
      // source (AcceptedAtAction(..., ToDto(...))) that the real body is an
      // OllamaJobDto.
      return unwrap(result) as unknown as OllamaJobDto;
    },
    onSuccess: (job) => {
      if (job.id !== undefined) queryClient.setQueryData(queryKeys.ollamaJob(job.id), job);
    },
  });
}

export function useCancelOllamaJob(jobId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(await apiClient.POST('/api/Ollama/Jobs/{jobId}/Cancel', { params: { path: { jobId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ollamaJob(jobId) }),
  });
}
