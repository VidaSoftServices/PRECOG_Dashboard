import { describe, it, expect } from 'vitest';
import { aggregationExportFileName, aggregationTemplateFileName, buildAggregationExportCsv, buildAggregationTemplateCsv, describeGroup, parseAggregationSheet, type SheetSensor } from './aggregationSheet';

const SENSORS: SheetSensor[] = [
  { id: 1, name: '1# Acceleration RMS X', externalSensorId: 'acceleration_rms_x_eq_1' },
  { id: 2, name: '1# Acceleration RMS X max', externalSensorId: 'acceleration_rms_x_max_1' },
  { id: 3, name: 'Shaft speed', externalSensorId: 'shaft_rpm_mean_1' },
];

// The shape of the prepared sheets (aggregation-KS5.csv): comma separated, a free `level` label, a `why` remark with commas and quotes.
const HEADER = 'sensorName,level,timeScale,aggregationFunction,scale,lookback,minIssueScore,why';
const PREPARED = [
  HEADER,
  'acceleration_rms_x_eq_1,napi,Days,AVG,Periods,60,3,napi szint: a trendszabály 14 lépést vetít előre = 14 nap; az Issue-t a legnagyobb aggregálás kapja',
  'acceleration_rms_x_max_1,napi,Days,P95,Periods,60,3,"napi szint, 95. percentilis (a ""max"" mutatók napi csúcsának stabil követése)"',
  'acceleration_rms_x_max_1,órás (ütés-figyelő),Hours,MAX,Periods,336,2,"órás szint, ütés-figyelő"',
].join('\n');

