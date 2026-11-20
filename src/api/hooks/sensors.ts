import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiClient, unwrap } from '@/api/client';
import { attempt, type Attempt, type Failed, type RateGate } from '@/api/rateLimited';
import { isRawPolicy } from '@/lib/policies';
import { SETPOINT_COLUMNS, mergeSetpoint, type ParsedSensorRow, type SetpointColumn } from '@/lib/sensorImport';
import { queryKeys } from '@/api/queryKeys';
import type { CreateSetpointRequest, SetpointDto } from '@/api/hooks/setpoints';
import type { SensorAggregationPolicyDto, UpdateAggregationPolicyRequest } from '@/api/hooks/aggregationPolicies';
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sensorTypes }); // a new Sensor may bring a new Sensor type
    },
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
    onSuccess: (updated, body) => {
      queryClient.setQueryData(queryKeys.sensor(deviceId, sensorId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sensorTypes });
      // Calculation switched on starts the API's catch-up (switched off stops a running one): the Device's recalculation progress shows it.
      if (body.processingEnabled !== undefined && body.processingEnabled !== null)
        queryClient.invalidateQueries({ queryKey: queryKeys.recalculation(deviceId) });
    },
  });
}

export interface SensorImportOutcome {
  /** Line in the pasted sheet (header = 1), so a failure can be found in Excel. */
  line: number;
  externalSensorId: string;
  /**
   * created: a new Sensor. updated: a Sensor that already existed had at least one value changed. unchanged: it existed and the
   * sheet's values already matched. skipped: the API said "already exists" on create. failed: see `message`.
   */
  status: 'created' | 'updated' | 'unchanged' | 'skipped' | 'failed';
  /** Device-scoped numeric id - for `created` the one the API assigned, for an existing Sensor its own. */
  sensorId?: number;
  message?: string;
  /** Human-readable list of what an existing Sensor had changed (`updated`), e.g. "rawLookback 100 -> 200". */
  changes?: string[];
  /** Only for a row that carried target/tolerance: whether a Setpoint was recorded ('unchanged' = the values were already current). A failed Setpoint leaves the Sensor as it is. */
  setpoint?: 'created' | 'unchanged' | 'failed';
  setpointMessage?: string;
}

interface ImportSensorsArgs {
  deviceId: number;
  rows: ParsedSensorRow[];
  /** The Sensors already on the Device, keyed by lower-case externalSensorId - rows for these are updates (only the filled cells), not creates. */
  existing?: ReadonlyMap<string, SensorDto>;
  /** Curve vs. signal storage follows the Device's own mode and is never a free choice (see NewSensorDialog). */
  isCurve: boolean;
  /** When the Setpoints of rows with target/tolerance become effective - the moment of the import. Defaults to now, read once per run. */
  setpointValidFrom?: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, outcome: SensorImportOutcome) => void;
}

/** Records a Setpoint (a new open-ended interval; the API ends the Sensor's previous open one where it begins). */
function saveSetpoint(deviceId: number, sensorId: number, body: CreateSetpointRequest, signal?: AbortSignal, gate?: RateGate) {
  return attempt(
    async () => unwrap(await apiClient.POST('/api/Devices/{deviceId}/Sensors/{sensorId}/Setpoints', { params: { path: { deviceId, sensorId } }, body, signal })),
    signal,
    gate,
  );
}

