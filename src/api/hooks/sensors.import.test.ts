import { describe, it, expect, beforeEach } from 'vitest';
import { importSensors, type SensorDto } from '@/api/hooks/sensors';
import { parseSensorTable, type ImportDefaults, type ExistingSensorInfo, type SensorDirection } from '@/lib/sensorImport';
import { fetchMock } from '@/test/mockFetch';
import { CATALOG } from '@/test/sensorCatalog';

const DEFAULTS: ImportDefaults = { direction: 'lowerisbetter', rawScale: 'Seconds', rawLookback: '60', rawMinIssueScore: '1', processingEnabled: true, visible: true };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** Existing Sensors s1..sN (ids 1..N, lookback 100, target 5 / tolerance 1) and a log of every request. */
function setup(count: number) {
  const sensors = Array.from({ length: count }, (_, i) => ({ id: i + 1, externalSensorId: `s${i + 1}`, name: `S${i + 1}`, direction: 'lowerisbetter', processingEnabled: true }));
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let nextId = count + 1;
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    calls.push(`${request.method} ${path}`);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    if (request.method === 'GET') {
      if (path === '/api/Devices/4/AggregationPolicies') return json(sensors.map((s) => ({ id: 100 + s.id, sensorId: s.id, timeScale: 'native', aggregationFunction: 'raw', scale: 'Seconds', lookback: 100, minIssueScore: 1 })));
      if (path === '/api/Devices/4/Setpoints/Effective') return json({ deviceId: 4, setpoints: sensors.map((s) => ({ sensorId: s.id, direction: 'lowerisbetter', target: 5, tolerance: 1 })) });
      const perSensor = path.match(/\/Sensors\/(\d+)\/AggregationPolicies$/);
      if (perSensor) return json([{ id: 100 + Number(perSensor[1]), sensorId: Number(perSensor[1]), timeScale: 'native', aggregationFunction: 'raw', scale: 'Seconds', lookback: 100, minIssueScore: 1 }]);
      const effective = path.match(/\/Sensors\/(\d+)\/Setpoints\/Effective$/);
      if (effective) return json({ id: 1, target: 5, tolerance: 1 });
      return json(sensors);
    }
    if (request.method === 'POST' && /\/Sensors$/.test(path)) return json({ id: nextId++, externalSensorId: ((await request.clone().json()) as { externalSensorId: string }).externalSensorId }, 201);
    return json({ id: 1 }, request.method === 'POST' ? 201 : 200);
  });
  const dtos = new Map<string, SensorDto>(sensors.map((s) => [s.externalSensorId, { ...s, deviceId: 4 } as SensorDto]));
  const info = new Map<string, ExistingSensorInfo>(sensors.map((s) => [s.externalSensorId, { direction: 'lowerisbetter' as SensorDirection }]));
  return { calls, dtos, info, maxInFlight: () => maxInFlight };
}

