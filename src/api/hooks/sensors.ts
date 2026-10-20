import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiClient, unwrap } from '@/api/client';
import type { ParsedSensorRow } from '@/lib/sensorImport';
import { queryKeys } from '@/api/queryKeys';
import type { CreateSetpointRequest } from '@/api/hooks/setpoints';
import type { components } from '@/api/schema.generated';

export type SensorDto = components['schemas']['SensorDto'];
export type CreateSensorRequest = components['schemas']['CreateSensorRequest'];
export type UpdateSensorRequest = components['schemas']['UpdateSensorRequest'];

export function useSensors(deviceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.sensors(deviceId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors', {
          params: { path: { deviceId: deviceId! } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined,
  });
}

export function useSensor(deviceId: number | undefined, sensorId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.sensor(deviceId ?? -1, sensorId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}', {
          params: { path: { deviceId: deviceId!, sensorId: sensorId! } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined && sensorId !== undefined,
  });
}

export function useCreateSensor(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateSensorRequest) =>
      unwrap(
        await apiClient.POST('/api/Devices/{deviceId}/Sensors', {
          params: { path: { deviceId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) }),
  });
}

export function useUpdateSensor(deviceId: number, sensorId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateSensorRequest) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}/Sensors/{sensorId}', {
          params: { path: { deviceId, sensorId } },
          body,
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.sensor(deviceId, sensorId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) });
    },
  });
}

export interface SensorImportOutcome {
  /** Line in the pasted sheet (header = 1), so a failure can be found in Excel. */
  line: number;
  externalSensorId: string;
  status: 'created' | 'skipped' | 'failed';
  /** Device-scoped numeric id the API assigned - present for `created`. */
  sensorId?: number;
  message?: string;
  /** Only for a row that carried target/tolerance: whether its first Setpoint was recorded. A failed Setpoint leaves the Sensor created. */
  setpoint?: 'created' | 'failed';
  setpointMessage?: string;
}

interface ImportSensorsArgs {
  deviceId: number;
  rows: ParsedSensorRow[];
  /** Curve vs. signal storage follows the Device's own mode and is never a free choice (see NewSensorDialog). */
  isCurve: boolean;
  /** When the Setpoints of rows with target/tolerance become effective - the moment of the import. Defaults to now, read once per run. */
  setpointValidFrom?: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, outcome: SensorImportOutcome) => void;
}

/** Waits `ms`, but wakes immediately (rejecting) if `signal` aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

const MAX_RATE_LIMIT_RETRIES = 4;

/** Records a Sensor's first Setpoint; 429 waits the server's Retry-After like the Sensor call. `stop`: the whole import must end (401/403, or the user stopped it). */
async function saveSetpoint(
  deviceId: number,
  sensorId: number,
  body: CreateSetpointRequest,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string; stop: boolean }> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      unwrap(await apiClient.POST('/api/Devices/{deviceId}/Sensors/{sensorId}/Setpoints', { params: { path: { deviceId, sensorId } }, body, signal }));
      return { ok: true };
    } catch (error) {
      if (signal?.aborted) return { ok: false, message: 'The import was stopped before the setpoint was saved.', stop: true };
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        try {
          await sleep(Math.min((error as ApiError).retryAfterSeconds ?? 5, 60) * 1000, signal);
        } catch {
          return { ok: false, message: 'The import was stopped before the setpoint was saved.', stop: true };
        }
        continue;
      }
      return { ok: false, message: error instanceof Error ? error.message : 'Request failed.', stop: status === 401 || status === 403 };
    }
  }
}

