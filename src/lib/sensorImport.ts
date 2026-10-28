/**
 * Pure logic behind "Import Sensors": parse a pasted Excel range or a CSV/TSV
 * file into Sensor rows, apply the dialog's defaults, validate every row
 * against the same rules the API enforces, and build the template / the
 * Sensor-ID map files. No React and no I/O here, so all of it is unit-tested.
 *
 * Accepted input (first line is a header row):
 *   - a range copied from Excel (tab separated) - paste it as is;
 *   - a .csv saved by Excel. Hungarian/European Excel writes `;`, the
 *     international one writes `,` - the delimiter is detected, never asked.
 * Column names are case-insensitive and may use spaces, underscores or
 * dashes (`External Sensor ID`, `externalSensorId` and `external_sensor_id`
 * are the same column; the template calls it `sensorName`). Only that column is mandatory in the file; every
 * other column may be left out, or left empty on a row, and then the dialog's
 * default applies.
 *
 * Optional setpoint columns (`target`, `tolerance`; bidirectional: `targetAbove`, `targetBelow`, `toleranceAbove`,
 * `toleranceBelow`) are validated here and recorded by the import as the new Sensor's first Setpoint, effective from
 * the moment of the import.
 *
 * The unit of a known metric (`unitCode`) is validated against the catalog the API publishes (GET /api/SensorMetadata,
 * passed in as `ImportCatalog`) - this file contains no mapping from a metric name to a unit of its own, and never
 * corrects or guesses a value. (The sheet has no aggregation columns: long-term aggregation is set up per Sensor on its
 * Policies page.)
 */

/** Byte-order mark Excel puts in front of a UTF-8 file (and needs in front of ours to pick the right encoding). */
const BOM = String.fromCharCode(0xfeff);

export const DIRECTIONS = ['lowerisbetter', 'higherisbetter', 'bidirectional'] as const;
export type SensorDirection = (typeof DIRECTIONS)[number];

/** Same set the API accepts for a raw policy's Scale (Enums.Scale without No_Change). */
export const SCALES = ['Days', 'Hours', 'Minutes', 'Seconds', 'Milliseconds', 'Microseconds', 'Ticks', 'Months', 'Years', 'Periods'] as const;

/** The columns the importer understands (internal names; see COLUMN_ALIASES for the accepted header spellings). */
export const TEMPLATE_COLUMNS = [
  'externalSensorId',
  'name',
  'direction',
  'sensorType',
  'unitCode',
  'rawScale',
  'rawLookback',
  'rawMinIssueScore',
  'processingEnabled',
  'target',
  'tolerance',
  'targetAbove',
  'targetBelow',
  'toleranceAbove',
  'toleranceBelow',
] as const;
type Column = (typeof TEMPLATE_COLUMNS)[number];

/** The setpoint columns: the Sensor's target/tolerance, recorded as its first Setpoint at the moment of the import. */
export const SETPOINT_COLUMNS = ['target', 'tolerance', 'targetAbove', 'targetBelow', 'toleranceAbove', 'toleranceBelow'] as const;
export type SetpointColumn = (typeof SETPOINT_COLUMNS)[number];
/** Target/tolerance values of one row; only the fields the sheet filled are present. */
export type SetpointValues = Partial<Record<SetpointColumn, number>>;

/** Header row of the downloadable template. (`Calculate` is the Sensor's processingEnabled switch; A header may end in "(optional)" - `target (optional)` is the `target` column. The `sensorName` column holds the Sensor's externalSensorId, `displayName` its name; `externalSensorId`, `machineName`, `name` and the former `quantityKind` / `quantity` headers are accepted as aliases.) */
export const TEMPLATE_HEADERS = [
  'sensorName',
  'displayName',
  'direction',
  'sensorType',
  'unitCode',
  'rawScale',
  'rawLookback',
  'rawMinIssueScore',
  'Calculate',
  'target (optional)',
  'tolerance (optional)',
  'targetAbove (optional)',
  'targetBelow (optional)',
  'toleranceAbove (optional)',
  'toleranceBelow (optional)',
] as const;

