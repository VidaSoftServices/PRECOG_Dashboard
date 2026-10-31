import { describe, it, expect } from 'vitest';
import { isShownSensor, splitShownSensors } from './sensorVisibility';

describe('isShownSensor', () => {
  it('hides a Sensor only when the flag is explicitly false - a missing flag (an older API) counts as shown', () => {
    expect(isShownSensor({ visible: false })).toBe(false);
    expect(isShownSensor({ visible: true })).toBe(true);
    expect(isShownSensor({})).toBe(true);
    expect(isShownSensor({ visible: null })).toBe(true);
    expect(isShownSensor({ visible: undefined })).toBe(true);
  });
});

describe('splitShownSensors', () => {
  it('keeps the order of the shown Sensors and counts the hidden ones', () => {
    const sensors = [
      { id: 1, visible: true },
      { id: 2, visible: false },
      { id: 3 },
      { id: 4, visible: false },
    ];

    const { shown, hiddenCount } = splitShownSensors(sensors);

    expect(shown.map((s) => s.id)).toEqual([1, 3]);
    expect(hiddenCount).toBe(2);
  });

  it('copes with a list that has not loaded yet and with a list where nothing is hidden', () => {
    expect(splitShownSensors(undefined)).toEqual({ shown: [], hiddenCount: 0 });
    const plain: { id: number; visible?: boolean }[] = [{ id: 1 }, { id: 2 }];
    expect(splitShownSensors(plain)).toEqual({ shown: plain, hiddenCount: 0 });
  });
});
