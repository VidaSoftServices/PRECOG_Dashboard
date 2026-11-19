import { describe, it, expect } from 'vitest';
import { bucketToPoint } from './aggregatedPoints';

describe('bucketToPoint', () => {
  it('carries the anomaly of the bucket so the chart marks it like an anomalous raw reading', () => {
    expect(bucketToPoint(7, { bucketStart: '2026-11-19T00:00:00Z', value: 3, anomaly: 2 }).anomaly).toBe(2);
    expect(bucketToPoint(7, { bucketStart: '2026-11-19T00:00:00Z', value: 3, anomaly: 1 }).anomaly).toBe(1);
  });

  it('has no anomaly for a bucket that was not evaluated', () => {
    expect(bucketToPoint(7, { bucketStart: '2026-11-19T00:00:00Z', value: 3 }).anomaly).toBeNull();
  });
});