describe('parseAggregationSheet', () => {
  it('reads a prepared sheet: level and why are ignored without a warning, rows with the same settings become ONE group', () => {
    const rows = [PREPARED, 'shaft_rpm_mean_1,napi,Days,AVG,Periods,60,3,x'].join('\n');
    const result = parseAggregationSheet(rows, SENSORS);

    expect(result.problems).toEqual([]);
    expect(result.ignoredColumns).toEqual([]); // `level` and `why` are known and thrown away
    expect(result.rowCount).toBe(4);
    expect(result.sensorCount).toBe(3);
    expect(result.groups).toEqual([
      { timeScale: 'Days', aggregationFunction: 'AVG', scale: 'Periods', lookback: 60, minIssueScore: 3, minEvaluationPercent: null, calculationEnabled: null, sensorIds: [1, 3] },
      { timeScale: 'Days', aggregationFunction: 'P95', scale: 'Periods', lookback: 60, minIssueScore: 3, minEvaluationPercent: null, calculationEnabled: null, sensorIds: [2] },
      { timeScale: 'Hours', aggregationFunction: 'MAX', scale: 'Periods', lookback: 336, minIssueScore: 2, minEvaluationPercent: null, calculationEnabled: null, sensorIds: [2] },
    ]);
  });

  it('tolerates a BOM, semicolons (a Hungarian Excel), case, spaces in the header and the Sensor’s display name as a fallback', () => {
    const text = '﻿Sensor Name;Time Scale;aggregation_function;SCALE;Look Back;Min Issue Score\r\n1# Acceleration RMS X;days;avg;periods;60;3\r\n';
    const result = parseAggregationSheet(text, SENSORS);
    // "Look Back" is not an alias of lookback (header words are joined: "lookback" matches, "look back" too once spaces are dropped)
    expect(result.problems).toEqual([]);
    expect(result.groups).toEqual([{ timeScale: 'Days', aggregationFunction: 'AVG', scale: 'Periods', lookback: 60, minIssueScore: 3, minEvaluationPercent: null, calculationEnabled: null, sensorIds: [1] }]);
  });

  it('minIssueScore and minEvaluation are optional (API defaults); minEvaluation is validated (0-100) and groups apart', () => {
    const text = [
      'sensorName,timeScale,aggregationFunction,scale,lookback,minEvaluation',
      'acceleration_rms_x_eq_1,Days,AVG,Periods,60,25',
      'acceleration_rms_x_max_1,Days,AVG,Periods,60,',
    ].join('\n');
    const result = parseAggregationSheet(text, SENSORS);
    expect(result.problems).toEqual([]);
    expect(result.groups.map((g) => [g.minEvaluationPercent, g.minIssueScore, g.sensorIds])).toEqual([
      [25, null, [1]],
      [null, null, [2]],
    ]);
    const header = 'sensorName,timeScale,aggregationFunction,scale,lookback,minEvaluation';
    expect(parseAggregationSheet(`${header}\nacceleration_rms_x_eq_1,Days,AVG,Periods,60,101`, SENSORS).problems[0]).toMatchObject({ line: 2, field: 'minEvaluation' });
    expect(parseAggregationSheet(`${header}\nacceleration_rms_x_eq_1,Days,AVG,Periods,60,-5`, SENSORS).problems[0]).toMatchObject({ line: 2, field: 'minEvaluation' });
    expect(parseAggregationSheet(`${header}\nacceleration_rms_x_eq_1,Days,AVG,Periods,60,10.5`, SENSORS).problems[0]).toMatchObject({ line: 2, field: 'minEvaluation' });
    expect(parseAggregationSheet(`${header}\nacceleration_rms_x_eq_1,Days,AVG,Periods,60,0`, SENSORS).groups[0]!.minEvaluationPercent).toBe(0);
  });

  it('an old sheet that still has a timeZone (or tz) column is read; the column is ignored without a warning, the time zone is the Device’s', () => {
    const text = [
      'sensorName,level,timeScale,aggregationFunction,scale,lookback,minIssueScore,timeZone',
      'acceleration_rms_x_eq_1,napi,Days,AVG,Periods,60,3,Europe/Budapest',
      'acceleration_rms_x_max_1,napi,Days,AVG,Periods,60,3,Mars/Olympus', // not validated any more: nothing uses it
    ].join('\n');
    const result = parseAggregationSheet(text, SENSORS);
    expect(result.problems).toEqual([]);
    expect(result.ignoredColumns).toEqual([]);
    expect(result.groups).toHaveLength(1); // the two rows differ only in the ignored column: one group
    expect(result.groups[0]!.sensorIds).toEqual([1, 2]);
  });

  it('calculate is optional (default true): false keeps a level for looking only; a bad value is reported; rows differing only in it are two requests', () => {
    const header = 'sensorName,timeScale,aggregationFunction,scale,lookback,calculate';
    const result = parseAggregationSheet([header, 'acceleration_rms_x_eq_1,Days,AVG,Periods,60,false', 'acceleration_rms_x_max_1,Days,AVG,Periods,60,igen', 'shaft_rpm_mean_1,Days,AVG,Periods,60,'].join('\n'), SENSORS);
    expect(result.problems).toEqual([]);
    expect(result.groups.map((g) => [g.calculationEnabled, g.sensorIds])).toEqual([[false, [1]], [true, [2]], [null, [3]]]);
    expect(describeGroup(result.groups[0]!)).toContain('calculation off');
    expect(parseAggregationSheet(`${header}\nacceleration_rms_x_eq_1,Days,AVG,Periods,60,maybe`, SENSORS).problems[0]).toMatchObject({ line: 2, field: 'calculate' });
  });

  it('lists every problem with its sheet line and sends nothing (no groups) while any exists', () => {
    const text = [
      HEADER,
      'no_such_sensor,napi,Days,AVG,Periods,60,3,x', // 2
      'acceleration_rms_x_eq_1,napi,Fortnight,AVG,Periods,60,3,x', // 3
      'acceleration_rms_x_eq_1,napi,Days,MEAN,Periods,60,3,x', // 4
      'acceleration_rms_x_eq_1,napi,Days,AVG,Weeks,60,3,x', // 5
      'acceleration_rms_x_eq_1,napi,Days,AVG,Periods,0,3,x', // 6
      'acceleration_rms_x_eq_1,napi,Days,AVG,Periods,6.5,3,x', // 7
      'acceleration_rms_x_eq_1,napi,Days,AVG,Periods,60,-1,x', // 8
      'shaft_rpm_mean_1,napi,Days,AVG,Periods,60,3,x', // 9 fine
      'shaft_rpm_mean_1,napi,Days,AVG,Periods,90,3,x', // 10 the same level twice
    ].join('\n');
    const result = parseAggregationSheet(text, SENSORS);

    expect(result.groups).toEqual([]);
    expect(result.problems.map((p) => [p.line, p.field])).toEqual([
      [2, 'sensorName'],
      [3, 'timeScale'],
      [4, 'aggregationFunction'],
      [5, 'scale'],
      [6, 'lookback'],
      [7, 'lookback'],
      [8, 'minIssueScore'],
      [10, 'sensorName'],
    ]);
    expect(result.problems.at(-1)!.message).toContain('line 9');
  });

  it('refuses a sheet with a missing required column, an empty sheet and a header without rows; unknown columns are reported', () => {
    expect(parseAggregationSheet('sensorName,timeScale,scale,lookback\nx,Days,Periods,1', SENSORS).problems[0]!.message).toContain('aggregationFunction');
    expect(parseAggregationSheet('   ', SENSORS).problems[0]!.message).toContain('empty');
    expect(parseAggregationSheet(HEADER, SENSORS).problems[0]!.message).toContain('no rows');
    const withExtra = parseAggregationSheet(`${HEADER},colour\nacceleration_rms_x_eq_1,napi,Days,AVG,Periods,60,3,x,red`, SENSORS);
    expect(withExtra.ignoredColumns).toEqual(['colour']);
    expect(withExtra.problems).toEqual([]);
  });

  it('describes a group in one line', () => {
    expect(describeGroup({ timeScale: 'Days', aggregationFunction: 'P95', scale: 'Periods', lookback: 60, minIssueScore: 3, minEvaluationPercent: 10, calculationEnabled: null, sensorIds: [1] })).toBe(
      '1 day · 95th percentile · lookback 60 Periods · min issue score 3 · min evaluation 10 %',
    );
  });
});

