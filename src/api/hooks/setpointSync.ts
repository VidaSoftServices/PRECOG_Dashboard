import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { attempt } from '@/api/rateLimited';
import type { CreateSetpointRequest } from '@/api/hooks/setpoints';
import { SETPOINT_COLUMNS } from '@/lib/sensorImport';
import type { SensorSyncPlan } from '@/lib/setpointSheet';

export interface SensorSyncOutcome {
  sensorName: string;
  deleted: number;
  created: number;
  /** Why something did not happen; a Sensor with failures can be finished by importing the same sheet again. */
  failures: string[];
}

export interface ApplySetpointSyncArgs {
  deviceId: number;
  plans: readonly SensorSyncPlan[];
  signal?: AbortSignal;
  /** Called after every request with how many of the planned requests are done. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Carries out the plan, one request after another (the same single-request-in-flight rule as every other bulk operation here):
 * per Sensor first every DELETE, then the creates in chronological order, so a replaced interval is gone before its successor is
 * made. If a delete fails the Sensor's creates are skipped (they could collide with what is still there) and the failure is listed;
 * a failed create does not stop the others. Nothing is atomic across requests - importing the same sheet again finishes whatever
 * did not go through, because the plan is recomputed from what is stored. 429 waits Retry-After; 401/403 or Stop ends the run.
 */
export async function applySetpointSync({ deviceId, plans, signal, onProgress }: ApplySetpointSyncArgs): Promise<SensorSyncOutcome[]> {
  const total = plans.reduce((sum, p) => sum + p.remove.length + p.create.length, 0);
  let done = 0;
  const outcomes: SensorSyncOutcome[] = [];
  const tick = () => onProgress?.(++done, total);

  for (const plan of plans) {
    if (plan.remove.length === 0 && plan.create.length === 0) continue;
    if (signal?.aborted) break;
    const sensorId = plan.sensor.id;
    const outcome: SensorSyncOutcome = { sensorName: plan.sensor.externalSensorId, deleted: 0, created: 0, failures: [] };
    outcomes.push(outcome);
    let stop = false;
    let deleteFailed = false;

    for (const { interval } of plan.remove) {
      const r = await attempt(
        async () => unwrap(await apiClient.DELETE('/api/Devices/{deviceId}/Sensors/{sensorId}/Setpoints/{setpointId}', { params: { path: { deviceId, sensorId, setpointId: interval.id } }, signal })),
        signal,
      );
      tick();
      if (r.ok) outcome.deleted += 1;
      else {
        deleteFailed = true;
        outcome.failures.push(`Deleting the interval from ${interval.validFrom}: ${r.message}`);
        if (r.stop) {
          stop = true;
          break;
        }
      }
    }
    if (stop) return outcomes;

    for (const { interval } of plan.create) {
      if (deleteFailed) {
        // Skipped, not attempted: it could overlap an interval that is still stored.
        tick();
        continue;
      }
      const body: CreateSetpointRequest = { validFrom: new Date(interval.validFromMs).toISOString() };
      if (interval.validToMs !== null) body.validTo = new Date(interval.validToMs).toISOString();
      for (const column of SETPOINT_COLUMNS) {
        const value = interval.values[column];
        if (value !== undefined) body[column] = value;
      }
      const r = await attempt(
        async () => unwrap(await apiClient.POST('/api/Devices/{deviceId}/Sensors/{sensorId}/Setpoints', { params: { path: { deviceId, sensorId } }, body, signal })),
        signal,
      );
      tick();
      if (r.ok) outcome.created += 1;
      else {
        outcome.failures.push(`Creating the interval from ${body.validFrom}: ${r.message}`);
        if (r.stop) return outcomes;
      }
    }
    if (deleteFailed) outcome.failures.push('The new intervals of this Sensor were not created because a deletion failed - import the same sheet again.');
  }
  return outcomes;
}

/** Runs {@link applySetpointSync} and refreshes everything that shows Setpoints of the Device - also after a partial or stopped run. */
export function useApplySetpointSync(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: Omit<ApplySetpointSyncArgs, 'deviceId'>) => applySetpointSync({ ...args, deviceId }),
    onSettled: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'devices' && q.queryKey[1] === deviceId && q.queryKey.includes('setpoints') });
    },
  });
}