/**
 * The part of the API's unit catalog the importer needs (see `useSensorMetadata`). Everything the import knows about
 * units and the known metrics comes from here.
 */
export interface ImportCatalog {
  units: { code: string; label: string; labelHu?: string }[];
  metrics: { machineName: string; displayName: string; unitCode: string }[];
}

/** One problem in one cell: which field, the offending value, and what is expected. */
export interface ImportIssue {
  field: string;
  value: string;
  message: string;
}

/** Narrows the API response (all fields optional in the generated type) to what the importer needs; undefined while it is incomplete. */
type Opt<T> = T | null | undefined;

export function toImportCatalog(api: Opt<{
  units?: Opt<{ code?: Opt<string>; label?: Opt<string>; labelHu?: Opt<string> }[]>;
  metrics?: Opt<{ machineName?: Opt<string>; displayName?: Opt<string>; unitCode?: Opt<string> }[]>;
}>): ImportCatalog | undefined {
  if (!api?.units || !api.metrics) return undefined;
  return {
    units: api.units.flatMap((u) => (u.code ? [{ code: u.code, label: u.label ?? u.code, ...(u.labelHu ? { labelHu: u.labelHu } : {}) }] : [])),
    metrics: api.metrics.flatMap((m) =>
      m.machineName && m.unitCode ? [{ machineName: m.machineName, displayName: m.displayName ?? m.machineName, unitCode: m.unitCode }] : [],
    ),
  };
}

/**
 * The known metric an externalSensorId names: an EXACT machine name from the catalog followed by `_{point}` (a positive
 * whole number). No prefix, case-insensitive or fuzzy matching.
 */
export function findKnownMetric(catalog: ImportCatalog, externalSensorId: string) {
  const match = /^(.+)_([1-9][0-9]*)$/.exec(externalSensorId);
  return match ? catalog.metrics.find((m) => m.machineName === match[1]) : undefined;
}

/**
 * Validates the unit of one row: only a Sensor that IS a known metric (exact machine name + point number) is judged - it
 * must carry exactly that metric's unit, a canonical code from the catalog. Any other Sensor keeps a free-text unit
 * untouched. The same rule the API enforces (so a bad sheet is caught before the first request). Reports, never corrects.
 */
export function validateMetadata(externalSensorId: string, unitCode: string, catalog: ImportCatalog): ImportIssue[] {
  const known = externalSensorId ? findKnownMetric(catalog, externalSensorId) : undefined;
  if (!known) return [];

  const issues: ImportIssue[] = [];
  const unitCodes = catalog.units.map((u) => u.code).join(', ');
  const unit = catalog.units.find((u) => u.code === unitCode);

  if (unitCode === '') issues.push({ field: 'unitCode', value: '', message: `unitCode is required. Expected one of: ${unitCodes}.` });
  else if (!unit) issues.push({ field: 'unitCode', value: unitCode, message: `Unknown unitCode. Expected one of: ${unitCodes}.` });
  else if (unitCode !== known.unitCode) {
    issues.push({ field: 'unitCode', value: unitCode, message: `'${externalSensorId}' is the known metric '${known.machineName}', whose unitCode is '${known.unitCode}'.` });
  }
  return issues;
}

/** Maximum lengths enforced by the API's columns - checked here so a bad row is flagged before 160 requests are sent. */
/** The header the user sees in the template for a column whose internal (API) name differs. */
const COLUMN_LABEL: Partial<Record<Column, string>> = { externalSensorId: 'sensorName', name: 'displayName' };

export const MAX_LENGTH: Partial<Record<Column, number>> = { externalSensorId: 100, name: 200, sensorType: 100, unitCode: 20 };

/** Hard cap on one import, so a mistakenly pasted sheet cannot fire thousands of requests. */
export const MAX_IMPORT_ROWS = 1000;

