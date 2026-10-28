import { describe, it, expect } from 'vitest';
import {
  buildSetpointsExportCsv,
  parseInstant,
  parseSetpointSheet,
  planSetpointSync,
  summarizePlan,
  type ExistingInterval,
  type SheetSensor,
} from './setpointSheet';

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const D = (day: number) => Date.UTC(2026, 0, day);

const SENSORS: SheetSensor[] = [
  { id: 1, externalSensorId: 'temp_a', direction: 'lowerisbetter' },
  { id: 2, externalSensorId: 'rpm_b', direction: 'bidirectional' },
  { id: 3, externalSensorId: 'press_c', direction: 'higherisbetter' },
  { id: 4, externalSensorId: 'untouched_d', direction: 'lowerisbetter' },
];

const iv = (id: number, sensorId: number, from: number, to: number | null, values: Partial<ExistingInterval> = {}): ExistingInterval => ({
  id,
  sensorId,
  validFrom: new Date(from).toISOString(),
  validTo: to === null ? null : new Date(to).toISOString(),
  target: 5,
  tolerance: 1,
  ...values,
});

const STORED: ExistingInterval[] = [
  iv(11, 1, D(1), D(10)),
  iv(12, 1, D(10), D(20), { target: 6 }),
  iv(13, 1, D(20), null, { target: 7, tolerance: 2 }),
  iv(21, 2, D(1), null, { target: null, tolerance: null, targetAbove: 100, toleranceAbove: 5, targetBelow: 50, toleranceBelow: 5 }),
  iv(41, 4, D(1), null),
];

const HEADER = 'sensorName,validFrom,validTo,target,tolerance,targetAbove,targetBelow,toleranceAbove,toleranceBelow';
const parse = (rows: string[]) => parseSetpointSheet([HEADER, ...rows].join('\n'), SENSORS, NOW);

describe('buildSetpointsExportCsv', () => {
  it('lists every interval of every Sensor ordered by Sensor id then validFrom, and a bare row for a Sensor with none', () => {
    const lines = buildSetpointsExportCsv(SENSORS, [...STORED].reverse()).replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe('temp_a,2026-01-01T00:00:00Z,2026-01-10T00:00:00Z,5,1,,,,');
    expect(lines[2]).toBe('temp_a,2026-01-10T00:00:00Z,2026-01-20T00:00:00Z,6,1,,,,');
    expect(lines[3]).toBe('temp_a,2026-01-20T00:00:00Z,,7,2,,,,');
    expect(lines[4]).toBe('rpm_b,2026-01-01T00:00:00Z,,,,100,50,5,5');
    expect(lines[5]).toBe('press_c,,,,,,,,'); // no interval: a row to fill in
    expect(lines[6]).toBe('untouched_d,2026-01-01T00:00:00Z,,5,1,,,,');
  });
});

describe('parseInstant', () => {
  it('reads ISO with a zone, local-looking text as UTC, and a bare date as midnight UTC; refuses the rest', () => {
    expect(parseInstant('2026-01-01T00:00:00Z')).toBe(D(1));
    expect(parseInstant('2026-01-01T02:00:00+02:00')).toBe(D(1));
    expect(parseInstant('2026-01-01 00:00')).toBe(D(1));
    expect(parseInstant('2026-01-01 00:00:00')).toBe(D(1));
    expect(parseInstant('2026-01-01')).toBe(D(1));
    expect(parseInstant('01/02/2026')).toBeNull();
    expect(parseInstant('2026-13-45')).toBeNull();
    expect(parseInstant('')).toBeNull();
  });
});

