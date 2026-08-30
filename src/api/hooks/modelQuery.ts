import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type ModelQueryResponse = components['schemas']['ModelQueryResponse'];

/**
 * A mutation, not a query: ModelQuery is read-only/idempotent-ish but
 * explicitly rate-limited (20/60s) and CPU-bound server-side (max 8
 * concurrent), so it should only run on deliberate user action, never as a
 * background/auto-refetching query.
 */
export function useRunModelQuery(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (referenceTime?: string) =>
      unwrap(
        await apiClient.POST('/api/Devices/{deviceId}/ModelQuery', {
          params: { path: { deviceId } },
          body: { referenceTime },
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.modelQuery(deviceId), data);
    },
  });
}