/** The Setpoint effective now, `undefined` when there is none (the API's 404). */
function currentSetpoint(deviceId: number, sensorId: number, signal?: AbortSignal, gate?: RateGate): Promise<Attempt<SetpointDto | undefined>> {
  return attempt(async () => {
    try {
      return unwrap(await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}/Setpoints/Effective', { params: { path: { deviceId, sensorId } }, signal }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    }
  }, signal, gate);
}

/**
 * What one read of the whole Device gives, so an import of many existing Sensors does not read each Sensor's raw policy and effective setpoint one by one
 * (2 requests per Sensor): the raw / base policies and the setpoints effective now, by Sensor id. A part that was not needed or failed to load is
 * absent - the update then reads it per Sensor, as before.
 */
interface DeviceReads {
  policies?: Map<number, SensorAggregationPolicyDto[]>;
  setpoints?: Map<number, SetpointDto>;
}

/** Below this many existing rows the two Device-wide reads (which cover every Sensor of the Device) cost more than reading the few Sensors one by one. */
const BULK_READ_MIN_ROWS = 5;
/** Updates of existing Sensors are independent of each other and run this many at a time; creations stay one at a time (their ids follow the sheet order). */
const UPDATE_CONCURRENCY = 6;

async function readDevice(deviceId: number, rows: ParsedSensorRow[], signal: AbortSignal | undefined, gate: RateGate): Promise<DeviceReads> {
  const needPolicies = rows.some((r) => r.provided.rawScale || r.provided.rawLookback || r.provided.rawMinIssueScore);
  const needSetpoints = rows.some((r) => r.setpoint);
  const [policies, setpoints] = await Promise.all([
    needPolicies
      ? attempt(async () => unwrap(await apiClient.GET('/api/Devices/{deviceId}/AggregationPolicies', { params: { path: { deviceId } }, signal })), signal, gate)
      : undefined,
    needSetpoints
      ? attempt(async () => unwrap(await apiClient.GET('/api/Devices/{deviceId}/Setpoints/Effective', { params: { path: { deviceId } }, signal })), signal, gate)
      : undefined,
  ]);
  const reads: DeviceReads = {};
  if (policies?.ok) {
    reads.policies = new Map();
    for (const p of policies.value) {
      if (p.sensorId === undefined) continue;
      const list = reads.policies.get(p.sensorId) ?? [];
      list.push(p);
      reads.policies.set(p.sensorId, list);
    }
  }
  if (setpoints?.ok) {
    reads.setpoints = new Map();
    // Only the columns of a setpoint are used (mergeSetpoint); a Sensor without a row has no setpoint, like the single read's 404.
    for (const s of setpoints.value.setpoints ?? []) if (s.sensorId !== undefined) reads.setpoints.set(s.sensorId, s as SetpointDto);
  }
  return reads;
}

/** Runs the given tasks at most `limit` at a time; `run` returns when its own task has finished. */
function createLimiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= limit) return;
    queue.shift()?.();
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active += 1;
        task().then(resolve, reject).finally(() => {
          active -= 1;
          next();
        });
      });
      next();
    });
}

const same = (a: string | null | undefined, b: string) => (a ?? '').toLowerCase() === b.toLowerCase();

/**
 * Updates a Sensor that already exists with the cells the sheet filled - an empty cell never overwrites. Three independent
 * steps, each only when something differs: the Sensor itself (name, type, unit, direction, calculation switch, visible switch), its raw/base
 * aggregation policy (scale, lookback, min issue score) and its setpoint (a new interval from now; see mergeSetpoint).
 */