/**
 * Creates the given Sensors one after another, in sheet order.
 *
 * Strictly sequential on purpose: the API assigns each new Sensor the next
 * Device-scoped id, so creating them one at a time makes the numeric ids follow
 * the sheet's row order - which is what a Device's firmware mapping relies on.
 * It also keeps the request rate trivially low (one request in flight) and a
 * failure on one row never prevents the rest.
 *
 * - 429: waits the server's Retry-After (default 5 s, at most 60 s) and retries
 *   the same row, at most 4 times.
 * - 409 "already exists": reported as `skipped`, so re-running the same sheet
 *   after a partial failure only creates what is missing.
 * - 401/403: stops the whole import - every following row would fail the same way.
 * - Aborting (the dialog's Cancel) stops before the next row; rows already
 *   created stay created.
 */
export async function importSensors({ deviceId, rows, isCurve, setpointValidFrom, signal, onProgress }: ImportSensorsArgs): Promise<SensorImportOutcome[]> {
  const outcomes: SensorImportOutcome[] = [];
  // One instant for the whole run: every imported Setpoint is effective from the moment of the import.
  const validFrom = setpointValidFrom ?? new Date().toISOString();

  for (const row of rows) {
    if (signal?.aborted) break;

    let outcome: SensorImportOutcome | undefined;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES && !outcome; attempt += 1) {
      try {
        const created = unwrap(
          await apiClient.POST('/api/Devices/{deviceId}/Sensors', {
            params: { path: { deviceId } },
            body: {
              externalSensorId: row.externalSensorId,
              name: row.name || undefined,
              direction: row.direction,
              sensorType: row.sensorType || undefined,
              unitCode: row.unitCode || undefined,
              aggregationType: row.aggregationType ? (row.aggregationType as CreateSensorRequest['aggregationType']) : undefined,
              aggregationExplanation: row.aggregationType ? row.aggregationExplanation : undefined,
              isCurve,
              rawScale: row.rawScale,
              rawLookback: row.rawLookback,
              rawMinIssueScore: row.rawMinIssueScore,
              processingEnabled: row.processingEnabled,
            },
            signal,
          }),
        );
        outcome = { line: row.line, externalSensorId: row.externalSensorId, status: 'created', sensorId: created.id };
      } catch (error) {
        if (signal?.aborted) return outcomes;
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
          const waitSeconds = Math.min((error as ApiError).retryAfterSeconds ?? 5, 60);
          try {
            await sleep(waitSeconds * 1000, signal);
          } catch {
            return outcomes;
          }
          continue;
        }
        const message = error instanceof Error ? error.message : 'Request failed.';
        if (status === 409 && /already exists/i.test(message)) {
          outcome = { line: row.line, externalSensorId: row.externalSensorId, status: 'skipped', message };
        } else {
          outcome = { line: row.line, externalSensorId: row.externalSensorId, status: 'failed', message };
          if (status === 401 || status === 403) {
            outcomes.push(outcome);
            onProgress?.(outcomes.length, rows.length, outcome);
            return outcomes;
          }
        }
      }
    }

    if (!outcome) break;

    // The row's target/tolerance become the new Sensor's first Setpoint, effective from the import. Skipped (already
    // existing) Sensors are never touched: their configuration is not this import's to change.
    let stop = false;
    if (outcome.status === 'created' && outcome.sensorId !== undefined && row.setpoint) {
      const saved = await saveSetpoint(deviceId, outcome.sensorId, { validFrom, ...row.setpoint }, signal);
      outcome.setpoint = saved.ok ? 'created' : 'failed';
      if (!saved.ok) {
        outcome.setpointMessage = saved.message;
        stop = saved.stop;
      }
    }

    outcomes.push(outcome);
    if (stop) {
      onProgress?.(outcomes.length, rows.length, outcome);
      return outcomes;
    }
    onProgress?.(outcomes.length, rows.length, outcome);
  }

  return outcomes;
}

/** Runs {@link importSensors} and refreshes the Device's Sensor list afterwards - also after a partial or cancelled run, since some Sensors may exist now. */
export function useImportSensors(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: Omit<ImportSensorsArgs, 'deviceId'>) => importSensors({ ...args, deviceId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) }),
  });
}
