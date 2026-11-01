import { describe, it, expect } from 'vitest';
import { missingReferenceNotice } from './referenceData';
import type { TelemetryPoint } from '@/api/hooks/telemetry';

const point = (extra: Partial<TelemetryPoint> = {}): TelemetryPoint => ({ measured: '2026-10-21T10:00:00Z', actual: 1.7, ...extra }) as TelemetryPoint;
const FULL = { target: 2, tolerance: 0.05, upperControlLimit3S: 1.99, upperControlLimit2S: 1.9, lowerControlLimit2S: 1.55, lowerControlLimit3S: 1.47 };

describe('missingReferenceNotice', () => {
  it('says nothing when there are no readings (nothing to explain yet)', () => {
    expect(missingReferenceNotice([])).toBeUndefined();
  });

  it('says nothing when the readings carry a target and control limits', () => {
    expect(missingReferenceNotice([point(FULL), point(FULL)])).toBeUndefined();
  });

  it('explains that neither target nor limits exist, naming the setpoint and the analysis conditions', () => {
    const notice = missingReferenceNotice([point(), point()])!;

    expect(notice.title).toBe('No Target, Tolerance or control limits');
    expect(notice.text).toMatch(/setpoint/);
    expect(notice.text).toMatch(/whether it has a setpoint or not/); // the limits do not depend on the setpoint
    expect(notice.text).toMatch(/Calculate/);
    expect(notice.text).toMatch(/standard deviations/); // the limits are statistics of the readings, not derived from target or tolerance
  });

  it('explains missing control limits when the setpoint is there', () => {
    const notice = missingReferenceNotice([point({ target: 2, tolerance: 0.05 })])!;

    expect(notice.title).toBe('No control limits yet');
    expect(notice.text).toMatch(/UCL3, UCL2, LCL2 and LCL3/);
  });

  it('explains a missing target when only limits exist', () => {
    expect(missingReferenceNotice([point({ upperControlLimit3S: 1.99 })])!.title).toBe('No Target or Tolerance');
  });

  it('counts a bidirectional target as a target, and one reading with values is enough for the whole window', () => {
    expect(missingReferenceNotice([point(), point({ targetAbove: 100, upperControlLimit2S: 9 })])).toBeUndefined();
    expect(missingReferenceNotice([point(), point({ targetBelow: 50, lowerControlLimit3S: 1 })])).toBeUndefined();
  });
});