export interface ImportDefaults {
  direction: SensorDirection;
  rawScale: string;
  rawLookback: string;
  rawMinIssueScore: string;
  /** Default for the per-Sensor calculation switch when the sheet has no such column / an empty cell. */
  processingEnabled: boolean;
}

/** Which cells of a row were actually filled. For a Sensor that already exists only these are applied; an empty cell never overwrites. */
export interface ProvidedFields {
  name: boolean;
  direction: boolean;
  sensorType: boolean;
  unitCode: boolean;
  rawScale: boolean;
  rawLookback: boolean;
  rawMinIssueScore: boolean;
  processingEnabled: boolean;
}

/** What the parser needs to know about a Sensor that already exists on the Device (key: its externalSensorId, lower-case). */
export interface ExistingSensorInfo {
  direction: SensorDirection;
}

export interface ParsedSensorRow {
  /** 1-based line number in the pasted text, header included - what the user sees in Excel. */
  line: number;
  /** True when a Sensor with this sensorName already exists on the Device: the row UPDATES it (only the filled cells) instead of creating one. */
  exists: boolean;
  /** Which cells were filled (see {@link ProvidedFields}). */
  provided: ProvidedFields;
  externalSensorId: string;
  name: string;
  direction: SensorDirection;
  sensorType: string;
  unitCode: string;
  /** The catalog's own machine name when this row names a known metric (for example one of the catalog's `_eq` RMS metrics), otherwise undefined. */
  knownMetric?: string;
  rawScale: string;
  rawLookback: number;
  rawMinIssueScore: number;
  /** False: the data is stored and trained on, but its arrival triggers no calculation. */
  processingEnabled: boolean;
  /**
   * The row's target/tolerance, present only when the sheet filled at least one of them. The import records them as the
   * Sensor's first Setpoint, valid from the moment of the import; without one the Sensor's data is stored but not analysed.
   */
  setpoint?: SetpointValues;
  /** One entry per problem, each naming the field and the offending value (the row is `line`). */
  issues: ImportIssue[];
  /** The issues' messages, for simple display. */
  errors: string[];
}

export interface ParseResult {
  rows: ParsedSensorRow[];
  /** Problems with the sheet as a whole (no header, no rows, too many rows, unknown columns...). */
  fileErrors: string[];
  /** Header cells that matched no known column - ignored, but reported so a typo does not silently drop a column. */
  ignoredColumns: string[];
}

export function normalizeHeader(value: string): string {
  return value.split(BOM).join('').trim().toLowerCase().replace(/\(optional\)/g, '').replace(/[\s_-]+/g, '');
}

const COLUMN_ALIASES: Record<string, Column> = {
  externalsensorid: 'externalSensorId',
  sensorid: 'externalSensorId',
  externalid: 'externalSensorId',
  tag: 'externalSensorId',
  tagname: 'externalSensorId',
  name: 'name',
  displayname: 'name',
  machinename: 'externalSensorId',
  sensorname: 'externalSensorId',
  direction: 'direction',
  sensortype: 'sensorType',
  quantitykind: 'sensorType',
  quantity: 'sensorType',
  unitcode: 'unitCode',
  unit: 'unitCode',
  rawscale: 'rawScale',
  scale: 'rawScale',
  rawlookback: 'rawLookback',
  lookback: 'rawLookback',
  rawminissuescore: 'rawMinIssueScore',
  minissuescore: 'rawMinIssueScore',
  processingenabled: 'processingEnabled',
  processing: 'processingEnabled',
  dataprocessing: 'processingEnabled',
  calculation: 'processingEnabled',
  calculate: 'processingEnabled',
  target: 'target',
  tolerance: 'tolerance',
  targetabove: 'targetAbove',
  targetbelow: 'targetBelow',
  toleranceabove: 'toleranceAbove',
  tolerancebelow: 'toleranceBelow',
};

/** A plain decimal number as an Excel user types it; a decimal comma ("0,5") is read as 0.5. null for anything else (text, "1e", blanks). */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(/^(-?\d+),(\d+)$/, '$1.$2');
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text) && Number.isFinite(Number(text)) ? Number(text) : null;
}

