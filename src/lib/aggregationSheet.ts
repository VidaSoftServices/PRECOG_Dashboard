import { SCALES, csvField, detectDelimiter, normalizeHeader, parseBoolean, splitDelimited } from '@/lib/sensorImport';
import { AGGREGATION_FUNCTION_OPTIONS, DEFAULT_MIN_EVALUATION_PERCENT, TIME_SCALE_OPTIONS } from '@/lib/aggregationOptions';
import { isRawPolicy } from '@/lib/policies';
import { deviceFilePart } from './deviceFileName';

/**
 * The aggregation sheet: one row per (Sensor, aggregation level), read and written as CSV, so the same level can be given to many Sensors
 * (also from a file somebody else prepared) and the levels a Device has can be exported, edited in Excel and imported again.
 *
 *   sensorName, level, timeScale, aggregationFunction, scale, lookback, minIssueScore, minEvaluation, calculate
 *
 * - `sensorName` is the Sensor's `externalSensorId` (the display name is accepted as a fallback; `externalSensorId`, `machineName`, `sensorId`
 *   and `tag` are header aliases).
 * - `level` (a free label such as "napi") and `why` (a remark) are ignored: they carry no setting. Any other unknown column is reported, so a
 *   typo does not silently drop a column.
 * - `minIssueScore` and `minEvaluation` are optional (the API defaults are 1 and 10); the rest is required on every row. `minEvaluation` is the
 *   minimum evaluation in percent (0-100): the open bucket of the level is evaluated for anomalies only once it covers that share of its length.
 * - `calculate` is optional (default true): the level's calculation switch. false = the level is only aggregated (buckets and charts, for looking at the data),
 *   never evaluated - no anomaly, no Issue. Accepts true/false, 1/0, yes/no, on/off, igen/nem (aliases: `calculation`, `calculationEnabled`).
 * - There is NO time zone column: the bucket boundaries always follow the Device's time zone (set on the Device). An old sheet that still has a
 *   `timeZone` / `tz` column is read and the column is ignored without a warning.
 * - Names are case-insensitive and tolerate spaces/underscores in the header; `,` `;` and tab are all read.
 * - The source is always the measured value (Actual): the sheet has no column for it, and target / tolerance are never aggregated.
 * - Rows with the same settings are grouped, so a sheet of 142 Sensors with three levels is three requests, not 426.
 * - Validation is all-or-nothing before the first request (like the Sensor import): every problem is listed with its sheet line.
 */
/** Written header names are UpperCamelCase like every import / export sheet of the dashboard; reading ignores case, so older sheets still import. */
export const AGGREGATION_SHEET_HEADERS = ['SensorName', 'Level', 'TimeScale', 'AggregationFunction', 'Scale', 'Lookback', 'MinIssueScore', 'MinEvaluation', 'Calculate'] as const;

export const MAX_AGGREGATION_SHEET_ROWS = 5000;

type Field = 'sensor' | 'timeScale' | 'aggregationFunction' | 'scale' | 'lookback' | 'minIssueScore' | 'minEvaluation' | 'calculate';

const ALIASES: Record<string, Field> = {
  sensorname: 'sensor',
  externalsensorid: 'sensor',
  sensorid: 'sensor',
  machinename: 'sensor',
  tag: 'sensor',
  tagname: 'sensor',
  sensor: 'sensor',
  timescale: 'timeScale',
  aggregationfunction: 'aggregationFunction',
  function: 'aggregationFunction',
  scale: 'scale',
  lookbackscale: 'scale',
  lookback: 'lookback',
  minissuescore: 'minIssueScore',
  minevaluation: 'minEvaluation',
  minevaluationpercent: 'minEvaluation',
  calculate: 'calculate',
  calculation: 'calculate',
  calculationenabled: 'calculate',
};

/** Columns that are read and thrown away on purpose - no warning (a label, a remark, and the time zone an older sheet still has: it is the Device's now). */
const QUIET_COLUMNS = new Set(['level', 'why', 'timezone', 'tz']);

export interface SheetSensor {
  id?: number | null;
  name?: string | null;
  externalSensorId?: string | null;
}

export interface SheetProblem {
  /** 1-based line of the sheet (the header is line 1); 0 for the file as a whole. */
  line: number;
  field: string;
  message: string;
}

