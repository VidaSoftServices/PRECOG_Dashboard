import type { TelemetryPoint } from '@/api/hooks/telemetry';

/**
 * The arithmetic mean of a series' plotted values and how many values it is made of, or null when there is none. Points without a
 * value (no Actual row) are left out; nothing is weighted by time or smoothed. A descriptive statistic of exactly the points that are
 * on screen - not a platform calculation (anomaly, control limits and the like are always the API's).
 */
export function seriesAverage(points: readonly TelemetryPoint[]): { value: number; count: number } | null {
  let sum = 0;
  let count = 0;
  for (const p of points) {
    if (p.actual != null && Number.isFinite(p.actual)) {
      sum += p.actual;
      count += 1;
    }
  }
  return count === 0 ? null : { value: sum / count, count };
}
