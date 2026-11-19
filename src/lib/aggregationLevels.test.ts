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

import { aggregatedRange, MIN_AGGREGATED_BUCKETS, pickLevel } from './aggregationLevels';

describe('pickLevel and aggregatedRange', () => {
  const levels = levelsOfSensor(
    [
      { id: 1, sensorId: 1, sourceDataKey: 'Actual', timeScale: 'Hours', aggregationFunction: 'AVG', enabled: true },
      { id: 2, sensorId: 1, sourceDataKey: 'Actual', timeScale: 'Weeks', aggregationFunction: 'AVG', enabled: true },
    ],
    1,
  );

  it('gives the very same level when the Sensor has it, otherwise the one with the closest bucket length, and none without levels', () => {
    expect(pickLevel(levels, { key: 'hours|avg', bucketMs: 3_600_000 })?.policyId).toBe(1);
    expect(pickLevel(levels, { key: 'days|avg', bucketMs: 86_400_000 })?.policyId).toBe(2); // a day is x24 an hour but only 1/7 of a week: the week is closer
    expect(pickLevel(levels, { key: 'minutes15|avg', bucketMs: 900_000 })?.policyId).toBe(1);
  });

  it('is undefined with no preference or no levels', () => {
    expect(pickLevel(levels, undefined)).toBeUndefined();
    expect(pickLevel([], { key: 'days|avg', bucketMs: 86_400_000 })).toBeUndefined();
  });

  it('widens a short range back to at least 60 buckets, and keeps a long range (one bucket earlier, so the bucket containing the start is read)', () => {
    const day = 86_400_000;
    const end = new Date('2026-11-19T12:00:00Z');
    const short = aggregatedRange(new Date(end.getTime() - 15 * 60_000), end, day);
    expect(short.widened).toBe(true);
    expect(new Date(short.endDate).getTime() - new Date(short.startDate).getTime()).toBe(MIN_AGGREGATED_BUCKETS * day);

    const long = aggregatedRange(new Date(end.getTime() - 100 * day), end, day);
    expect(long.widened).toBe(false);
    expect(new Date(long.endDate).getTime() - new Date(long.startDate).getTime()).toBe(101 * day);
  });
});
