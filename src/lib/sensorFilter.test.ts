import { describe, it, expect } from 'vitest';
import { filterSensors } from './sensorFilter';

const sensors = [
  { id: 1, name: '1# Velocity RMS X (equivalent RMS)', externalSensorId: 'velocity_rms_x_eq_1' },
  { id: 2, name: '2# Velocity RMS X (maximum)', externalSensorId: 'velocity_rms_x_max_2' },
  { id: 3, name: '1# Temperature', externalSensorId: 'sensor_temperature_mean_1' },
  { id: 4, name: null, externalSensorId: null },
];

describe('filterSensors', () => {
  it('keeps everything, in order, for an empty or blank filter', () => {
    expect(filterSensors(sensors, '').map((s) => s.id)).toEqual([1, 2, 3, 4]);
    expect(filterSensors(sensors, '   ').map((s) => s.id)).toEqual([1, 2, 3, 4]);
  });

  it('matches the name or the externalSensorId, case-insensitively, ignoring blanks around the text', () => {
    expect(filterSensors(sensors, ' TEMPERATURE ').map((s) => s.id)).toEqual([3]);
    expect(filterSensors(sensors, 'velocity_rms_x').map((s) => s.id)).toEqual([1, 2]);
    expect(filterSensors(sensors, '2# velocity').map((s) => s.id)).toEqual([2]);
  });

  it('finds nothing for an unknown text and never fails on a Sensor without names', () => {
    expect(filterSensors(sensors, 'zzz')).toEqual([]);
  });
});
