import { describe, it, expect } from 'vitest';
import { filterByLabel, filterSensors } from './sensorFilter';

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

describe('filterByLabel', () => {
  const rows = [
    { label: 'Vibration X', id: 'a' },
    { label: 'Vibration X \u00b7 1 day \u00b7 Average', id: 'b' },
    { label: 'Vibration X \u00b7 1 hour \u00b7 Maximum', id: 'c' },
    { label: 'Temperature \u00b7 1 day \u00b7 Average \u00b7 Calculation off', id: 'd' },
  ];
  const ids = (text: string) => filterByLabel(rows, text, (r) => r.label).map((r) => r.id);

  it('keeps every row for an empty filter', () => expect(ids('  ')).toEqual(['a', 'b', 'c', 'd']));

  it('searches the whole text of the row, so the aggregation level can be filtered', () => {
    expect(ids('1 day')).toEqual(['b', 'd']);
    expect(ids('maximum')).toEqual(['c']);
    expect(ids('calculation off')).toEqual(['d']);
  });

  it('needs every word, in any order, case-insensitively', () => {
    expect(ids('AVERAGE vibration')).toEqual(['b']);
    expect(ids('x day')).toEqual(['b']);
    expect(ids('zzz')).toEqual([]);
  });
});