describe('parseSetpointSheet', () => {
  it('reads intervals per Sensor, sorted, with their values and validTo', () => {
    const r = parse(['temp_a,2026-01-10,2026-01-20,6,1,,,,', 'temp_a,2026-01-01,2026-01-10,5,1,,,,', 'rpm_b,2026-01-01,,,,100,50,5,5']);
    expect(r.issues).toEqual([]);
    expect(r.entries.map((e) => e.sensor.externalSensorId)).toEqual(['temp_a', 'rpm_b']);
    expect(r.entries[0]!.desired.map((d) => [d.validFromMs, d.validToMs, d.values.target])).toEqual([[D(1), D(10), 5], [D(10), D(20), 6]]);
    expect(r.entries[1]!.desired[0]!.values).toEqual({ targetAbove: 100, targetBelow: 50, toleranceAbove: 5, toleranceBelow: 5 });
  });

  it('treats a row with only the Sensor name as "this Sensor has no setpoints" (an entry with nothing desired)', () => {
    const r = parse(['press_c,,,,,,,,']);
    expect(r.issues).toEqual([]);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.desired).toEqual([]);
  });

  it('lets a Sensor\'s single row leave validFrom empty - it then starts at the moment of the import - but not several rows', () => {
    const one = parse(['press_c,,,8,2,,,,']);
    expect(one.issues).toEqual([]);
    expect(one.entries[0]!.desired[0]).toMatchObject({ validFromMs: NOW, validFromDefaulted: true });
    const two = parse(['temp_a,,,8,2,,,,', 'temp_a,2026-02-01,,9,2,,,,']);
    expect(two.issues.map((i) => i.field)).toEqual(['validFrom']);
  });

  it('reports every kind of problem with its line, and builds nothing from a bad row', () => {
    const r = parse([
      'nope,2026-01-01,,5,1,,,,', // line 2: not a Sensor of the Device
      'temp_a,not-a-date,,5,1,,,,', // line 3: bad date
      'temp_a,2026-01-01,2025-12-01,5,1,,,,', // line 4: validTo before validFrom
      'rpm_b,2026-01-01,,5,1,,,,', // line 5: one-sided columns on a bidirectional Sensor
      'press_c,2026-01-01,,,2,,,,', // line 6: a tolerance without a target
      'temp_a,2026-02-01,,abc,1,,,,', // line 7: not a number
      'temp_a,2026-03-01,,-1,-2,,,,', // line 8: negative tolerance
      'press_c,2026-04-01,2026-05-01,,,,,,', // line 9: dates but no values
    ]);
    const lines = new Set(r.issues.map((i) => i.line));
    expect([...lines].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.issues.find((i) => i.line === 2)!.message).toContain('not a Sensor of this Device');
    expect(r.entries.flatMap((e) => e.desired)).toEqual([]);
  });

  it('refuses two rows with the same validFrom and intervals that overlap (an open-ended one must be the last)', () => {
    const same = parse(['temp_a,2026-01-01,2026-01-10,5,1,,,,', 'temp_a,2026-01-01,2026-01-05,6,1,,,,']);
    expect(same.issues.map((i) => i.message).join(' ')).toContain('same validFrom');
    const overlap = parse(['temp_a,2026-01-01,2026-01-20,5,1,,,,', 'temp_a,2026-01-10,,6,1,,,,']);
    expect(overlap.issues[0]!.message).toContain('Overlaps');
    const openFirst = parse(['temp_a,2026-01-01,,5,1,,,,', 'temp_a,2026-02-01,,6,1,,,,']);
    expect(openFirst.issues[0]!.message).toContain('open-ended');
  });

  it('refuses a sheet that cannot say what a setpoint is - it would delete everything it lists', () => {
    const onlyNames = parseSetpointSheet('sensorName\ntemp_a\nrpm_b', SENSORS, NOW);
    expect(onlyNames.fileErrors[0]).toContain('validFrom');
    expect(onlyNames.entries).toEqual([]);
    expect(parseSetpointSheet('validFrom,target\n2026-01-01,5', SENSORS, NOW).fileErrors[0]).toContain('sensorName');
    expect(parseSetpointSheet('', SENSORS, NOW)).toMatchObject({ entries: [], fileErrors: [] });
  });

  it('accepts headers like the export writes them, with "(optional)", other spellings, semicolons, tabs and a decimal comma', () => {
    const r = parseSetpointSheet('Sensor Name;Valid From;target (optional);tolerance (optional)\ntemp_a;2026-01-01;5,5;0,5', SENSORS, NOW);
    expect(r.fileErrors).toEqual([]);
    expect(r.issues).toEqual([]);
    expect(r.entries[0]!.desired[0]!.values).toEqual({ target: 5.5, tolerance: 0.5 });
    const tabs = parseSetpointSheet('sensorName\tvalidFrom\ttarget\ntemp_a\t2026-01-01\t5', SENSORS, NOW);
    expect(tabs.issues).toEqual([]);
  });

  it('matches Sensor names without regard to case and reports unknown columns', () => {
    const r = parseSetpointSheet('sensorName,validFrom,target,colour\nTEMP_A,2026-01-01,5,red', SENSORS, NOW);
    expect(r.entries[0]!.sensor.externalSensorId).toBe('temp_a');
    expect(r.ignoredColumns).toEqual(['colour']);
  });
});

