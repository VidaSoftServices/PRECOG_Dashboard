import { describe, it, expect } from 'vitest';
import { buildSensorMap, sensorMacroName, sensorMapFileName, type SensorMapSensor } from './sensorMap';

const INFO = { deviceId: 4, deviceName: 'Press 7', externalDeviceId: 'ext-4', generatedAt: new Date('2026-10-21T10:00:00Z') };

const defines = (text: string) => [...text.matchAll(/^#define (PRECOG_SENSOR_ID_\w+)\s+(\d+)\s+\/\* (.+) \*\/$/gm)].map((m) => ({ macro: m[1]!, id: Number(m[2]), tag: m[3]! }));

describe('sensor_map.h export', () => {
  it('exports every Sensor of the Device - whatever its name - with the ids the API reported, ascending, never renumbered', () => {
    const sensors: SensorMapSensor[] = [
      { id: 57, externalSensorId: 'shaft_rpm_mean_2' },
      { id: 12, externalSensorId: 'velocity_rms_x_eq_1' },
      { id: 30, externalSensorId: 'shaft_rpm_vibration_1' },
      { id: 31, externalSensorId: 'my_custom_tag' },
      { id: 32, externalSensorId: 'velocity_rms_x_eq_3' },
      { id: 33, externalSensorId: 'Velocity_RMS_X_EQ_1' },
    ];
    const result = buildSensorMap(sensors, INFO);

    expect(result.mapped).toBe(6);
    expect(defines(result.text).map((d) => [d.tag, d.id])).toEqual([
      ['velocity_rms_x_eq_1', 12],
      ['shaft_rpm_vibration_1', 30],
      ['my_custom_tag', 31],
      ['velocity_rms_x_eq_3', 32],
      ['Velocity_RMS_X_EQ_1', 33],
      ['shaft_rpm_mean_2', 57],
    ]);
    expect(defines(result.text).find((d) => d.id === 30)!.macro).toBe('PRECOG_SENSOR_ID_SHAFT_RPM_VIBRATION_1');
    expect(result.text).not.toContain('Skipped');
    expect(result.text).not.toContain('No Sensor yet');
  });

  it('is a complete header file: pragma once, clang-format guards, the defines in between', () => {
    const sensors = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, externalSensorId: `tag_${i + 1}` }));
    const { text } = buildSensorMap(sensors, INFO);
    const lines = text.split('\n');
    expect(lines).toContain('#pragma once');
    expect(lines.indexOf('// clang-format off')).toBeGreaterThan(lines.indexOf('#pragma once'));
    expect(lines.indexOf('// clang-format on')).toBeGreaterThan(lines.lastIndexOf(lines.filter((l) => l.startsWith('#define'))[4]!));
    expect(text).toContain('// Device: Press 7 (id 4, external id ext-4).');
    expect(text).toContain('// Generated 2026-10-21T10:00:00.000Z');
    expect(text).toContain('// 5 Sensors, all of them exported');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('turns a name that is not a C identifier into one, and keeps the real name in the comment', () => {
    const { text } = buildSensorMap([{ id: 1, externalSensorId: 'pump 1-temp.max' }, { id: 2, externalSensorId: '1st_tag' }], INFO);
    expect(defines(text)).toEqual([
      { macro: 'PRECOG_SENSOR_ID_PUMP_1_TEMP_MAX', id: 1, tag: 'pump 1-temp.max' },
      { macro: 'PRECOG_SENSOR_ID_1ST_TAG', id: 2, tag: '1st_tag' },
    ]);
    for (const d of defines(text)) expect(d.macro).toMatch(/^[A-Z_][A-Z0-9_]*$/);
  });

  it('names the macro and the file as the firmware and the user expect', () => {
    expect(sensorMacroName('acceleration_rms_x_eq_1')).toBe('PRECOG_SENSOR_ID_ACCELERATION_RMS_X_EQ_1');
    expect(sensorMapFileName(4)).toBe('sensor_map-device-4.txt');
  });
});
