import { describe, it, expect } from 'vitest';
import { buildSensorMap, sensorMacroName, sensorMapFileName, type SensorMapSensor } from './sensorMap';
import { CATALOG } from '@/test/sensorCatalog';

const INFO = { deviceId: 4, deviceName: 'Press 7', externalDeviceId: 'ext-4', generatedAt: new Date('2026-10-21T10:00:00Z') };

/**
 * The 326 firmware channels - measurement point 1 (the 163 catalog metrics), then point 2 - numbered 1..326: what an import of
 * the Vibration_Duo sheet (same order) into an empty Device produces.
 */
const sheetSensors = (): SensorMapSensor[] =>
  [1, 2].flatMap((point) => CATALOG.metrics.map((m) => `${m.machineName}_${point}`)).map((tag, i) => ({ id: i + 1, externalSensorId: tag }));

const defines = (text: string) => [...text.matchAll(/^#define (PRECOG_SENSOR_ID_\w+)\s+(\d+)\s+\/\* (\S+) \*\/$/gm)].map((m) => ({ macro: m[1]!, id: Number(m[2]), tag: m[3]! }));

describe('sensor_map.h export', () => {
  it('turns the 326 Sensors of the ready sheet into 326 defines, ids ascending in that order', () => {
    const result = buildSensorMap(sheetSensors(), CATALOG, INFO);

    expect(result.mapped).toBe(326);
    expect(result.missing).toEqual([]);
    expect(result.skipped).toEqual([]);
    const lines = defines(result.text);
    expect(lines).toHaveLength(326);
    lines.forEach((d, i) => {
      expect(d.id).toBe(i + 1);
      expect(d.macro).toBe(`PRECOG_SENSOR_ID_${d.tag.toUpperCase()}`);
    });
    expect(lines[0]).toEqual({ macro: 'PRECOG_SENSOR_ID_ACCELERATION_RMS_X_EQ_1', id: 1, tag: 'acceleration_rms_x_eq_1' });
    expect(lines[162]).toEqual({ macro: 'PRECOG_SENSOR_ID_SHAFT_RPM_MEAN_1', id: 163, tag: 'shaft_rpm_mean_1' });
    expect(lines[163]).toEqual({ macro: 'PRECOG_SENSOR_ID_ACCELERATION_RMS_X_EQ_2', id: 164, tag: 'acceleration_rms_x_eq_2' });
    expect(lines[325]).toEqual({ macro: 'PRECOG_SENSOR_ID_SHAFT_RPM_MEAN_2', id: 326, tag: 'shaft_rpm_mean_2' });
  });

  it('is a complete header file: pragma once, clang-format guards, the defines in between', () => {
    const { text } = buildSensorMap(sheetSensors(), CATALOG, INFO);
    const lines = text.split('\n');
    expect(lines).toContain('#pragma once');
    expect(lines.indexOf('// clang-format off')).toBeGreaterThan(lines.indexOf('#pragma once'));
    expect(lines.indexOf('// clang-format on')).toBeGreaterThan(lines.lastIndexOf(lines.filter((l) => l.startsWith('#define'))[325]!));
    expect(text).toContain('// Device: Press 7 (id 4, external id ext-4).');
    expect(text).toContain('// Generated 2026-10-21T10:00:00.000Z');
    expect(text).toContain('// 326 of 326 firmware channels have a Sensor');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('uses the ids the API reported - gaps, offsets and an unsorted input included - and never renumbers', () => {
    const sensors: SensorMapSensor[] = [
      { id: 57, externalSensorId: 'shaft_rpm_mean_2' },
      { id: 12, externalSensorId: 'velocity_rms_x_eq_1' },
      { id: 30, externalSensorId: 'sensor_temperature_max_1' },
    ];
    const lines = defines(buildSensorMap(sensors, CATALOG, INFO).text);
    expect(lines.map((d) => [d.tag, d.id])).toEqual([
      ['velocity_rms_x_eq_1', 12],
      ['sensor_temperature_max_1', 30],
      ['shaft_rpm_mean_2', 57],
    ]);
  });

  it('lists the channels that have no Sensor yet, and leaves them out (they stay 0 in the firmware)', () => {
    const result = buildSensorMap([{ id: 1, externalSensorId: 'shaft_rpm_mean_1' }], CATALOG, INFO);
    expect(result.mapped).toBe(1);
    expect(result.missing).toHaveLength(325);
    expect(result.missing).not.toContain('shaft_rpm_mean_1');
    expect(result.text).toContain('// 1 of 326 firmware channels have a Sensor');
    expect(result.text).toMatch(/\/\/ No Sensor yet \(325\): .* \.\.\. and 305 more/);
    expect(defines(result.text)).toHaveLength(1);
  });

  it('skips what is not a firmware channel - a custom tag, measurement point 3, a name that only looks like one - and says so', () => {
    const sensors: SensorMapSensor[] = [
      { id: 1, externalSensorId: 'my_custom_tag' },
      { id: 2, externalSensorId: 'velocity_rms_x_eq_3' },
      { id: 3, externalSensorId: 'Velocity_RMS_X_EQ_1' },
      { id: 4, externalSensorId: 'velocity_rms_x_eq_01' },
      { id: 5, externalSensorId: 'velocity_rms_x_eq_2' },
    ];
    const result = buildSensorMap(sensors, CATALOG, INFO);

    expect(defines(result.text).map((d) => d.tag)).toEqual(['velocity_rms_x_eq_2']);
    expect(result.skipped.map((s) => s.externalSensorId)).toEqual(['my_custom_tag', 'velocity_rms_x_eq_3', 'Velocity_RMS_X_EQ_1', 'velocity_rms_x_eq_01']);
    expect(result.skipped.find((s) => s.externalSensorId === 'velocity_rms_x_eq_3')!.reason).toMatch(/only measurement points 1 and 2/);
    expect(result.text).toContain('// Skipped, not a firmware channel (4): my_custom_tag (not a Vibration_Duo channel name)');
  });

  it('every macro name is a valid C identifier', () => {
    for (const d of defines(buildSensorMap(sheetSensors(), CATALOG, INFO).text)) expect(d.macro).toMatch(/^[A-Z_][A-Z0-9_]*$/);
  });

  it('names the macro and the file as the firmware and the user expect', () => {
    expect(sensorMacroName('acceleration_rms_x_eq_1')).toBe('PRECOG_SENSOR_ID_ACCELERATION_RMS_X_EQ_1');
    expect(sensorMapFileName(4)).toBe('sensor_map-device-4.txt');
  });
});