/** The rows that share every setting: one bulk request. */
export interface AggregationGroup {
  timeScale: string;
  aggregationFunction: string;
  scale: string;
  lookback: number;
  /** null = not given, the API default applies. */
  minIssueScore: number | null;
  /** Minimum evaluation in percent (0-100); null = not given, the API default (10) applies. */
  minEvaluationPercent: number | null;
  /** The level's calculation switch; null = not given, the API default (true: evaluated) applies. */
  calculationEnabled: boolean | null;
  sensorIds: number[];
}

export interface AggregationSheetResult {
  groups: AggregationGroup[];
  problems: SheetProblem[];
  /** Header cells that matched no known column (ignoring `level` and `why`). */
  ignoredColumns: string[];
  rowCount: number;
  sensorCount: number;
}

const TIME_SCALE_VALUES = TIME_SCALE_OPTIONS.map((o) => o.value);
const FUNCTION_VALUES = AGGREGATION_FUNCTION_OPTIONS.map((o) => o.value);

const canon = (values: readonly string[], raw: string): string | null => values.find((v) => v.toLowerCase() === raw.trim().toLowerCase()) ?? null;

/** A whole number as typed; null for anything else (text, decimals, blanks). */
function wholeNumber(raw: string): number | null {
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

export function parseAggregationSheet(text: string, sensors: readonly SheetSensor[]): AggregationSheetResult {
  const empty = (problems: SheetProblem[], ignoredColumns: string[] = []): AggregationSheetResult => ({ groups: [], problems, ignoredColumns, rowCount: 0, sensorCount: 0 });
  const clean = text.split(String.fromCharCode(0xfeff)).join('').trim();
  if (clean === '') return empty([{ line: 0, field: 'file', message: 'The sheet is empty.' }]);

  const delimiter = detectDelimiter(clean.split(/\r?\n/, 1)[0] ?? '');
  const table = splitDelimited(clean, delimiter).filter((r) => r.some((c) => c.trim() !== ''));
  const header = table.shift() ?? [];

  const columns = new Map<Field, number>();
  const ignored: string[] = [];
  header.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    const field = ALIASES[key];
    if (field && !columns.has(field)) columns.set(field, index);
    else if (!QUIET_COLUMNS.has(key) && key !== '') ignored.push(cell.trim());
  });

  const missing = (['sensor', 'timeScale', 'aggregationFunction', 'scale', 'lookback'] as const).filter((f) => !columns.has(f));
  if (missing.length > 0) {
    const names: Record<Field, string> = { sensor: 'sensorName', timeScale: 'timeScale', aggregationFunction: 'aggregationFunction', scale: 'scale', lookback: 'lookback', minIssueScore: 'minIssueScore', minEvaluation: 'minEvaluation', calculate: 'calculate' };
    return empty([{ line: 1, field: 'header', message: `Required column(s) missing: ${missing.map((m) => names[m]).join(', ')}.` }], ignored);
  }
  if (table.length === 0) return empty([{ line: 0, field: 'file', message: 'The sheet has a header but no rows.' }], ignored);
  if (table.length > MAX_AGGREGATION_SHEET_ROWS) {
    return empty([{ line: 0, field: 'file', message: `The sheet has ${table.length} rows; the limit is ${MAX_AGGREGATION_SHEET_ROWS} per import.` }], ignored);
  }

  const byExternal = new Map<string, SheetSensor>();
  const byName = new Map<string, SheetSensor>();
  for (const s of sensors) {
    if (s.externalSensorId) byExternal.set(s.externalSensorId.trim().toLowerCase(), s);
    if (s.name) byName.set(s.name.trim().toLowerCase(), s);
  }

  const problems: SheetProblem[] = [];
  const seen = new Map<string, number>(); // sensor|timeScale|function -> first line
  const groups = new Map<string, AggregationGroup>();
  const sensorIds = new Set<number>();

  table.forEach((cells, rowIndex) => {
    const line = rowIndex + 2;
    const cell = (f: Field) => (cells[columns.get(f) ?? -1] ?? '').trim();
    const fail = (field: string, message: string) => problems.push({ line, field, message });

    const sensorText = cell('sensor');
    const sensor = byExternal.get(sensorText.toLowerCase()) ?? byName.get(sensorText.toLowerCase());
    if (sensorText === '') fail('sensorName', 'The Sensor name is missing.');
    else if (!sensor || sensor.id == null) fail('sensorName', `No Sensor "${sensorText}" on this Device.`);

    const timeScale = canon(TIME_SCALE_VALUES, cell('timeScale'));
    if (!timeScale) fail('timeScale', `"${cell('timeScale')}" is not a time scale; use one of ${TIME_SCALE_VALUES.join(', ')}.`);
    const fn = canon(FUNCTION_VALUES, cell('aggregationFunction'));
    if (!fn) fail('aggregationFunction', `"${cell('aggregationFunction')}" is not an aggregation function; use one of ${FUNCTION_VALUES.join(', ')}.`);
    const scale = canon(SCALES, cell('scale'));
    if (!scale) fail('scale', `"${cell('scale')}" is not a scale; use one of ${SCALES.join(', ')}.`);
    const lookback = wholeNumber(cell('lookback'));
    if (lookback === null || lookback < 1) fail('lookback', `"${cell('lookback')}" is not a whole number greater than zero.`);

    let minIssueScore: number | null = null;
    if (cell('minIssueScore') !== '') {
      minIssueScore = wholeNumber(cell('minIssueScore'));
      if (minIssueScore === null) fail('minIssueScore', `"${cell('minIssueScore')}" is not a whole number of zero or more.`);
    }
    let minEvaluationPercent: number | null = null;
    if (cell('minEvaluation') !== '') {
      minEvaluationPercent = wholeNumber(cell('minEvaluation'));
      if (minEvaluationPercent === null || minEvaluationPercent > 100) {
        fail('minEvaluation', `"${cell('minEvaluation')}" is not a whole number from 0 to 100 (percent).`);
        minEvaluationPercent = null;
      }
    }

    let calculationEnabled: boolean | null = null;
    if (cell('calculate') !== '') {
      calculationEnabled = parseBoolean(cell('calculate'));
      if (calculationEnabled === null) fail('calculate', `"${cell('calculate')}" must be true or false (also 1/0, yes/no, on/off, igen/nem).`);
    }

    if (!sensor || sensor.id == null || !timeScale || !fn || !scale || lookback === null || lookback < 1) return;
    if (cell('calculate') !== '' && calculationEnabled === null) return;
    if (minIssueScore === null && cell('minIssueScore') !== '') return;
    if (cell('minEvaluation') !== '' && minEvaluationPercent === null) return;

    const identity = `${sensor.id}|${timeScale}|${fn}`;
    const first = seen.get(identity);
    if (first !== undefined) {
      fail('sensorName', `${sensorText} already has ${timeScale} / ${fn} on line ${first}: one level can be given to a Sensor once.`);
      return;
    }
    seen.set(identity, line);

    const key = [timeScale, fn, scale, lookback, minIssueScore ?? '', minEvaluationPercent ?? '', calculationEnabled ?? ''].join('|');
    let group = groups.get(key);
    if (!group) {
      group = { timeScale, aggregationFunction: fn, scale, lookback, minIssueScore, minEvaluationPercent, calculationEnabled, sensorIds: [] };
      groups.set(key, group);
    }
    group.sensorIds.push(sensor.id);
    sensorIds.add(sensor.id);
  });

  return {
    groups: problems.length > 0 ? [] : [...groups.values()],
    problems,
    ignoredColumns: ignored,
    rowCount: table.length,
    sensorCount: sensorIds.size,
  };
}