/**
 * Reads and validates the setpoint columns of one row against the Sensor's resolved direction, with the same rules the
 * API's calculation relies on: a one-sided Sensor (lowerisbetter/higherisbetter) uses target + tolerance, a bidirectional
 * one uses targetAbove/targetBelow + toleranceAbove/toleranceBelow; at least one target is needed; a tolerance is never
 * negative and needs the target it belongs to. Returns undefined when the row has no setpoint value at all.
 */
export function readSetpoint(
  cell: (column: SetpointColumn) => string,
  direction: SensorDirection | null,
  fail: (field: string, value: string, message: string) => void,
  /**
   * False for a Sensor that already exists: its current setpoint may already carry the target (a row with only a tolerance
   * then changes just the tolerance), which is only known when the import runs, so the "needs a target" rules are applied there.
   */
  requireTarget = true,
): SetpointValues | undefined {
  const values: SetpointValues = {};
  let anyFilled = false;
  for (const column of SETPOINT_COLUMNS) {
    const raw = cell(column);
    if (raw === '') continue;
    anyFilled = true;
    const value = parseDecimal(raw);
    if (value === null) fail(column, raw, `${column} "${raw}" must be a number.`);
    else if (column.startsWith('tolerance') && value < 0) fail(column, raw, `${column} "${raw}" must not be negative.`);
    else values[column] = value;
  }
  if (!anyFilled) return undefined;
  if (!direction) return values; // the direction itself is already reported

  const bidirectional = direction === 'bidirectional';
  const wrongSide: SetpointColumn[] = bidirectional ? ['target', 'tolerance'] : ['targetAbove', 'targetBelow', 'toleranceAbove', 'toleranceBelow'];
  for (const column of wrongSide) {
    if (cell(column) !== '') {
      fail(
        column,
        cell(column),
        bidirectional
          ? `${column} applies to lowerisbetter/higherisbetter Sensors; a bidirectional Sensor uses targetAbove/targetBelow and toleranceAbove/toleranceBelow.`
          : `${column} applies to bidirectional Sensors only; this Sensor is ${direction} and uses target and tolerance.`,
      );
      delete values[column];
    }
  }

  if (!requireTarget) return values;

  if (bidirectional) {
    if (values.targetAbove === undefined && values.targetBelow === undefined) fail('targetAbove', '', 'A bidirectional Sensor needs targetAbove and/or targetBelow when a setpoint is given.');
    if (values.toleranceAbove !== undefined && values.targetAbove === undefined) fail('toleranceAbove', cell('toleranceAbove'), 'toleranceAbove needs targetAbove.');
    if (values.toleranceBelow !== undefined && values.targetBelow === undefined) fail('toleranceBelow', cell('toleranceBelow'), 'toleranceBelow needs targetBelow.');
  } else {
    if (values.target === undefined) fail('target', '', `A ${direction} Sensor needs a target when a setpoint is given.`);
  }
  return values;
}

/** Picks `\t` when the header has one (an Excel paste), otherwise whichever of `;` / `,` is more frequent. */
export function detectDelimiter(headerLine: string): string {
  if (headerLine.includes('\t')) return '\t';
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

/** RFC-4180-style splitter: quoted fields, doubled quotes, delimiters and newlines inside quotes. */
export function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => c.trim() === '');
}

function parseDirection(raw: string): SensorDirection | null {
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return (DIRECTIONS as readonly string[]).includes(key) ? (key as SensorDirection) : null;
}

export const TRUE_WORDS = ['true', '1', 'yes', 'y', 'on', 'igen', 'be', 'x'];
export const FALSE_WORDS = ['false', '0', 'no', 'n', 'off', 'nem', 'ki'];

/** Accepts the words an Excel user would type (true/false, 1/0, yes/no, on/off, igen/nem); null for anything else. */
function parseBoolean(raw: string): boolean | null {
  const key = raw.trim().toLowerCase();
  if (TRUE_WORDS.includes(key)) return true;
  if (FALSE_WORDS.includes(key)) return false;
  return null;
}