async function updateExisting(
  deviceId: number,
  sensor: SensorDto,
  row: ParsedSensorRow,
  validFrom: string,
  signal: AbortSignal | undefined,
  gate: RateGate,
  reads: DeviceReads | undefined,
): Promise<{ outcome: SensorImportOutcome; stop: boolean }> {
  const sensorId = sensor.id!;
  const outcome: SensorImportOutcome = { line: row.line, externalSensorId: row.externalSensorId, status: 'unchanged', sensorId };
  const changes: string[] = [];
  const failures: string[] = [];
  let stop = false;
  const fail = (what: string, r: Failed) => {
    failures.push(`${what}: ${r.message}`);
    if (r.stop) stop = true;
  };
  const finish = () => {
    if (changes.length > 0) outcome.changes = changes;
    if (failures.length > 0) {
      outcome.status = 'failed';
      outcome.message = failures.join(' ');
    } else if (changes.length > 0) {
      outcome.status = 'updated';
    }
    return { outcome, stop };
  };

  // 1. The Sensor itself.
  const sensorBody: UpdateSensorRequest = {};
  const sensorChanges: string[] = [];
  const p = row.provided;
  if (p.name && row.name !== (sensor.name ?? '')) {
    sensorBody.name = row.name;
    sensorChanges.push(`name "${sensor.name ?? ''}" -> "${row.name}"`);
  }
  if (p.sensorType && !same(sensor.sensorType, row.sensorType)) {
    sensorBody.sensorType = row.sensorType;
    sensorChanges.push(`sensorType ${sensor.sensorType ?? '-'} -> ${row.sensorType}`);
  }
  if (p.unitCode && !same(sensor.unitCode, row.unitCode)) {
    sensorBody.unitCode = row.unitCode;
    sensorChanges.push(`unitCode ${sensor.unitCode ?? '-'} -> ${row.unitCode}`);
  }
  if (p.direction && !same(sensor.direction, row.direction)) {
    sensorBody.direction = row.direction;
    sensorChanges.push(`direction ${sensor.direction ?? '-'} -> ${row.direction}`);
  }
  if (p.processingEnabled && row.processingEnabled !== (sensor.processingEnabled ?? true)) {
    sensorBody.processingEnabled = row.processingEnabled;
    sensorChanges.push(`Calculate ${sensor.processingEnabled ?? true} -> ${row.processingEnabled}`);
  }
  if (p.visible && row.visible !== (sensor.visible ?? true)) {
    sensorBody.visible = row.visible;
    sensorChanges.push(`Visible ${sensor.visible ?? true} -> ${row.visible}`);
  }
  if (sensorChanges.length > 0) {
    const r = await attempt(
      async () => unwrap(await apiClient.PUT('/api/Devices/{deviceId}/Sensors/{sensorId}', { params: { path: { deviceId, sensorId } }, body: sensorBody, signal })),
      signal,
      gate,
    );
    if (r.ok) changes.push(...sensorChanges);
    else fail('Sensor', r);
  }
  if (stop) return finish();

  // 2. The raw/base aggregation policy.
  if (p.rawScale || p.rawLookback || p.rawMinIssueScore) {
    // From the one read of the whole Device when there is one, else this Sensor's own read.
    const list: Attempt<SensorAggregationPolicyDto[]> = reads?.policies
      ? { ok: true, value: reads.policies.get(sensorId) ?? [] }
      : await attempt(
          async () => unwrap(await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}/AggregationPolicies', { params: { path: { deviceId, sensorId } }, signal })),
          signal,
          gate,
        );
    if (!list.ok) {
      fail('Policy', list);
    } else {
      const raw: SensorAggregationPolicyDto | undefined = list.value.find(isRawPolicy);
      if (!raw?.id) {
        failures.push('Policy: the Sensor has no raw/base aggregation policy to update.');
      } else {
        const body: UpdateAggregationPolicyRequest = {};
        const policyChanges: string[] = [];
        if (p.rawScale && !same(raw.scale, row.rawScale)) {
          body.scale = row.rawScale;
          policyChanges.push(`rawScale ${raw.scale ?? '-'} -> ${row.rawScale}`);
        }
        if (p.rawLookback && raw.lookback !== row.rawLookback) {
          body.lookback = row.rawLookback;
          policyChanges.push(`rawLookback ${raw.lookback} -> ${row.rawLookback}`);
        }
        if (p.rawMinIssueScore && raw.minIssueScore !== row.rawMinIssueScore) {
          body.minIssueScore = row.rawMinIssueScore;
          policyChanges.push(`rawMinIssueScore ${raw.minIssueScore} -> ${row.rawMinIssueScore}`);
        }
        if (policyChanges.length > 0) {
          const r = await attempt(
            async () => unwrap(await apiClient.PUT('/api/Devices/{deviceId}/Sensors/{sensorId}/AggregationPolicies/{policyId}', { params: { path: { deviceId, sensorId, policyId: raw.id! } }, body, signal })),
            signal,
            gate,
          );
          if (r.ok) changes.push(...policyChanges);
          else fail('Policy', r);
        }
      }
    }
  }
  if (stop) return finish();

  // 3. The setpoint: a new interval from now carrying the merged values.
  const wanted = row.setpoint;
  if (wanted) {
    const effective: Attempt<SetpointDto | undefined> = reads?.setpoints
      ? { ok: true, value: reads.setpoints.get(sensorId) }
      : await currentSetpoint(deviceId, sensorId, signal, gate);
    if (!effective.ok) {
      outcome.setpoint = 'failed';
      outcome.setpointMessage = effective.message;
      fail('Setpoint', effective);
    } else {
      const current = effective.value;
      // The direction the setpoint is read against: the one in the sheet if it was given, else the Sensor's own (the parser used the same).
      const direction = row.direction;
      const merge = mergeSetpoint(current, wanted, direction);
      if (merge.kind === 'unchanged') {
        outcome.setpoint = 'unchanged';
      } else if (merge.kind === 'invalid') {
        outcome.setpoint = 'failed';
        outcome.setpointMessage = merge.message;
        failures.push(`Setpoint: ${merge.message}`);
      } else {
        const saved = await saveSetpoint(deviceId, sensorId, { validFrom, ...merge.values }, signal, gate);
        if (saved.ok) {
          outcome.setpoint = 'created';
          const changed = SETPOINT_COLUMNS.filter((c: SetpointColumn) => wanted[c] !== undefined && wanted[c] !== (current?.[c] ?? undefined));
          changes.push(...changed.map((c: SetpointColumn) => `${c} ${current?.[c] ?? '-'} -> ${wanted[c]}`));
        } else {
          outcome.setpoint = 'failed';
          outcome.setpointMessage = saved.message;
          fail('Setpoint', saved);
        }
      }
    }
  }

  return finish();
}

/**
 * Applies the sheet to the Device, in sheet order: a Sensor that does not exist yet is created, one
 * that already exists (see `existing`) is updated with only the cells the sheet filled.
 *
 * Creations are strictly sequential on purpose: the API assigns each new Sensor the next
 * Device-scoped id, so creating them one at a time makes the numeric ids follow
 * the sheet's row order - which is what a Device's firmware mapping relies on.
 * Everything else is independent and runs side by side:
 * - the updates of existing Sensors (up to 6 at a time; when there are at least 5 of them, their raw policies and
 *   current setpoints come from ONE read of the whole Device each instead of 2 reads per Sensor);
 * - the first setpoint of a Sensor just created is saved in the background while the next Sensor is created.
 * A failure on one row never prevents the rest. The outcomes are returned in sheet order.
 *
 * - 429: waits the server's Retry-After (default 5 s, at most 60 s) and retries
 *   the same request, at most 4 times; one rate-limited request holds back all the others (shared gate).
 * - 409 "already exists" on create: reported as `skipped` (the Sensor appeared
 *   meanwhile), so re-running the same sheet is harmless.
 * - 401/403: stops the whole import - every following row would fail the same way.
 * - Aborting (the dialog's Stop) stops before the next row; what was already
 *   done stays done.
 */