/** What the sheet row and a group say in one line. */
export function describeGroup(group: AggregationGroup): string {
  const scale = TIME_SCALE_OPTIONS.find((o) => o.value === group.timeScale)?.label ?? group.timeScale;
  const fn = AGGREGATION_FUNCTION_OPTIONS.find((o) => o.value === group.aggregationFunction)?.label ?? group.aggregationFunction;
  return `${scale} · ${fn} · lookback ${group.lookback} ${group.scale}${group.minIssueScore !== null ? ` · min issue score ${group.minIssueScore}` : ''}${group.minEvaluationPercent !== null ? ` · min evaluation ${group.minEvaluationPercent} %` : ''}${group.calculationEnabled === false ? ' · calculation off' : ''}`;
}

export interface ExportAggregationPolicy {
  id?: number | null;
  sensorId?: number | null;
  sourceDataKey?: string | null;
  timeScale?: string | null;
  aggregationFunction?: string | null;
  scale?: string | null;
  lookback?: number | null;
  minIssueScore?: number | null;
  enabled?: boolean | null;
  minEvaluationPercent?: number | null;
  calculationEnabled?: boolean | null;
}

const BOM = String.fromCharCode(0xfeff);

/**
 * The levels a Device has right now, as a sheet this importer reads back unchanged: every ENABLED aggregate level (not the raw/base level, not a
 * disabled one - re-importing a disabled level would switch it on) of the measured values, one row per Sensor and level. `level` is the time
 * scale's plain label. Importing the export of a Device changes nothing (every level already exists).
 */
