import { describe, expect, it } from 'vitest';
import { parseAggregationDeletionSheet } from './aggregationSheet';

const SENSORS = [
  { id: 1, name: 'Velocity', externalSensorId: 'velocity_rms_total_eq_1' },
  { id: 2, name: 'Kurtosis', externalSensorId: 'acceleration_kurtosis_max_axis_max_1' },
];

describe('parseAggregationDeletionSheet', () => {
  it('reads SensorName, TimeScale and AggregationFunction and ignores every other column (an aggregation sheet works as it is)', () => {
    const r = parseAggregationDeletionSheet(
      'SensorName,Level,TimeScale,AggregationFunction,Scale,Lookback,Calculate\nvelocity_rms_total_eq_1,1 day,days,avg,Years,2,true\nacceleration_kurtosis_max_axis_max_1,1 hour,Hours,MAX,Years,1,false',
      SENSORS,
    );
    expect(r.problems).toEqual([]);
    expect(r.levels).toEqual([
      { sensorId: 1, timeScale: 'Days', aggregationFunction: 'AVG' },
      { sensorId: 2, timeScale: 'Hours', aggregationFunction: 'MAX' },
    ]);
  });

  it('reads a semicolon sheet (a Hungarian Excel) and lower-case headers', () => {
    const r = parseAggregationDeletionSheet('sensorName;timeScale;aggregationFunction\nVelocity;Weeks;P95', SENSORS);
    expect(r.levels).toEqual([{ sensorId: 1, timeScale: 'Weeks', aggregationFunction: 'P95' }]);
  });

  it('refuses the raw level, an unknown Sensor, a missing column and a level listed twice - and then sends nothing', () => {
    expect(parseAggregationDeletionSheet('SensorName,TimeScale\nvelocity_rms_total_eq_1,Days', SENSORS).problems[0]!.message).toMatch(/AggregationFunction/);
    const r = parseAggregationDeletionSheet(
      'SensorName,TimeScale,AggregationFunction\nvelocity_rms_total_eq_1,Native,Raw\nnope_1,Days,AVG\nvelocity_rms_total_eq_1,Days,AVG\nvelocity_rms_total_eq_1,days,AVG',
      SENSORS,
    );
    expect(r.levels).toEqual([]);
    expect(r.problems.map((p) => [p.line, p.field])).toEqual([
      [2, 'TimeScale'],
      [2, 'AggregationFunction'],
      [3, 'SensorName'],
      [5, 'SensorName'],
    ]);
  });
});
