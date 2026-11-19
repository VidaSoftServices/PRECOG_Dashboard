import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type SensorMaintenanceRecordDto = components['schemas']['SensorMaintenanceRecordDto'];
export type MaintenanceChangePreviewDto = components['schemas']['MaintenanceChangePreviewDto'];
export type MaintenanceKind = 'Replacement' | 'Minor';

/** What ending a maintenance sends besides `enabled: false`: what it was (a replacement starts a new baseline) and an optional note. */
export interface EndMaintenanceDetails {
  kind: MaintenanceKind;
  note?: string;
}

/** Everything a maintenance change can affect: the Sensor list, the history (chart markers) and the recalculation progress. */
function invalidateMaintenance(queryClient: ReturnType<typeof useQueryClient>, deviceId: number) {
  queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.maintenances(deviceId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.recalculation(deviceId) });
}

/**
 * Switches one Sensor's maintenance mode on or off. Company Admin only on
 * the server (a non-Admin gets 403 "You need admin privileges to set
 * maintenance mode.") - the control that calls this is shown to an Admin only,
 * but that is a UX convenience, never the security boundary.
 *
 * Starting sends `{ enabled: true }`; ending sends `{ enabled: false, kind, note }` - what the maintenance was ("Replacement": a new baseline
 * starts after a warm-up; "Minor": the baseline stays) - which the API records in the maintenance history. A Device can never change
 * maintenance mode (it can only read it), so the API carries no MAC address here.
 *
 * Reading the state needs no hook of its own: `SensorDto` (from `useSensors`)
 * already carries `maintenanceMode`/`maintenanceSince`.
 */
export function useSetSensorMaintenance(deviceId: number, sensorId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: { enabled: boolean } & Partial<EndMaintenanceDetails>) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}/Sensors/{sensorId}/Maintenance', {
          params: { path: { deviceId, sensorId } },
          body: change.enabled ? { enabled: true } : { enabled: false, kind: change.kind ?? 'Minor', note: change.note || null },
        }),
      ),
    onSuccess: () => {
      invalidateMaintenance(queryClient, deviceId);
      queryClient.invalidateQueries({ queryKey: queryKeys.sensor(deviceId, sensorId) });
    },
  });
}

/**
 * Switches maintenance mode on or off for EVERY Sensor of the Device in one request (`PUT /api/Devices/{deviceId}/Maintenance`):
 * a Device may have hundreds of Sensors and the per-Sensor call is rate limited to 30 per minute. Same rules as the single-Sensor call
 * (Company Admin only on the server, never a MAC address; ending carries the kind and note for every Sensor taken out of maintenance);
 * Sensors already in the requested state are left untouched by the API. A success refreshes the Device's Sensor list, every single-Sensor
 * query under it and the maintenance history.
 */
export function useSetDeviceMaintenance(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: { enabled: boolean } & Partial<EndMaintenanceDetails>) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}/Maintenance', {
          params: { path: { deviceId } },
          body: change.enabled ? { enabled: true } : { enabled: false, kind: change.kind ?? 'Minor', note: change.note || null },
        }),
      ),
    onSuccess: () => invalidateMaintenance(queryClient, deviceId),
  });
}

/** The newest maintenances of the Device (all its Sensors), at most this many: the history card and the chart markers share one read. */
export const MAINTENANCE_HISTORY_TAKE = 500;

/**
 * The maintenance history of a Device (`GET /api/Devices/{deviceId}/Maintenances`, newest first, any level with access): every maintenance with its
 * kind, note and - for a replacement - the baseline state and the warm-up end of each level. One read of the newest 500 serves the history card and
 * every chart's maintenance markers of the Device.
 */
export function useMaintenanceHistory(deviceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.maintenances(deviceId ?? 0),
    enabled: deviceId !== undefined && deviceId > 0,
    staleTime: 60_000,
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Maintenances', {
          params: { path: { deviceId: deviceId! }, query: { take: MAINTENANCE_HISTORY_TAKE } },
          signal,
        }),
      ),
  });
}

/** What changing a maintenance's kind would recalculate (Admin, changes nothing): for the confirmation. */
export function useMaintenanceChangePreview(deviceId: number, maintenanceId: number | undefined, kind: MaintenanceKind | undefined) {
  return useQuery({
    queryKey: [...queryKeys.maintenances(deviceId), 'preview', maintenanceId ?? 0, kind ?? ''] as const,
    enabled: maintenanceId !== undefined && kind !== undefined,
    staleTime: 0,
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Maintenances/{id}/Preview', {
          params: { path: { deviceId, id: maintenanceId! }, query: { kind: kind! } },
          signal,
        }),
      ),
  });
}

/**
 * Changes the kind and / or the note of a finished maintenance (Admin). A different kind recalculates the Sensor from the maintenance's end until
 * now (the Device's recalculation progress shows it; no Issue is deleted). Refreshes the history, the Sensor list, the recalculation progress
 * and the telemetry/Issue reads once it is done there.
 */
export function useUpdateMaintenance(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, kind, note }: { id: number; kind?: MaintenanceKind; note?: string | null }) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}/Maintenances/{id}', {
          params: { path: { deviceId, id } },
          body: { kind: kind ?? null, note: note ?? null },
        }),
      ),
    onSuccess: () => invalidateMaintenance(queryClient, deviceId),
  });
}

/** Starts a new baseline by hand, without maintenance mode, for some or all Sensors of the Device (Admin). */
export function useStartBaseline(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sensorIds, at, note }: { sensorIds?: number[]; at?: string; note?: string }) =>
      unwrap(
        await apiClient.POST('/api/Devices/{deviceId}/Maintenances/Baseline', {
          params: { path: { deviceId } },
          body: { sensorIds: sensorIds && sensorIds.length > 0 ? sensorIds : null, at: at ?? null, note: note || null },
        }),
      ),
    onSuccess: () => invalidateMaintenance(queryClient, deviceId),
  });
}
