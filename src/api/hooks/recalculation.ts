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

export type DeviceCalculatedUpToDto = components['schemas']['DeviceCalculatedUpToDto'];

/**
 * How far the anomaly analysis of every Sensor of the Device has got (`GET /api/Devices/{deviceId}/Sensors/CalculatedUpTo`): per Sensor the
 * measurement time of its newest ANALYSED value, null when nothing is analysed (always for a Sensor without a setpoint; the control limits are not
 * stored and play no part). Cheap by design (the API caches it for 30 s) and
 * refreshed every `POLL_INTERVALS_MS.calculatedUpTo`; NOT a completeness percentage - a gap in the middle is not visible.
 * (Counting the readings was measured on production: over 30 seconds for one Device, so it is not done.)
 */
export function useCalculatedUpTo(deviceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.calculatedUpTo(deviceId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors/CalculatedUpTo', {
          params: { path: { deviceId: deviceId! } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined,
    refetchInterval: POLL_INTERVALS_MS.calculatedUpTo,
  });
}

/**
 * Starts the recalculation of ONE Sensor (`sensorId` given), of the listed Sensors (`sensorIds`; since 2026-11-20, the API takes the list in the
 * body of the Device-wide POST: 400 for an empty list, a duplicate or an id that is not a Sensor of the Device) or of every Sensor of the Device
 * (neither given). Company Admin only on
 * the server; the controls that call this are shown to an Admin only, which is a UX convenience, never the security boundary. 202 on
 * success; 409 when a recalculation already runs for the Device, an Ollama job is processing, or the Sensor cannot be recalculated
 * (maintenance, not a continuous unidirectional Sensor) - shown inline by the dialog. A Sensor whose calculation is off is only deleted
 * from (`deleteOnlySensorIds`; its status entry has `kind: 'DeleteOnly'`).
 */
export function useStartRecalculation(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (target?: number | { sensorIds: number[] }) =>
      target === undefined || typeof target === 'object'
        ? unwrap(
            await apiClient.POST('/api/Devices/{deviceId}/Recalculate', {
              params: { path: { deviceId } },
              // The generated schema has no request body for this operation until `npm run gen:api` is run against the API that accepts it.
              ...(target ? ({ body: { sensorIds: target.sensorIds } } as unknown as Record<string, never>) : {}),
            }),
          )
        : unwrap(
            await apiClient.POST('/api/Devices/{deviceId}/Sensors/{sensorId}/Recalculate', {
              params: { path: { deviceId, sensorId: target } },
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