function parseScale(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  return SCALES.find((s) => s.toLowerCase() === key) ?? null;
}

/**
 * Parses and validates the sheet. `existing` lists the Sensors already on the Device (key: externalSensorId, lower-case): a row
 * for one of them is an UPDATE - only the cells that are filled count (an empty cell leaves the current value alone, the dialog's
 * defaults apply to new Sensors only), so scale / lookback / unit are not required for it.
 */
export function parseSensorTable(
  text: string,
  defaults: ImportDefaults,
  catalog: ImportCatalog | undefined,
  existing: ReadonlyMap<string, ExistingSensorInfo> = new Map(),
): ParseResult {
  const fileErrors: string[] = [];
  const trimmed = text.startsWith(BOM) ? text.slice(1) : text;
  if (trimmed.trim() === '') return { rows: [], fileErrors: [], ignoredColumns: [] };

  // The unit / aggregation rules come from the API; without them nothing can be validated, so nothing is imported.
  if (!catalog) {
    return { rows: [], fileErrors: ['The unit and aggregation catalog has not been loaded from the API, so the sheet cannot be validated yet.'], ignoredColumns: [] };
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? '';
  const table = splitDelimited(trimmed, detectDelimiter(firstLine));
  const header = table[0] ?? [];

  const columnIndex = new Map<Column, number>();
  const ignoredColumns: string[] = [];
  header.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (key === '') return;
    const column = COLUMN_ALIASES[key];
    if (column && !columnIndex.has(column)) columnIndex.set(column, index);
    else ignoredColumns.push(cell.trim());
  });

  if (!columnIndex.has('externalSensorId')) {
    fileErrors.push('The first row must be a header that contains a "sensorName" column (the Sensor externalSensorId).');
    return { rows: [], fileErrors, ignoredColumns };
  }

  const dataRows = table.slice(1).map((cells, i) => ({ cells, line: i + 2 })).filter((r) => !isBlankRow(r.cells));
  if (dataRows.length === 0) fileErrors.push('There are no Sensor rows below the header.');
  if (dataRows.length > MAX_IMPORT_ROWS) {
    fileErrors.push(`At most ${MAX_IMPORT_ROWS} Sensors can be imported at once (found ${dataRows.length}). Split the sheet.`);
    return { rows: [], fileErrors, ignoredColumns };
  }

  const cell = (cells: string[], column: Column): string => {
    const index = columnIndex.get(column);
    return index === undefined ? '' : (cells[index] ?? '').trim();
  };

  const seen = new Map<string, number>();
  const rows: ParsedSensorRow[] = dataRows.map(({ cells, line }) => {
    const issues: ImportIssue[] = [];
    const fail = (field: string, value: string, message: string) => issues.push({ field, value, message });

    const externalSensorId = cell(cells, 'externalSensorId');
    if (externalSensorId === '') fail('externalSensorId', '', 'sensorName is empty.');
    const firstSeen = seen.get(externalSensorId.toLowerCase());
    if (externalSensorId !== '') {
      if (firstSeen !== undefined) fail('externalSensorId', externalSensorId, `sensorName "${externalSensorId}" is repeated (first on line ${firstSeen}).`);
      else seen.set(externalSensorId.toLowerCase(), line);
    }

    const current = externalSensorId === '' ? undefined : existing.get(externalSensorId.toLowerCase());
    const exists = current !== undefined;
    const provided: ProvidedFields = {
      name: cell(cells, 'name') !== '',
      direction: cell(cells, 'direction') !== '',
      sensorType: cell(cells, 'sensorType') !== '',
      unitCode: cell(cells, 'unitCode') !== '',
      rawScale: cell(cells, 'rawScale') !== '',
      rawLookback: cell(cells, 'rawLookback') !== '',
      rawMinIssueScore: cell(cells, 'rawMinIssueScore') !== '',
      processingEnabled: cell(cells, 'processingEnabled') !== '',
    };

    // A new Sensor takes the dialog's defaults for empty cells; an existing one keeps what it has (nothing is "defaulted" over it).
    const directionRaw = cell(cells, 'direction') || (exists ? '' : defaults.direction);
    const direction = directionRaw === '' ? (current?.direction ?? null) : parseDirection(directionRaw);
    if (!direction) fail('direction', directionRaw, `direction "${directionRaw}" must be lowerisbetter, higherisbetter or bidirectional.`);

    const scaleRaw = cell(cells, 'rawScale') || (exists ? '' : defaults.rawScale);
    const rawScale = parseScale(scaleRaw);
    if (!rawScale && !(exists && scaleRaw === '')) fail('rawScale', scaleRaw, scaleRaw === '' ? 'rawScale is missing (set a default or fill the column).' : `rawScale "${scaleRaw}" must be one of ${SCALES.join(', ')}.`);

    const lookbackRaw = cell(cells, 'rawLookback') || (exists ? '' : defaults.rawLookback);
    const rawLookback = Number(lookbackRaw);
    if (!(exists && lookbackRaw === '') && (lookbackRaw === '' || !Number.isInteger(rawLookback) || rawLookback <= 0)) {
      fail('rawLookback', lookbackRaw, lookbackRaw === '' ? 'rawLookback is missing (set a default or fill the column).' : `rawLookback "${lookbackRaw}" must be a whole number greater than zero.`);
    }

    const minScoreRaw = cell(cells, 'rawMinIssueScore') || (exists ? '' : defaults.rawMinIssueScore);
    const rawMinIssueScore = minScoreRaw === '' ? 1 : Number(minScoreRaw);
    if (!Number.isInteger(rawMinIssueScore) || rawMinIssueScore < 0 || rawMinIssueScore > 32767) {
      fail('rawMinIssueScore', minScoreRaw, `rawMinIssueScore "${minScoreRaw}" must be a whole number from 0 to 32767.`);
    }

    const processingRaw = cell(cells, 'processingEnabled');
    const processingParsed = processingRaw === '' ? defaults.processingEnabled : parseBoolean(processingRaw);
    if (processingParsed === null) fail('Calculate', processingRaw, `Calculate "${processingRaw}" must be true or false (also 1/0, yes/no, on/off, igen/nem).`);

    const setpoint = readSetpoint((column) => cell(cells, column), direction, fail, !exists);

    const name = cell(cells, 'name');
    const sensorType = cell(cells, 'sensorType');
    const unitCode = cell(cells, 'unitCode');
    for (const [column, value] of [['externalSensorId', externalSensorId], ['name', name], ['sensorType', sensorType], ['unitCode', unitCode]] as const) {
      const max = MAX_LENGTH[column];
      if (max !== undefined && value.length > max) fail(column, value, `${COLUMN_LABEL[column] ?? column} is longer than ${max} characters.`);
    }

    // The unit of a known metric is judged when it is given - and always for a new Sensor. An existing Sensor with an empty unit cell keeps its unit.
    if (!exists || provided.unitCode) issues.push(...validateMetadata(externalSensorId, unitCode, catalog));
    const known = externalSensorId ? findKnownMetric(catalog, externalSensorId) : undefined;

    return {
      line,
      exists,
      provided,
      externalSensorId,
      name,
      direction: direction ?? defaults.direction,
      sensorType,
      unitCode,
      knownMetric: known?.machineName,
      rawScale: rawScale ?? '',
      rawLookback: Number.isFinite(rawLookback) ? rawLookback : 0,
      rawMinIssueScore: Number.isFinite(rawMinIssueScore) ? rawMinIssueScore : 1,
      processingEnabled: processingParsed ?? defaults.processingEnabled,
      ...(setpoint ? { setpoint } : {}),
      issues,
      errors: issues.map((i) => i.message),
    };
  });

  return { rows, fileErrors, ignoredColumns };
}

