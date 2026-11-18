import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';
import type { components } from '@/api/schema.generated';

export type RecalculationStatusDto = components['schemas']['RecalculationStatusDto'];
export type RecalculationSensorDto = components['schemas']['RecalculationSensorDto'];
export type RecalculationStartedDto = components['schemas']['RecalculationStartedDto'];

/** The phases in which the API is rewriting a Sensor's calculated values right now. */
export const ACTIVE_RECALCULATION_PHASES: readonly string[] = ['Deleting', 'ControlLimits', 'Analysing'];

/**
 * Progress of the latest "recalculate from the start" of a Device (`GET /api/Devices/{deviceId}/Recalculation`, visible to anyone who
 * can see the Device). Polls every 5 seconds (`POLL_INTERVALS_MS.recalculationProgress`) only while the job is Queued or Running (`active`), and stops at a
 * terminal status. The job lives in the API's memory: after an API restart `exists` is false.
 */
export function useRecalculationStatus(deviceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.recalculation(deviceId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Recalculation', {
          params: { path: { deviceId: deviceId! } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined,
    refetchInterval: (query) => (query.state.data?.active ? POLL_INTERVALS_MS.recalculationProgress : false),
  });
}

/**
 * Starts the recalculation of ONE Sensor (`sensorId` given) or of every Sensor of the Device (`sensorId` omitted). Company Admin only on
 * the server; the controls that call this are shown to an Admin only, which is a UX convenience, never the security boundary. 202 on
 * success; 409 when a recalculation already runs for the Device, an Ollama job is processing, or the Sensor cannot be recalculated
 * (calculation off, maintenance, not a continuous unidirectional Sensor) - shown inline by the dialog.
 */
export function useStartRecalculation(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sensorId?: number) =>
      sensorId === undefined
        ? unwrap(await apiClient.POST('/api/Devices/{deviceId}/Recalculate', { params: { path: { deviceId } } }))
        : unwrap(
            await apiClient.POST('/api/Devices/{deviceId}/Sensors/{sensorId}/Recalculate', {
              params: { path: { deviceId, sensorId } },
            }),
          ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recalculation(deviceId) });
    },
  });
}

/** Stops the running recalculation of a Device before its next reading (`DELETE /api/Devices/{deviceId}/Recalculation`, Admin). */
export function useCancelRecalculation(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(await apiClient.DELETE('/api/Devices/{deviceId}/Recalculation', { params: { path: { deviceId } } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recalculation(deviceId) });
    },
  });
}