describe('importSensors: speed', () => {
  beforeEach(() => fetchMock().mockReset());

  it('reads the raw policies and the current setpoints of many existing Sensors with ONE request each, not two per Sensor', async () => {
    const { calls, dtos, info } = setup(8);
    const sheet = ['sensorName\trawLookback\ttarget', ...Array.from({ length: 8 }, (_, i) => `s${i + 1}\t200\t7`)].join('\n');
    const { rows } = parseSensorTable(sheet, DEFAULTS, CATALOG, info);

    const outcomes = await importSensors({ deviceId: 4, rows, existing: dtos, isCurve: false });

    expect(outcomes).toHaveLength(8);
    expect(outcomes.every((o) => o.status === 'updated')).toBe(true);
    expect(calls.filter((c) => c === 'GET /api/Devices/4/AggregationPolicies')).toHaveLength(1);
    expect(calls.filter((c) => c === 'GET /api/Devices/4/Setpoints/Effective')).toHaveLength(1);
    expect(calls.filter((c) => /\/Sensors\/\d+\/(AggregationPolicies|Setpoints\/Effective)$/.test(c) && c.startsWith('GET'))).toEqual([]);
    expect(calls.filter((c) => c.startsWith('PUT') && c.includes('/AggregationPolicies/'))).toHaveLength(8);
    expect(calls.filter((c) => c === 'POST /api/Devices/4/Sensors/1/Setpoints' || /POST .*\/Setpoints$/.test(c))).toHaveLength(8);
  });

  it('keeps reading Sensor by Sensor for a few rows (the whole-Device reads would cost more)', async () => {
    const { calls, dtos, info } = setup(8);
    const { rows } = parseSensorTable('sensorName\trawLookback\ns1\t200\ns2\t200', DEFAULTS, CATALOG, info);

    await importSensors({ deviceId: 4, rows, existing: dtos, isCurve: false });

    expect(calls).not.toContain('GET /api/Devices/4/AggregationPolicies');
    expect(calls.filter((c) => /GET .*\/Sensors\/\d+\/AggregationPolicies$/.test(c))).toHaveLength(2);
  });

  it('updates existing Sensors side by side (up to 6 requests in flight) and returns the outcomes in sheet order', async () => {
    const state = setup(12);
    const sheet = ['sensorName\tVisible', ...Array.from({ length: 12 }, (_, i) => `s${i + 1}\tfalse`)].join('\n');
    const { rows } = parseSensorTable(sheet, DEFAULTS, CATALOG, state.info);

    const outcomes = await importSensors({ deviceId: 4, rows, existing: state.dtos, isCurve: false });

    expect(state.maxInFlight()).toBeGreaterThan(1);
    expect(state.maxInFlight()).toBeLessThanOrEqual(6);
    expect(outcomes.map((o) => o.externalSensorId)).toEqual(rows.map((r) => r.externalSensorId));
  });

  it('creates new Sensors strictly one after another, so their ids follow the sheet order, while their setpoints are saved on the side', async () => {
    const { calls, info } = setup(0);
    const sheet = ['externalSensorId\ttarget', ...Array.from({ length: 6 }, (_, i) => `n${i + 1}\t5`)].join('\n');
    const { rows } = parseSensorTable(sheet, DEFAULTS, CATALOG, info);
    const progress: number[] = [];

    const outcomes = await importSensors({ deviceId: 4, rows, existing: new Map(), isCurve: false, onProgress: (done) => progress.push(done) });

    expect(outcomes.map((o) => o.sensorId)).toEqual([1, 2, 3, 4, 5, 6]); // the API's "max + 1" in sheet order
    expect(outcomes.map((o) => o.setpoint)).toEqual(Array(6).fill('created'));
    expect(calls.filter((c) => c === 'POST /api/Devices/4/Sensors')).toHaveLength(6);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('one rate-limited request holds back the others: nothing new starts until the wait is over', async () => {
    const { dtos, info } = setup(6);
    const starts: number[] = [];
    let limited = false;
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      starts.push(Date.now());
      if (request.method === 'PUT' && !limited) {
        limited = true;
        return json('slow down', 429, { 'Retry-After': '1' });
      }
      return json({ id: 1 });
    });
    const sheet = ['sensorName\tVisible', ...Array.from({ length: 6 }, (_, i) => `s${i + 1}\tfalse`)].join('\n');
    const { rows } = parseSensorTable(sheet, DEFAULTS, CATALOG, info);

    const outcomes = await importSensors({ deviceId: 4, rows, existing: dtos, isCurve: false });

    expect(outcomes.every((o) => o.status === 'updated')).toBe(true);
    const limitedAt = starts[0]!;
    // the first request was refused; every request started after it waited for the Retry-After (1 s) - none slipped through in between
    expect(starts.slice(1).every((t) => t - limitedAt >= 900 || t - limitedAt < 50)).toBe(true);
    expect(starts.filter((t) => t - limitedAt >= 900).length).toBeGreaterThanOrEqual(1);
  }, 15_000);
});
