import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';
import type { TrainingRequestStatus } from '@/api/domainTypes';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';

export type TrainingRequestDto = components['schemas']['TrainingRequestDto'];

const ACTIVE_STATUSES: TrainingRequestStatus[] = ['Pending', 'Claimed', 'Processing'];

/** Exported for unit testing - see training.test.ts. */
export function trainingRequestsRefetchInterval(requests: TrainingRequestDto[] | undefined): number | false {
  const hasActive = requests?.some((r) => ACTIVE_STATUSES.includes(r.status as TrainingRequestStatus));
  return hasActive ? POLL_INTERVALS_MS.activeJob : false;
}

/** Exported for unit testing - see training.test.ts. */
export function trainingRequestRefetchInterval(status: TrainingRequestStatus | undefined): number | false {
  return status && ACTIVE_STATUSES.includes(status) ? POLL_INTERVALS_MS.activeJob : false;
}

export function useTrainingRequests(deviceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.trainingRequests(deviceId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.GET('/api/Training/Requests', { params: { query: { deviceId: deviceId! } }, signal })),
    enabled: deviceId !== undefined,
    refetchInterval: (query) => trainingRequestsRefetchInterval(query.state.data as TrainingRequestDto[] | undefined),
  });
}

export function useTrainingRequest(requestId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.trainingRequest(requestId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Training/Requests/{requestId}', {
          params: { path: { requestId: requestId! } },
          signal,
        }),
      ),
    enabled: requestId !== undefined,
    refetchInterval: (query) =>
      trainingRequestRefetchInterval((query.state.data as TrainingRequestDto | undefined)?.status as TrainingRequestStatus | undefined),
  });
}

export function useCreateTrainingRequest(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sensorIds?: number[]) =>
      unwrap(
        await apiClient.POST('/api/Training/Requests', {
          params: { query: { deviceId } },
          body: { sensorIds },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.trainingRequests(deviceId) }),
  });
}
