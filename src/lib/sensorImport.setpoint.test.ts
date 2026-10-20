import { describe, it, expect } from 'vitest';
import { buildTemplateCsv, parseSensorTable, TEMPLATE_HEADERS, type ImportDefaults } from './sensorImport';
import { CATALOG } from '@/test/sensorCatalog';

const DEFAULTS: ImportDefaults = { direction: 'lowerisbetter', rawScale: 'Seconds', rawLookback: '60', rawMinIssueScore: '1', processingEnabled: true };

const parse = (text: string, defaults: ImportDefaults = DEFAULTS) => parseSensorTable(text, defaults, CATALOG);

describe('setpoint columns (target / tolerance) of the Sensor import', () => {
  it('reads target and tolerance of a one-sided Sensor', () => {
    const { rows, fileErrors } = parse('externalSensorId,target,tolerance\nt_1,5,0.5');
    expect(fileErrors).toEqual([]);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.setpoint).toEqual({ target: 5, tolerance: 0.5 });
  });

  it('reads the four bidirectional columns', () => {
    const { rows } = parse('externalSensorId,direction,targetAbove,targetBelow,toleranceAbove,toleranceBelow\nr_1,bidirectional,1500,1400,20,10');
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.setpoint).toEqual({ targetAbove: 1500, targetBelow: 1400, toleranceAbove: 20, toleranceBelow: 10 });
  });

  it('a row without any setpoint value has no setpoint, and neither has a sheet without the columns', () => {
    expect(parse('externalSensorId,target\nt_1,').rows[0]!.setpoint).toBeUndefined();
    expect(parse('externalSensorId\nt_1').rows[0]!.setpoint).toBeUndefined();
  });

  it('a tolerance is optional, a target is not', () => {
    expect(parse('externalSensorId,target\nt_1,5').rows[0]!.errors).toEqual([]);
    const bad = parse('externalSensorId,tolerance\nt_1,0.5').rows[0]!;
    expect(bad.issues.map((i) => i.field)).toEqual(['target']);
    expect(bad.errors[0]).toMatch(/needs a target/);
  });

  it('uses the direction the row resolves to - the dialog default included', () => {
    const bidirectionalDefault: ImportDefaults = { ...DEFAULTS, direction: 'bidirectional' };
    const { rows } = parse('externalSensorId,targetAbove\nr_1,10', bidirectionalDefault);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.setpoint).toEqual({ targetAbove: 10 });
  });

  it('rejects target/tolerance on a bidirectional Sensor and above/below on a one-sided one, naming the field', () => {
    const wrongOne = parse('externalSensorId,direction,targetAbove,toleranceAbove\nt_1,higherisbetter,5,1').rows[0]!;
    expect(wrongOne.issues.map((i) => i.field)).toEqual(['targetAbove', 'toleranceAbove', 'target']);
    expect(wrongOne.issues[0]!.value).toBe('5');
    expect(wrongOne.issues[0]!.message).toMatch(/bidirectional Sensors only/);

    const wrongBi = parse('externalSensorId,direction,target,tolerance\nr_1,bidirectional,5,1').rows[0]!;
    expect(wrongBi.issues.map((i) => i.field)).toEqual(['target', 'tolerance', 'targetAbove']);
  });

  it('a bidirectional tolerance needs the target of its own side', () => {
    const { rows } = parse('externalSensorId,direction,targetAbove,toleranceBelow\nr_1,bidirectional,10,2');
    expect(rows[0]!.issues.map((i) => i.field)).toEqual(['toleranceBelow']);
    expect(rows[0]!.errors[0]).toMatch(/needs targetBelow/);
  });

  it('rejects text, a negative tolerance and non-finite numbers', () => {
    const { rows } = parse('externalSensorId,target,tolerance\na_1,abc,1\nb_1,5,-1\nc_1,Infinity,1\nd_1,1e,1');
    expect(rows[0]!.issues.find((i) => i.field === 'target')).toMatchObject({ value: 'abc' });
    expect(rows[1]!.issues[0]).toMatchObject({ field: 'tolerance', value: '-1' });
    expect(rows[2]!.issues.some((i) => i.field === 'target' && i.value === 'Infinity')).toBe(true);
    expect(rows[3]!.issues.some((i) => i.field === 'target' && i.value === '1e')).toBe(true);
  });

  it('accepts a decimal comma (a Hungarian Excel) and a negative target', () => {
    const { rows } = parse('externalSensorId\ttarget\ttolerance\nt_1\t-2,5\t0,25');
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.setpoint).toEqual({ target: -2.5, tolerance: 0.25 });
  });

  it('reads the template headers "target (optional)" and "tolerance (optional)" as target and tolerance', () => {
    const { rows, ignoredColumns } = parse('sensorName,target (optional),tolerance (optional)\nt_1,5,0.5');
    expect(ignoredColumns).toEqual([]);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.setpoint).toEqual({ target: 5, tolerance: 0.5 });
    // Any spelling of the hint works, and the plain names still do.
    expect(parse('sensorName;TARGET(Optional);Tolerance  (optional)\nt_1;4;1').rows[0]!.setpoint).toEqual({ target: 4, tolerance: 1 });
  });

  it('accepts a target of zero (not treated as empty)', () => {
    const { rows } = parse('externalSensorId,target,tolerance\nt_1,0,0');
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.setpoint).toEqual({ target: 0, tolerance: 0 });
  });

  it('the template lists the setpoint columns, and the id/name columns are sensorName and displayName', () => {
    expect(TEMPLATE_HEADERS.slice(0, 2)).toEqual(['sensorName', 'displayName']);
    for (const column of ['target (optional)', 'tolerance (optional)', 'targetAbove', 'targetBelow', 'toleranceAbove', 'toleranceBelow']) expect(TEMPLATE_HEADERS).toContain(column);
    const csv = buildTemplateCsv(CATALOG).replace(/^\uFEFF/, '');
    const [header, firstRow] = csv.split('\r\n');
    expect(header!.split(',')).toEqual([...TEMPLATE_HEADERS]);
    // The example rows are importable as they are.
    const parsed = parse(csv);
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(firstRow).toBeTruthy();
  });
});