/** Quotes a CSV field when it contains the delimiter, a quote or a newline. */
export function csvField(value: string | number): string {
  const s = String(value);
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The template the user downloads. Comma-separated with a UTF-8 BOM so Excel opens it with the right encoding; the
 * importer reads `;` and tab as well, so a file re-saved by a Hungarian Excel still works.
 *
 * The example rows are taken from the API catalog (known metrics, with their exact unit), so they are valid by
 * construction and the template can never teach a wrong mapping. Allowed values for `unitCode` are listed in the
 * import dialog, from the same catalog.
 */
export function buildTemplateCsv(catalog: ImportCatalog): string {
  // One example per distinct unit the catalog contains - the first metric of each - so the template shows every kind
  // without this file naming any metric.
  const seen = new Set<string>();
  const examples = catalog.metrics
    .filter((m) => {
      const kind = m.unitCode;
      if (seen.has(kind)) return false;
      seen.add(kind);
      return true;
    })
    .map((m) => [`${m.machineName}_1`, m.displayName, 'lowerisbetter', '', m.unitCode, 'Seconds', 60, 1, 'true', '', '', '', '', '', '']);
  return BOM + [TEMPLATE_HEADERS.join(','), ...examples.map((r) => r.map(csvField).join(','))].join('\r\n') + '\r\n';
}

export interface SensorIdMapEntry {
  externalSensorId: string;
  sensorId: number;
  name: string;
}

/** `externalSensorId,sensorId,name` - the numeric Device-scoped ids a Device's firmware needs, in id order. */
export function buildSensorIdMapCsv(entries: SensorIdMapEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.sensorId - b.sensorId);
  return BOM + ['externalSensorId,sensorId,name', ...sorted.map((e) => [e.externalSensorId, e.sensorId, e.name].map(csvField).join(','))].join('\r\n') + '\r\n';
}