export function buildAggregationExportCsv(policies: readonly ExportAggregationPolicy[], sensors: readonly SheetSensor[]): string {
  const byId = new Map(sensors.filter((s) => s.id != null).map((s) => [s.id as number, s]));
  const rows = policies
    .filter((p) => p.enabled !== false && !isRawPolicy(p) && (p.sourceDataKey ?? 'Actual').toLowerCase() === 'actual' && p.sensorId != null && byId.has(p.sensorId))
    .sort((a, b) => (a.sensorId! - b.sensorId!) || ((a.id ?? 0) - (b.id ?? 0)));
  const lines = rows.map((p) => {
    const sensor = byId.get(p.sensorId!)!;
    const timeScale = canon(TIME_SCALE_VALUES, p.timeScale ?? '') ?? p.timeScale ?? '';
    const label = TIME_SCALE_OPTIONS.find((o) => o.value === timeScale)?.label ?? timeScale;
    return [
      sensor.externalSensorId ?? sensor.name ?? '',
      label,
      timeScale,
      canon(FUNCTION_VALUES, p.aggregationFunction ?? '') ?? p.aggregationFunction ?? '',
      canon(SCALES, p.scale ?? '') ?? p.scale ?? '',
      p.lookback ?? '',
      p.minIssueScore ?? '',
      p.minEvaluationPercent ?? DEFAULT_MIN_EVALUATION_PERCENT,
      p.calculationEnabled === false ? 'false' : 'true',
    ]
      .map((v) => csvField(v))
      .join(',');
  });
  return BOM + [AGGREGATION_SHEET_HEADERS.join(','), ...lines].join('\r\n') + '\r\n';
}

/** The file name of the export: the Device's number and its Device ID (externalDeviceId), e.g. "aggregation-device-2-KS4.csv". */
export function aggregationExportFileName(deviceId: number, externalDeviceId?: string | null): string {
  return `aggregation-${deviceFilePart(deviceId, externalDeviceId)}.csv`;
}

/**
 * The sample a person downloads to fill in: the sheet's header and a few example rows - the levels the prepared sheets use (daily average, daily
 * 95th percentile, hourly maximum) - written for the Device's own first Sensors, so every row is valid as it stands and importing the sample unchanged
 * creates exactly those levels. A Device without Sensors gets placeholder names. The `level` column is a free label and `why` is not part of the sample.
 */
export function buildAggregationTemplateCsv(sensors: readonly SheetSensor[]): string {
  const named = sensors.filter((s) => s.externalSensorId || s.name);
  const name = (index: number) => named[index]?.externalSensorId ?? named[index]?.name ?? `sensor_name_${index + 1}`;
  const examples: (string | number)[][] = [
    [name(0), 'daily average', 'Days', 'AVG', 'Periods', 60, 3, 10, 'true'],
    [name(0), 'daily 95th percentile', 'Days', 'P95', 'Periods', 60, 3, 10, 'true'],
    [name(named.length > 1 ? 1 : 0), 'hourly maximum (to look at only)', 'Hours', 'MAX', 'Periods', 336, 2, 10, 'false'],
  ];
  return BOM + [AGGREGATION_SHEET_HEADERS.join(','), ...examples.map((row) => row.map((v) => csvField(v)).join(','))].join('\r\n') + '\r\n';
}

export function aggregationTemplateFileName(): string {
  return 'aggregation-template.csv';
}

/** The header of a deletion sheet (the levels to delete permanently); any aggregation sheet works too - only these three columns are read. */
export const AGGREGATION_DELETION_SHEET_HEADERS = ['SensorName', 'Level', 'TimeScale', 'AggregationFunction'] as const;

export interface AggregationDeletionSheetResult {
  /** One per row, in sheet order: the level to delete. */
  levels: { sensorId: number; timeScale: string; aggregationFunction: string }[];
  problems: SheetProblem[];
  rowCount: number;
}

