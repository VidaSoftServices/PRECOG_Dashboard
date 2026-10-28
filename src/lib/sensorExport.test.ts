import { describe, it, expect, beforeEach } from 'vitest';
import { buildSensorsExportCsv, SENSOR_EXPORT_HEADERS, sensorsExportFileName, type ExportPolicy, type ExportSensor, type ExportSetpoint } from './sensorExport';
import { TEMPLATE_HEADERS, parseSensorTable, type ExistingSensorInfo, type ImportDefaults, type SensorDirection } from './sensorImport';
import { importSensors } from '@/api/hooks/sensors';
import type { SensorDto } from '@/api/hooks/sensors';
import { fetchMock } from '@/test/mockFetch';
import { CATALOG } from '@/test/sensorCatalog';

const DEFAULTS: ImportDefaults = { direction: 'lowerisbetter', rawScale: 'Seconds', rawLookback: '60', rawMinIssueScore: '1', processingEnabled: true };
const NOW = new Date(Date.UTC(2026, 9, 28, 12, 0, 0));
const D = (day: number, month = 0) => new Date(Date.UTC(2026, month, day)).toISOString();

const SENSORS: ExportSensor[] = [
  { id: 2, externalSensorId: 'shaft_rpm_mean_1', name: '1# Shaft speed', direction: 'bidirectional', sensorType: 'rotation', unitCode: 'rpm', processingEnabled: false },
  { id: 1, externalSensorId: 'velocity_rms_x_eq_1', name: '1# Velocity RMS X', direction: 'lowerisbetter', sensorType: 'vibration', unitCode: 'mm_s', processingEnabled: true },
  { id: 3, externalSensorId: 'custom, "tag"', name: null, direction: 'higherisbetter', sensorType: null, unitCode: null, processingEnabled: true },
];
// The API sends the identity names as stored ("Native" / "Raw") and the scale in lower case ("days").
const POLICIES: ExportPolicy[] = [
  { sensorId: 1, timeScale: 'Native', aggregationFunction: 'Raw', scale: 'days', lookback: 30, minIssueScore: 5 },
  { sensorId: 1, timeScale: 'Hours4', aggregationFunction: 'AVG', scale: 'hours', lookback: 99, minIssueScore: 9 }, // not the raw level
  { sensorId: 2, timeScale: 'Native', aggregationFunction: 'Raw', scale: 'years', lookback: 100, minIssueScore: 1 },
];
const SETPOINTS: ExportSetpoint[] = [
  // Sensor 1: an old closed interval and the one in effect now (open-ended); the closed one must not be exported.
  { sensorId: 1, validFrom: D(1), validTo: D(10), target: 4, tolerance: 1 },
  { sensorId: 1, validFrom: D(10), validTo: null, target: 5.5, tolerance: 0.5 },
  // Sensor 2 (bidirectional): above/below.
  { sensorId: 2, validFrom: D(1), validTo: null, targetAbove: 100, toleranceAbove: 5, targetBelow: 50, toleranceBelow: 5 },
  // Sensor 3: only an interval that starts in the future - nothing is in effect now.
  { sensorId: 3, validFrom: D(1, 11), validTo: null, target: 9, tolerance: 1 },
];