export type SetpointMerge =
  | { kind: 'unchanged' }
  | { kind: 'change'; values: SetpointValues }
  | { kind: 'invalid'; message: string };

/**
 * What the import does with the setpoint cells of a row for a Sensor that already exists. `current` is the setpoint effective
 * now (undefined = none). Only the filled cells change: a row with just a tolerance keeps the current target, and the values
 * of the cells the sheet left empty are carried over so the new interval is complete. Nothing is written when every filled
 * value already equals the current one. Only the columns that belong to the Sensor's direction are considered.
 */
export function mergeSetpoint(
  current: Partial<Record<SetpointColumn, number | null | undefined>> | undefined,
  provided: SetpointValues,
  direction: SensorDirection,
): SetpointMerge {
  const bidirectional = direction === 'bidirectional';
  const relevant: SetpointColumn[] = bidirectional ? ['targetAbove', 'targetBelow', 'toleranceAbove', 'toleranceBelow'] : ['target', 'tolerance'];

  const merged: SetpointValues = {};
  let changed = false;
  for (const column of relevant) {
    const now = current?.[column] ?? undefined;
    const given = provided[column];
    const value = given ?? now;
    if (value !== undefined) merged[column] = value;
    if (given !== undefined && given !== now) changed = true;
  }

  if (bidirectional) {
    if (merged.targetAbove === undefined && merged.targetBelow === undefined) return { kind: 'invalid', message: 'The Sensor has no targetAbove/targetBelow yet - give at least one of them.' };
    if (merged.toleranceAbove !== undefined && merged.targetAbove === undefined) return { kind: 'invalid', message: 'toleranceAbove needs targetAbove, which the Sensor does not have yet.' };
    if (merged.toleranceBelow !== undefined && merged.targetBelow === undefined) return { kind: 'invalid', message: 'toleranceBelow needs targetBelow, which the Sensor does not have yet.' };
  } else if (merged.target === undefined) {
    return { kind: 'invalid', message: `The Sensor has no target yet - a ${direction} Sensor needs a target before a tolerance can be set.` };
  }

  return changed ? { kind: 'change', values: merged } : { kind: 'unchanged' };
}