export async function importSensors({ deviceId, rows, existing, isCurve, setpointValidFrom, signal, onProgress }: ImportSensorsArgs): Promise<SensorImportOutcome[]> {
  const slots: (SensorImportOutcome | undefined)[] = new Array(rows.length).fill(undefined);
  // One instant for the whole run: every imported Setpoint is effective from the moment of the import.
  const validFrom = setpointValidFrom ?? new Date().toISOString();
  const gate: RateGate = { until: 0 };
  const limit = createLimiter(UPDATE_CONCURRENCY);
  const background: Promise<unknown>[] = [];
  let done = 0;
  let stopped = false;

  const report = (index: number, outcome: SensorImportOutcome) => {
    slots[index] = outcome;
    done += 1;
    onProgress?.(done, rows.length, outcome);
  };
  const halted = () => stopped || signal?.aborted === true;
  const sensorOf = (row: ParsedSensorRow) => (row.exists ? existing?.get(row.externalSensorId.toLowerCase()) : undefined);

  const updating = rows.filter((row) => sensorOf(row)?.id !== undefined);
  const reads = updating.length >= BULK_READ_MIN_ROWS ? await readDevice(deviceId, updating, signal, gate) : undefined;

  for (const [index, row] of rows.entries()) {
    if (halted()) break;

    const sensor = sensorOf(row);
    if (sensor?.id !== undefined) {
      background.push(
        limit(async () => {
          if (halted()) return;
          const { outcome, stop } = await updateExisting(deviceId, sensor, row, validFrom, signal, gate, reads);
          report(index, outcome);
          if (stop) stopped = true;
        }),
      );
      continue;
    }

    const created = await attempt(
      async () =>
        unwrap(
          await apiClient.POST('/api/Devices/{deviceId}/Sensors', {
            params: { path: { deviceId } },
            body: {
              externalSensorId: row.externalSensorId,
              name: row.name || undefined,
              direction: row.direction,
              sensorType: row.sensorType || undefined,
              unitCode: row.unitCode || undefined,
              isCurve,
              rawScale: row.rawScale,
              rawLookback: row.rawLookback,
              rawMinIssueScore: row.rawMinIssueScore,
              processingEnabled: row.processingEnabled,
              visible: row.visible,
            },
            signal,
          }),
        ),
      signal,
      gate,
    );

    if (!created.ok) {
      if (signal?.aborted) break;
      if (created.status === 409 && /already exists/i.test(created.message)) {
        report(index, { line: row.line, externalSensorId: row.externalSensorId, status: 'skipped', message: created.message });
        continue;
      }
      report(index, { line: row.line, externalSensorId: row.externalSensorId, status: 'failed', message: created.message });
      if (created.stop) break;
      continue;
    }

    const outcome: SensorImportOutcome = { line: row.line, externalSensorId: row.externalSensorId, status: 'created', sensorId: created.value.id };

    // The row's target/tolerance become the new Sensor's first Setpoint, effective from the import - saved in the background while the next Sensor is created.
    if (outcome.sensorId !== undefined && row.setpoint) {
      const sensorId = outcome.sensorId;
      const setpoint = row.setpoint;
      background.push(
        limit(async () => {
          const saved = await saveSetpoint(deviceId, sensorId, { validFrom, ...setpoint }, signal, gate);
          outcome.setpoint = saved.ok ? 'created' : 'failed';
          if (!saved.ok) {
            outcome.setpointMessage = saved.message;
            if (saved.stop) stopped = true;
          }
          report(index, outcome);
        }),
      );
    } else {
      report(index, outcome);
    }
  }

  await Promise.all(background);
  return slots.filter((outcome): outcome is SensorImportOutcome => outcome !== undefined);
}

/** Runs {@link importSensors} and refreshes the Device's Sensor list afterwards - also after a partial or cancelled run, since some Sensors may exist now. */
export function useImportSensors(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: Omit<ImportSensorsArgs, 'deviceId'>) => importSensors({ ...args, deviceId }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sensorTypes });
      queryClient.invalidateQueries({ queryKey: queryKeys.recalculation(deviceId) }); // a Calculate cell switched on starts a catch-up
    },
  });
}