describe('buildAggregationExportCsv', () => {
  const policies = [
    { id: 10, sensorId: 1, sourceDataKey: 'Actual', timeScale: 'Native', aggregationFunction: 'Raw', scale: 'years', lookback: 100, minIssueScore: 5, enabled: true },
    { id: 11, sensorId: 1, sourceDataKey: 'Actual', timeScale: 'Days', aggregationFunction: 'AVG', scale: 'periods', lookback: 60, minIssueScore: 3, enabled: true, minEvaluationPercent: 25 },
    { id: 12, sensorId: 2, sourceDataKey: 'Actual', timeScale: 'Hours', aggregationFunction: 'MAX', scale: 'periods', lookback: 336, minIssueScore: 2, enabled: true },
    { id: 13, sensorId: 2, sourceDataKey: 'Actual', timeScale: 'Days', aggregationFunction: 'P95', scale: 'periods', lookback: 60, minIssueScore: 3, enabled: false }, // disabled: not exported
    { id: 14, sensorId: 99, sourceDataKey: 'Actual', timeScale: 'Days', aggregationFunction: 'AVG', scale: 'periods', lookback: 1, minIssueScore: 1, enabled: true }, // no such Sensor
  ];

  it('exports the enabled aggregate levels only - not the raw level, not disabled ones - in the importer’s own columns', () => {
    const csv = buildAggregationExportCsv(policies, SENSORS);
    const lines = csv.replace('﻿', '').trim().split(/\r\n/);
    expect(lines).toEqual([
      'SensorName,Level,TimeScale,AggregationFunction,Scale,Lookback,MinIssueScore,MinEvaluation,Calculate',
      'acceleration_rms_x_eq_1,1 day,Days,AVG,Periods,60,3,25,true',
      'acceleration_rms_x_max_1,1 hour,Hours,MAX,Periods,336,2,10,true', // a level without a stored value is exported with the default
    ]);
  });

  it('the export of a Device imports back unchanged: same groups, nothing to fix', () => {
    const imported = parseAggregationSheet(buildAggregationExportCsv(policies, SENSORS), SENSORS);
    expect(imported.problems).toEqual([]);
    expect(imported.groups).toEqual([
      { timeScale: 'Days', aggregationFunction: 'AVG', scale: 'Periods', lookback: 60, minIssueScore: 3, minEvaluationPercent: 25, calculationEnabled: true, sensorIds: [1] },
      { timeScale: 'Hours', aggregationFunction: 'MAX', scale: 'Periods', lookback: 336, minIssueScore: 2, minEvaluationPercent: 10, calculationEnabled: true, sensorIds: [2] },
    ]);
    expect(aggregationExportFileName(4)).toBe('aggregation-device-4.csv');
  });
});

describe('buildAggregationTemplateCsv', () => {
  it('writes the header and example rows for the Device’s own Sensors, and importing the sample unchanged is valid', () => {
    const csv = buildAggregationTemplateCsv(SENSORS);
    const lines = csv.replace('﻿', '').trim().split(/\r\n/);
    expect(lines[0]).toBe('SensorName,Level,TimeScale,AggregationFunction,Scale,Lookback,MinIssueScore,MinEvaluation,Calculate');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('acceleration_rms_x_eq_1,daily average,Days,AVG,Periods,60,3,10,true');
    expect(lines[3]).toBe('acceleration_rms_x_max_1,hourly maximum (to look at only),Hours,MAX,Periods,336,2,10,false');

    const parsed = parseAggregationSheet(csv, SENSORS);
    expect(parsed.problems).toEqual([]);
    expect(parsed.groups.map((g) => g.aggregationFunction)).toEqual(['AVG', 'P95', 'MAX']);
  });

  it('a Device with a single Sensor, or none, still gives a sample (placeholders when there is no Sensor)', () => {
    expect(buildAggregationTemplateCsv([SENSORS[0]!]).split('\r\n')[3]).toContain('acceleration_rms_x_eq_1,hourly maximum');
    expect(buildAggregationTemplateCsv([]).split('\r\n')[1]).toContain('sensor_name_1,daily average');
    expect(aggregationTemplateFileName()).toBe('aggregation-template.csv');
  });
});
