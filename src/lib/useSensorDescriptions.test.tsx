import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDescriptionSheet } from './descriptionSheet';
import { resetDescriptionStore, setDeviceDescriptions } from './descriptionStore';
import { useSensorDescriptions } from './useSensorDescriptions';

const rows = parseDescriptionSheet(['sensorName,description', 'a_1,about a', 'b_1,about b'].join('\n')).rows;

afterEach(() => resetDescriptionStore());

describe('useSensorDescriptions', () => {
  it('returns nothing while no description is imported for the Device', () => {
    const { result } = renderHook(() => useSensorDescriptions([{ deviceId: 1, sensorName: 'a_1' }]));
    expect(result.current).toEqual([]);
  });

  it('finds the row of each Sensor of the right Device and skips Sensors without one', () => {
    setDeviceDescriptions(1, { rows, fileName: 'x.csv', importedAt: 0 });
    const { result } = renderHook(() =>
      useSensorDescriptions([
        { deviceId: 1, sensorName: 'b_1', label: 'B' },
        { deviceId: 1, sensorName: 'zzz' },
        { deviceId: 1, sensorName: null },
        { deviceId: 2, sensorName: 'a_1' },
      ]),
    );
    expect(result.current.map((f) => [f.row.description, f.label])).toEqual([['about b', 'B']]);
  });
});
