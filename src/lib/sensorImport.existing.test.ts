import { describe, it, expect } from 'vitest';
import { mergeSetpoint, parseSensorTable, type ExistingSensorInfo, type ImportDefaults } from './sensorImport';
import { CATALOG } from '@/test/sensorCatalog';

const DEFAULTS: ImportDefaults = { direction: 'lowerisbetter', rawScale: 'Seconds', rawLookback: '60', rawMinIssueScore: '1', processingEnabled: true };
const EXISTING = new Map<string, ExistingSensorInfo>([
  ['old_1', { direction: 'lowerisbetter' }],
  ['bi_1', { direction: 'bidirectional' }],
]);

const parse = (text: string, defaults: ImportDefaults = DEFAULTS) => parseSensorTable(text, defaults, CATALOG, EXISTING);

describe('parseSensorTable - rows for Sensors that already exist', () => {
  it('marks a row as an update, matching the sensorName case-insensitively', () => {
    const { rows } = parse('sensorName\nOLD_1\nnew_1');
    expect(rows.map((r) => r.exists)).toEqual([true, false]);
  });

  it('needs no scale, lookback or unit for an existing Sensor, and applies no defaults to it', () => {
    const { rows } = parse('sensorName\tdisplayName\nold_1\tRenamed', { ...DEFAULTS, rawScale: '', rawLookback: '' });
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.provided).toMatchObject({ name: true, direction: false, rawScale: false, rawLookback: false, rawMinIssueScore: false, processingEnabled: false });
  });

  it('still demands scale and lookback for a NEW Sensor', () => {
    const { rows } = parse('sensorName\nnew_1', { ...DEFAULTS, rawScale: '', rawLookback: '' });
    expect(rows[0]!.issues.map((i) => i.field)).toEqual(['rawScale', 'rawLookback']);
  });

  it('records which cells were filled', () => {
    const { rows } = parse('sensorName\trawLookback\tCalculate\nold_1\t200\toff');
    expect(rows[0]!.provided).toMatchObject({ rawLookback: true, processingEnabled: true, rawScale: false });
    expect(rows[0]!.rawLookback).toBe(200);
    expect(rows[0]!.processingEnabled).toBe(false);
  });

  it('still validates what is filled', () => {
    const { rows } = parse('sensorName\trawLookback\trawScale\nold_1\t0\tFortnights');
    expect(rows[0]!.issues.map((i) => i.field)).toEqual(['rawScale', 'rawLookback']);
  });

  it('reads the setpoint against the Sensor\'s own direction when the sheet gives none', () => {
    const one = parse('sensorName\ttarget\nold_1\t5').rows[0]!;
    expect(one.errors).toEqual([]);
    expect(one.setpoint).toEqual({ target: 5 });
    // A one-sided column on a bidirectional Sensor is refused.
    expect(parse('sensorName\ttarget\nbi_1\t5').rows[0]!.issues.map((i) => i.field)).toEqual(['target']);
    expect(parse('sensorName\ttargetAbove\nbi_1\t5').rows[0]!.errors).toEqual([]);
  });

  it('accepts a tolerance without a target - the target is the Sensor\'s current one, checked when the import runs', () => {
    const row = parse('sensorName\ttolerance\nold_1\t2').rows[0]!;
    expect(row.errors).toEqual([]);
    expect(row.setpoint).toEqual({ tolerance: 2 });
    // ...but not for a new Sensor, which has no setpoint to inherit.
    expect(parse('sensorName\ttolerance\nnew_1\t2').rows[0]!.issues.map((i) => i.field)).toEqual(['target']);
  });

  it('rejects a negative tolerance for an existing Sensor too', () => {
    expect(parse('sensorName\ttolerance\nold_1\t-1').rows[0]!.issues.map((i) => i.field)).toEqual(['tolerance']);
  });
});

describe('mergeSetpoint', () => {
  it('replaces the filled values and carries over the rest', () => {
    expect(mergeSetpoint({ target: 5, tolerance: 1 }, { target: 7 }, 'lowerisbetter')).toEqual({ kind: 'change', values: { target: 7, tolerance: 1 } });
    expect(mergeSetpoint({ target: 5, tolerance: 1 }, { tolerance: 2 }, 'higherisbetter')).toEqual({ kind: 'change', values: { target: 5, tolerance: 2 } });
  });

  it('writes nothing when every filled value already matches', () => {
    expect(mergeSetpoint({ target: 5, tolerance: 1 }, { target: 5 }, 'lowerisbetter')).toEqual({ kind: 'unchanged' });
    expect(mergeSetpoint({ target: 5, tolerance: null }, { target: 5 }, 'lowerisbetter')).toEqual({ kind: 'unchanged' });
  });

  it('a tolerance cannot be set where there is no target', () => {
    expect(mergeSetpoint(undefined, { tolerance: 2 }, 'lowerisbetter').kind).toBe('invalid');
    expect(mergeSetpoint({ target: null, tolerance: 1 }, { tolerance: 2 }, 'lowerisbetter').kind).toBe('invalid');
  });

  it('creates the first setpoint of a Sensor that had none', () => {
    expect(mergeSetpoint(undefined, { target: 5, tolerance: 1 }, 'lowerisbetter')).toEqual({ kind: 'change', values: { target: 5, tolerance: 1 } });
  });

  it('works per side for a bidirectional Sensor and drops the one-sided values it may still carry', () => {
    const current = { target: 9, targetAbove: 5, toleranceAbove: 1, targetBelow: 3, toleranceBelow: 1 };
    expect(mergeSetpoint(current, { toleranceBelow: 2 }, 'bidirectional')).toEqual({
      kind: 'change',
      values: { targetAbove: 5, toleranceAbove: 1, targetBelow: 3, toleranceBelow: 2 },
    });
    expect(mergeSetpoint({ targetAbove: 5 }, { toleranceBelow: 2 }, 'bidirectional').kind).toBe('invalid'); // no targetBelow to attach it to
    expect(mergeSetpoint(undefined, { targetBelow: 3 }, 'bidirectional')).toEqual({ kind: 'change', values: { targetBelow: 3 } });
  });
});
