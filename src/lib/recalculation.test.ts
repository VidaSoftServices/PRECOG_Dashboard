import { describe, it, expect } from 'vitest';
import { parseSensorNameList } from './recalculation';
import type { SensorDto } from '@/api/hooks/sensors';

const sensor = (id: number, externalSensorId: string, name?: string): SensorDto => ({ id, externalSensorId, name: name ?? externalSensorId }) as SensorDto;
const sensors = [sensor(1, 'energy_1x_x_mean_1'), sensor(2, 'band_1_2x_x_mean_1', 'Band 1-2x X (mean)'), sensor(3, 'crest_factor_x_max_1')];

describe('parseSensorNameList', () => {
  it('reads one Sensor name per line, case insensitive, in the order of the list', () => {
    const r = parseSensorNameList('Crest_Factor_X_Max_1\nenergy_1x_x_mean_1\n', sensors);
    expect(r.ids).toEqual([3, 1]);
    expect(r.unknown).toEqual([]);
    expect(r.count).toBe(2);
  });

  it('reads the SensorName column of a sheet and ignores every other column (an import / export sheet can be pasted as it is)', () => {
    const r = parseSensorNameList('SensorName,Calculate,Visible\r\nband_1_2x_x_mean_1,TRUE,TRUE\r\nenergy_1x_x_mean_1,FALSE,TRUE\r\n', sensors);
    expect(r.ids).toEqual([2, 1]);
    expect(r.count).toBe(2); // the header is not a name
  });

  it('also reads a tab separated Excel paste and a name given as the display name', () => {
    const r = parseSensorNameList('SensorName\tNote\nBand 1-2x X (mean)\tx\n', sensors);
    expect(r.ids).toEqual([2]);
  });

  it('lists unknown names and counts a repeated name once', () => {
    const r = parseSensorNameList('energy_1x_x_mean_1\nnope_1\nenergy_1x_x_mean_1\n\n', sensors);
    expect(r.ids).toEqual([1]);
    expect(r.unknown).toEqual(['nope_1']);
    expect(r.duplicates).toEqual(['energy_1x_x_mean_1']);
    expect(r.count).toBe(3); // blank lines are not names
  });

  it('an empty text names nothing', () => {
    expect(parseSensorNameList('  \n ', sensors)).toEqual({ ids: [], unknown: [], duplicates: [], count: 0 });
  });
});