/**
 * A sheet of aggregation levels to DELETE permanently: one row per (Sensor, level) - `SensorName`, `TimeScale`, `AggregationFunction` (case-insensitive
 * headers, the same aliases as the aggregation sheet; every other column, e.g. `Level`, `Scale`, `Calculate`, is ignored, so a normal aggregation sheet or an
 * export can be used as it is). The raw level ("Native" / "Raw") is not accepted. Validation is all-or-nothing, like the import; a level listed twice is a
 * problem. Whether the level exists is decided by the API's preview.
 */
export function parseAggregationDeletionSheet(text: string, sensors: readonly SheetSensor[]): AggregationDeletionSheetResult {
  const clean = text.split(String.fromCharCode(0xfeff)).join('').trim();
  if (clean === '') return { levels: [], problems: [{ line: 0, field: 'file', message: 'The sheet is empty.' }], rowCount: 0 };
  const delimiter = detectDelimiter(clean.split(/\r?\n/, 1)[0] ?? '');
  const table = splitDelimited(clean, delimiter).filter((r) => r.some((c) => c.trim() !== ''));
  const header = table.shift() ?? [];
  const columns = new Map<Field, number>();
  header.forEach((cell, index) => {
    const field = ALIASES[normalizeHeader(cell)];
    if (field && !columns.has(field)) columns.set(field, index);
  });
  const missing = (['sensor', 'timeScale', 'aggregationFunction'] as const).filter((f) => !columns.has(f));
  if (missing.length > 0) {
    const names = { sensor: 'SensorName', timeScale: 'TimeScale', aggregationFunction: 'AggregationFunction' };
    return { levels: [], problems: [{ line: 1, field: 'header', message: `Required column(s) missing: ${missing.map((m) => names[m]).join(', ')}.` }], rowCount: 0 };
  }
  if (table.length === 0) return { levels: [], problems: [{ line: 0, field: 'file', message: 'The sheet has a header but no rows.' }], rowCount: 0 };
  if (table.length > MAX_AGGREGATION_SHEET_ROWS) {
    return { levels: [], problems: [{ line: 0, field: 'file', message: `The sheet has ${table.length} rows; the limit is ${MAX_AGGREGATION_SHEET_ROWS} per run.` }], rowCount: table.length };
  }
  const byExternal = new Map<string, SheetSensor>();
  const byName = new Map<string, SheetSensor>();
  for (const s of sensors) {
    if (s.externalSensorId) byExternal.set(s.externalSensorId.trim().toLowerCase(), s);
    if (s.name) byName.set(s.name.trim().toLowerCase(), s);
  }
  const problems: SheetProblem[] = [];
  const levels: AggregationDeletionSheetResult['levels'] = [];
  const seen = new Map<string, number>();
  table.forEach((cells, rowIndex) => {
    const line = rowIndex + 2;
    const cell = (f: Field) => (cells[columns.get(f) ?? -1] ?? '').trim();
    const fail = (field: string, message: string) => problems.push({ line, field, message });
    const sensorText = cell('sensor');
    const sensor = byExternal.get(sensorText.toLowerCase()) ?? byName.get(sensorText.toLowerCase());
    if (sensorText === '') fail('SensorName', 'The Sensor name is missing.');
    else if (!sensor || sensor.id == null) fail('SensorName', `No Sensor "${sensorText}" on this Device.`);
    const timeScale = canon(TIME_SCALE_VALUES, cell('timeScale'));
    if (!timeScale) fail('TimeScale', `"${cell('timeScale')}" is not an aggregation time scale (the raw level cannot be deleted).`);
    const fn = canon(FUNCTION_VALUES, cell('aggregationFunction'));
    if (!fn) fail('AggregationFunction', `"${cell('aggregationFunction')}" is not an aggregation function (the raw level cannot be deleted).`);
    if (!sensor || sensor.id == null || !timeScale || !fn) return;
    const key = `${sensor.id}|${timeScale}|${fn}`;
    const first = seen.get(key);
    if (first !== undefined) {
      fail('SensorName', `The same level is listed on line ${first} too.`);
      return;
    }
    seen.set(key, line);
    levels.push({ sensorId: sensor.id, timeScale, aggregationFunction: fn });
  });
  return { levels: problems.length > 0 ? [] : levels, problems, rowCount: table.length };
}
