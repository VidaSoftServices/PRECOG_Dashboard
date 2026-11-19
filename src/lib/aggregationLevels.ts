import { AGGREGATION_FUNCTION_OPTIONS, TIME_SCALE_OPTIONS } from '@/lib/aggregationOptions';
import { isRawPolicy } from '@/lib/policies';

/** The part of an aggregation policy the pickers need (the Device-wide list of `GET /api/Devices/{id}/AggregationPolicies`). */
export interface LevelPolicy {
  id?: number | null;
  sensorId?: number | null;
  sourceDataKey?: string | null;
  timeScale?: string | null;
  aggregationFunction?: string | null;
  enabled?: boolean | null;
  calculationEnabled?: boolean | null;
}

/** One aggregation level a Sensor has, as a picker offers it. `key` is the level without the Sensor (time scale + function): the same on every Sensor that has it. */
export interface AggregationLevel {
  key: string;
  policyId: number;
  timeScale: string;
  aggregationFunction: string;
  /** English, e.g. "1 day · Average"; translate with `t()` where it is shown. */
  label: string;
  /** False = the level is only aggregated (to look at), never evaluated: the pickers say "Calculation off". */
  calculationEnabled: boolean;
  /** The length of one bucket in milliseconds (a month = 31 days, a year = 366 days: only used to size the window). */
  bucketMs: number;
}

const DAY = 86_400_000;
const BUCKET_MS: Record<string, number> = {
  seconds15: 15_000,
  seconds30: 30_000,
  minutes: 60_000,
  minutes15: 15 * 60_000,
  minutes30: 30 * 60_000,
  hours: 3_600_000,
  hours4: 4 * 3_600_000,
  hours12: 12 * 3_600_000,
  days: DAY,
  days3: 3 * DAY,
  weeks: 7 * DAY,
  weeks2: 14 * DAY,
  months: 31 * DAY,
  months3: 92 * DAY,
  months6: 183 * DAY,
  years: 366 * DAY,
};

const canon = (options: readonly { value: string; label: string }[], raw: string | null | undefined) =>
  options.find((o) => o.value.toLowerCase() === (raw ?? '').trim().toLowerCase());

export function levelKey(timeScale: string, aggregationFunction: string): string {
  return `${timeScale.toLowerCase()}|${aggregationFunction.toLowerCase()}`;
}

export function toLevel(policy: LevelPolicy): AggregationLevel | null {
  if (policy.id == null || !policy.timeScale || !policy.aggregationFunction) return null;
  const scale = canon(TIME_SCALE_OPTIONS, policy.timeScale);
  const fn = canon(AGGREGATION_FUNCTION_OPTIONS, policy.aggregationFunction);
  return {
    key: levelKey(policy.timeScale, policy.aggregationFunction),
    policyId: policy.id,
    timeScale: scale?.value ?? policy.timeScale,
    aggregationFunction: fn?.value ?? policy.aggregationFunction,
    label: `${scale?.label ?? policy.timeScale} · ${fn?.label ?? policy.aggregationFunction}`,
    bucketMs: BUCKET_MS[policy.timeScale.toLowerCase()] ?? DAY,
    calculationEnabled: policy.calculationEnabled !== false,
  };
}

/** Enabled aggregate levels of the measured values (not the raw level), shortest time scale first, then by function. */
function usable(policies: readonly LevelPolicy[] | undefined): LevelPolicy[] {
  return (policies ?? []).filter((p) => p.enabled !== false && !isRawPolicy(p) && (p.sourceDataKey ?? 'Actual').toLowerCase() === 'actual');
}

/** The levels one Sensor has. */
export function levelsOfSensor(policies: readonly LevelPolicy[] | undefined, sensorId: number | undefined): AggregationLevel[] {
  if (sensorId === undefined) return [];
  return sortLevels(usable(policies).filter((p) => p.sensorId === sensorId).map(toLevel).filter((l): l is AggregationLevel => l !== null));
}

/** The distinct levels (time scale + function) that at least one of the given Sensors has. */
export function levelsOfSensors(policies: readonly LevelPolicy[] | undefined, sensorIds: readonly number[] | undefined): AggregationLevel[] {
  const ids = sensorIds ? new Set(sensorIds) : undefined;
  const byKey = new Map<string, AggregationLevel>();
  for (const p of usable(policies)) {
    if (ids && (p.sensorId == null || !ids.has(p.sensorId))) continue;
    const level = toLevel(p);
    if (level && !byKey.has(level.key)) byKey.set(level.key, level);
  }
  return sortLevels([...byKey.values()]);
}

/** The policy of a Sensor for a level key, or undefined when that Sensor does not have the level. */
export function levelOfSensorByKey(policies: readonly LevelPolicy[] | undefined, sensorId: number | undefined, key: string): AggregationLevel | undefined {
  return levelsOfSensor(policies, sensorId).find((l) => l.key === key);
}

function sortLevels(levels: AggregationLevel[]): AggregationLevel[] {
  return [...levels].sort((a, b) => a.bucketMs - b.bucketMs || a.aggregationFunction.localeCompare(b.aggregationFunction));
}

/** What the user chose in a picker: the level's key and bucket length, so a Sensor that lacks that exact level can get the closest one. */
export interface LevelPreference {
  key: string;
  bucketMs: number;
}

/**
 * The level of a Sensor for a preference: the very same level (time scale + function) when it has it, otherwise the one with the closest bucket length
 * (the same function preferred when two are equally close). Undefined when the Sensor has no level at all.
 */
export function pickLevel(sensorLevels: readonly AggregationLevel[], preference: LevelPreference | undefined): AggregationLevel | undefined {
  if (!preference || sensorLevels.length === 0) return undefined;
  const exact = sensorLevels.find((l) => l.key === preference.key);
  if (exact) return exact;
  const fn = preference.key.split('|')[1];
  const distance = (l: AggregationLevel) => Math.abs(Math.log(l.bucketMs / preference.bucketMs));
  return [...sensorLevels].sort((a, b) => distance(a) - distance(b) || Number(b.key.split('|')[1] === fn) - Number(a.key.split('|')[1] === fn))[0];
}

/** Fewest buckets an aggregated chart shows: a short wall-clock range (the default 15 minutes) holds no day at all, so the window is widened back to this many buckets. */
export const MIN_AGGREGATED_BUCKETS = 60;

/**
 * The range to read buckets for: the buckets that START inside [start, end) plus the one that contains `start` (so a 15-minute range of a daily level still shows
 * today), and at least MIN_AGGREGATED_BUCKETS buckets ending at `end`.
 */
export function aggregatedRange(start: Date, end: Date, bucketMs: number): { startDate: string; endDate: string; widened: boolean } {
  const wanted = Math.min(start.getTime() - bucketMs, end.getTime() - MIN_AGGREGATED_BUCKETS * bucketMs);
  return { startDate: new Date(wanted).toISOString(), endDate: end.toISOString(), widened: wanted < start.getTime() - bucketMs };
}
