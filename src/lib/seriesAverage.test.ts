import { describe, it, expect } from 'vitest';
import { seriesAverage } from './seriesAverage';
import type { TelemetryPoint } from '@/api/hooks/telemetry';

const point = (actual: number | null | undefined): TelemetryPoint => ({ measured: '2026-10-21T10:00:00Z', actual }) as TelemetryPoint;

describe('seriesAverage', () => {
  it('is the plain arithmetic mean of the plotted values, with how many values it is made of', () => {
    expect(seriesAverage([point(1), point(2), point(6)])).toEqual({ value: 3, count: 3 });
  });

  it('leaves out points without a value (they are not zeros)', () => {
    expect(seriesAverage([point(2), point(null), point(undefined), point(4)])).toEqual({ value: 3, count: 2 });
  });

  it('ignores values that are not finite numbers', () => {
    expect(seriesAverage([point(1), point(Number.NaN), point(Number.POSITIVE_INFINITY), point(3)])).toEqual({ value: 2, count: 2 });
  });

  it('keeps negative values and a zero mean', () => {
    expect(seriesAverage([point(-2), point(2)])).toEqual({ value: 0, count: 2 });
    expect(seriesAverage([point(-5), point(-1)])).toEqual({ value: -3, count: 2 });
  });

  it('is null when there is nothing to average, so no line is drawn', () => {
    expect(seriesAverage([])).toBeNull();
    expect(seriesAverage([point(null), point(undefined)])).toBeNull();
  });
});
