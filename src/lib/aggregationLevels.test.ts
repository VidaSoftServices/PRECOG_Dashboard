import { describe, it, expect } from 'vitest';
import { levelsOfSensor, levelsOfSensors, levelOfSensorByKey } from './aggregationLevels';

const policies = [
  { id: 1, sensorId: 1, sourceDataKey: 'Actual', timeScale: 'Native', aggregationFunction: 'Raw', enabled: true }, // the raw level: never offered
  { id: 2, sensorId: 1, sourceDataKey: 'Actual', timeScale: 'Days', aggregationFunction: 'AVG', enabled: true },
  { id: 3, sensorId: 1, sourceDataKey: 'Actual', timeScale: 'Hours', aggregationFunction: 'MAX', enabled: true },
  { id: 4, sensorId: 1, sourceDataKey: 'Actual', timeScale: 'Weeks', aggregationFunction: 'AVG', enabled: false }, // disabled
  { id: 5, sensorId: 2, sourceDataKey: 'Actual', timeScale: 'Days', aggregationFunction: 'AVG', enabled: true },
  { id: 6, sensorId: 2, sourceDataKey: 'Analysed', timeScale: 'Days', aggregationFunction: 'MAX', enabled: true }, // not the measured value
];

describe('aggregation levels', () => {
  it('offers the enabled aggregate levels of one Sensor, shortest time scale first, never the raw level', () => {
    const levels = levelsOfSensor(policies, 1);
    expect(levels.map((l) => l.label)).toEqual(['1 hour · Maximum', '1 day · Average']);
    expect(levels.map((l) => l.policyId)).toEqual([3, 2]);
  });

  it('lists the distinct levels over several Sensors, and none for no Sensor or no policies', () => {
    expect(levelsOfSensors(policies, [1, 2]).map((l) => l.key)).toEqual(['hours|max', 'days|avg']);
    expect(levelsOfSensors(policies, undefined)).toHaveLength(2);
    expect(levelsOfSensor(policies, undefined)).toEqual([]);
    expect(levelsOfSensors(undefined, [1])).toEqual([]);
  });

  it('finds the policy of a Sensor for a level key; undefined when that Sensor lacks the level', () => {
    expect(levelOfSensorByKey(policies, 2, 'days|avg')?.policyId).toBe(5);
    expect(levelOfSensorByKey(policies, 2, 'hours|max')).toBeUndefined();
  });

  it('knows the length of a bucket', () => {
    expect(levelsOfSensor(policies, 1).map((l) => l.bucketMs)).toEqual([3_600_000, 86_400_000]);
  });
});
