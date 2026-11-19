/**
 * The maintenance markers of a chart (blue dashed vertical lines, the user's request of 2026-11-19), built from the API's maintenance history
 * (`GET /api/Devices/{deviceId}/Maintenances`). Pure: the chart only draws what this returns.
 *
 * - Only finished maintenances (an `endedAt`) of the Sensors on the chart; a running maintenance has no data to mark yet.
 * - A replacement carries the end of its warm-up for the level the chart shows (the raw level, or the chosen aggregation level), taken
 *   from the API's `warmUps` - the warm-up rules live in the API, nothing is calculated here.
 * - The same maintenance of several Sensors (a Device-wide one) is ONE marker.
 */

export type MaintenanceKind = 'Replacement' | 'Minor';

/** What the API sends for one maintenance (the fields used here). */
export interface MaintenanceRecordLike {
  sensorId?: number;
  startedAt?: string;
  endedAt?: string | null;
  kind?: string | null;
  manualBaseline?: boolean;
  warmUps?: readonly { policyId?: number; timeScale?: string | null; warmUpEndsAt?: string }[] | null;
}

export interface ChartMaintenanceMarker {
  startedAt: string;
  endedAt: string;
  kind: MaintenanceKind;
  /** A baseline started by hand (no maintenance mode). */
  manualBaseline: boolean;
  /** End of the warm-up shown for a replacement (null for a minor maintenance, or when the level has no warm-up in the response). */
  warmUpEndsAt: string | null;
}

/**
 * The markers of the maintenances of `sensorIds`. `policyId`: the aggregation level the chart shows (or, for several Sensors, a function giving each
 * Sensor's level); undefined = the raw readings (the warm-up of the `Native` level).
 */
export function maintenanceMarkers(
  records: readonly MaintenanceRecordLike[] | null | undefined,
  sensorIds: readonly number[],
  policyId?: number | ((sensorId: number) => number | undefined),
): ChartMaintenanceMarker[] {
  if (!records || sensorIds.length === 0) return [];
  const wanted = new Set(sensorIds);
  const byKey = new Map<string, ChartMaintenanceMarker>();
  for (const r of records) {
    if (r.sensorId === undefined || !wanted.has(r.sensorId) || !r.startedAt || !r.endedAt) continue;
    const kind: MaintenanceKind = r.kind === 'Replacement' ? 'Replacement' : 'Minor';
    const level = typeof policyId === 'function' ? policyId(r.sensorId) : policyId;
    const warmUp =
      kind === 'Replacement'
        ? (r.warmUps ?? []).find((w) => (level === undefined ? w.timeScale === 'Native' : w.policyId === level))?.warmUpEndsAt ?? null
        : null;
    const key = `${r.startedAt}|${r.endedAt}|${kind}`;
    const existing = byKey.get(key);
    // The same maintenance of several Sensors: one marker, with the longest warm-up shown.
    if (existing) {
      if (warmUp && (!existing.warmUpEndsAt || Date.parse(warmUp) > Date.parse(existing.warmUpEndsAt))) existing.warmUpEndsAt = warmUp;
      continue;
    }
    byKey.set(key, { startedAt: r.startedAt, endedAt: r.endedAt, kind, manualBaseline: r.manualBaseline === true, warmUpEndsAt: warmUp });
  }
  return Array.from(byKey.values()).sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt));
}

/**
 * The x position of an instant on a chart whose x axis is the sorted list of instants `labels` (a category axis): between two labels it is
 * interpolated linearly, before the first or after the last it is null (not on the chart). `pixelOf(index)` is the axis' pixel of a label.
 */
export function pixelOfInstant(labels: readonly string[], instant: string, pixelOf: (index: number) => number): number | null {
  if (labels.length === 0) return null;
  const t = Date.parse(instant);
  const first = Date.parse(labels[0]!);
  const last = Date.parse(labels[labels.length - 1]!);
  if (Number.isNaN(t) || t < first || t > last) return null;
  let lo = 0;
  let hi = labels.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (Date.parse(labels[mid]!) <= t) lo = mid;
    else hi = mid;
  }
  const a = Date.parse(labels[lo]!);
  const b = Date.parse(labels[hi]!);
  const fraction = b > a ? (t - a) / (b - a) : 0;
  return pixelOf(lo) + fraction * (pixelOf(hi) - pixelOf(lo));
}