describe('buildSensorsExportCsv', () => {
  it('has exactly the template\'s columns, one row per Sensor in id order, with the raw policy values and the current setpoint', () => {
    expect([...SENSOR_EXPORT_HEADERS]).toEqual([...TEMPLATE_HEADERS]);
    const lines = buildSensorsExportCsv(SENSORS, POLICIES, SETPOINTS, NOW).replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toBe(
      'sensorName,displayName,direction,sensorType,unitCode,rawScale,rawLookback,rawMinIssueScore,Calculate,target (optional),tolerance (optional),targetAbove (optional),targetBelow (optional),toleranceAbove (optional),toleranceBelow (optional)',
    );
    expect(lines[1]).toBe('velocity_rms_x_eq_1,1# Velocity RMS X,lowerisbetter,vibration,mm_s,Days,30,5,TRUE,5.5,0.5,,,,');
    expect(lines[2]).toBe('shaft_rpm_mean_1,1# Shaft speed,bidirectional,rotation,rpm,Years,100,1,FALSE,,,100,50,5,5');
    // No raw policy -> those cells are empty; a field with a comma and quotes is quoted; a future-only setpoint is not "current".
    expect(lines[3]).toBe('"custom, ""tag""",,higherisbetter,,,,,,TRUE,,,,,,');
  });

  it('exports the interval in effect NOW, not the newest one: a closed or future interval is never offered as the current setpoint', () => {
    const only = (sp: ExportSetpoint) => buildSensorsExportCsv([SENSORS[1]!], POLICIES, [sp], NOW).trim().split('\r\n')[1]!;
    expect(only({ sensorId: 1, validFrom: D(1), validTo: D(10), target: 4, tolerance: 1 })).toMatch(/,TRUE,,,,,,$/); // ended
    expect(only({ sensorId: 1, validFrom: D(1, 11), validTo: null, target: 9, tolerance: 1 })).toMatch(/,TRUE,,,,,,$/); // not started
    expect(only({ sensorId: 1, validFrom: D(1), validTo: D(1, 11), target: 6, tolerance: 2 })).toMatch(/,TRUE,6,2,,,,$/); // bounded but in effect
  });

  it('exports only the columns of the Sensor\'s own direction (a stale value of the other side would not import)', () => {
    const stale: ExportSetpoint = { sensorId: 1, validFrom: D(1), validTo: null, target: 5, tolerance: 1, targetAbove: 99, toleranceAbove: 9 };
    expect(buildSensorsExportCsv([SENSORS[1]!], POLICIES, [stale], NOW).trim().split('\r\n')[1]).toMatch(/,TRUE,5,1,,,,$/);
  });

  it('starts with a BOM (Excel reads the encoding) and has a stable file name', () => {
    expect(buildSensorsExportCsv([], []).charCodeAt(0)).toBe(0xfeff);
    expect(sensorsExportFileName(4)).toBe('sensors-device-4.csv');
  });
});

describe('the Sensor export feeds the Sensor import back without changing anything', () => {
  const existing = new Map<string, ExistingSensorInfo>(SENSORS.map((s) => [s.externalSensorId!.toLowerCase(), { direction: s.direction as SensorDirection }]));

  it('parses without a single problem, every row recognised as an existing Sensor with its cells filled', () => {
    const { rows, fileErrors, ignoredColumns } = parseSensorTable(buildSensorsExportCsv(SENSORS, POLICIES, SETPOINTS, NOW), DEFAULTS, CATALOG, existing);
    expect(fileErrors).toEqual([]);
    expect(ignoredColumns).toEqual([]);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.errors).toEqual([]);
      expect(row.exists).toBe(true);
    }
    expect(rows[0]!.provided).toMatchObject({ rawScale: true, rawLookback: true, rawMinIssueScore: true, processingEnabled: true });
    expect(rows[0]!.setpoint).toEqual({ target: 5.5, tolerance: 0.5 });
    expect(rows[1]!.setpoint).toEqual({ targetAbove: 100, targetBelow: 50, toleranceAbove: 5, toleranceBelow: 5 });
    expect(rows[2]!.provided).toMatchObject({ rawScale: false, rawLookback: false }); // no raw policy -> left alone
    expect(rows[2]!.setpoint).toBeUndefined(); // no current setpoint -> none claimed
  });

  beforeEach(() => fetchMock().mockReset());

  it('importing the exported sheet sends no write at all (every value, setpoint included, already matches)', async () => {
    const writes: string[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      const path = new URL(request.url).pathname;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (request.method !== 'GET') {
        writes.push(`${request.method} ${path}`);
        return json({});
      }
      const policies = path.match(/\/Sensors\/(\d+)\/AggregationPolicies$/);
      if (policies) return json(POLICIES.filter((p) => p.sensorId === Number(policies[1])).map((p, i) => ({ ...p, id: 100 + i })));
      const effective = path.match(/\/Sensors\/(\d+)\/Setpoints\/Effective$/);
      if (effective) {
        const current = SETPOINTS.find((s) => s.sensorId === Number(effective[1]) && !s.validTo && Date.parse(s.validFrom!) <= NOW.getTime());
        return current ? json(current) : json('No Setpoint is effective at the given instant.', 404);
      }
      return json([]);
    });

    const { rows } = parseSensorTable(buildSensorsExportCsv(SENSORS, POLICIES, SETPOINTS, NOW), DEFAULTS, CATALOG, existing);
    const dtos = new Map<string, SensorDto>(SENSORS.map((s) => [s.externalSensorId!.toLowerCase(), { ...s, id: s.id!, deviceId: 4 } as SensorDto]));
    const outcomes = await importSensors({ deviceId: 4, rows, existing: dtos, isCurve: false });

    expect(writes).toEqual([]);
    expect(outcomes.map((o) => o.status)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    expect(outcomes.map((o) => o.setpoint)).toEqual(['unchanged', 'unchanged', undefined]);
  });
});