describe('planSetpointSync', () => {
  const plan = (rows: string[]) => {
    const parsed = parse(rows);
    expect(parsed.issues).toEqual([]);
    return planSetpointSync(parsed.entries, STORED);
  };
  const forSensor = (plans: ReturnType<typeof plan>, name: string) => plans.find((p) => p.sensor.externalSensorId === name)!;

  it('the unchanged export is a no-op for every Sensor it lists', () => {
    const parsed = parseSetpointSheet(buildSetpointsExportCsv(SENSORS, STORED), SENSORS, NOW);
    expect(parsed.issues).toEqual([]);
    const plans = planSetpointSync(parsed.entries, STORED);
    expect(summarizePlan(plans)).toMatchObject({ created: 0, replaced: 0, deleted: 0, sensorsChanged: 0, unchanged: 5 });
    expect(plans.map((p) => p.sensor.externalSensorId)).toEqual(['temp_a', 'rpm_b', 'press_c', 'untouched_d']);
  });

  it('a stored interval whose row is gone from the sheet is deleted; the rest of that Sensor stays', () => {
    const plans = plan(['temp_a,2026-01-01,2026-01-10,5,1,,,,', 'temp_a,2026-01-20,,7,2,,,,']); // the middle row was removed
    const p = forSensor(plans, 'temp_a');
    expect(p.remove).toEqual([{ interval: STORED[1], replaced: false }]);
    expect(p.unchanged).toHaveLength(2);
    expect(p.create).toEqual([]);
  });

  it('a Sensor that is not in the sheet at all is not touched', () => {
    const plans = plan(['temp_a,2026-01-01,2026-01-10,5,1,,,,']);
    expect(plans.map((p) => p.sensor.externalSensorId)).toEqual(['temp_a']); // rpm_b and untouched_d have no plan
  });

  it('a Sensor that appears with only its empty row loses all its setpoints', () => {
    const plans = planSetpointSync(parse(['temp_a,,,,,,,,']).entries, STORED);
    const p = forSensor(plans, 'temp_a');
    expect(p.remove.map((r) => r.interval.id)).toEqual([11, 12, 13]);
    expect(p.remove.every((r) => !r.replaced)).toBe(true);
    expect(p.create).toEqual([]);
  });

  it('changed values or validTo replace the interval (delete + create, same validFrom); a new validFrom is created', () => {
    const plans = plan([
      'temp_a,2026-01-01,2026-01-10,5,1,,,,', // unchanged
      'temp_a,2026-01-10,2026-01-20,6.5,1,,,,', // a new target for the same validFrom
      'temp_a,2026-01-20,2026-03-01,7,2,,,,', // gets a validTo
      'temp_a,2026-03-01,,9,3,,,,', // a brand new interval
    ]);
    const p = forSensor(plans, 'temp_a');
    expect(p.unchanged.map((u) => u.id)).toEqual([11]);
    expect(p.remove.map((r) => [r.interval.id, r.replaced])).toEqual([[12, true], [13, true]]);
    expect(p.create.map((c) => [c.interval.validFromMs, c.replacement])).toEqual([[D(10), true], [D(20), true], [Date.UTC(2026, 2, 1), false]]);
    expect(summarizePlan([p])).toMatchObject({ created: 1, replaced: 2, deleted: 0, unchanged: 1, sensorsChanged: 1 });
  });

  it('a Sensor without stored intervals gets its rows created', () => {
    const p = forSensor(plan(['press_c,2026-02-01,,8,2,,,,']), 'press_c');
    expect(p.remove).toEqual([]);
    expect(p.create.map((c) => c.replacement)).toEqual([false]);
  });

  it('compares the values exactly, a missing value equals a null one', () => {
    const p = forSensor(plan(['rpm_b,2026-01-01,,,,100,50,5,5']), 'rpm_b');
    expect(p.unchanged).toHaveLength(1); // stored target/tolerance are null, the sheet has none: the same
    const changed = forSensor(plan(['rpm_b,2026-01-01,,,,100,50,5,6']), 'rpm_b');
    expect(changed.remove[0]!.replaced).toBe(true);
  });
});
