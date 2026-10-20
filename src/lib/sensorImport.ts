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
 * are the same column). Only `externalSensorId` is mandatory in the file; every
 * other column may be left out, or left empty on a row, and then the dialog's
 * default applies.
 */

/** Byte-order mark Excel puts in front of a UTF-8 file (and needs in front of ours to pick the right encoding). */
const BOM = String.fromCharCode(0xfeff);

export const DIRECTIONS = ['lowerisbetter', 'higherisbetter', 'bidirectional'] as const;
export type SensorDirection = (typeof DIRECTIONS)[number];

/** Same set the API accepts for a raw policy's Scale (Enums.Scale without No_Change). */
export const SCALES = ['Days', 'Hours', 'Minutes', 'Seconds', 'Milliseconds', 'Microseconds', 'Ticks', 'Months', 'Years', 'Periods'] as const;

/** Column order of the downloadable template and of the Sensor-ID map. */
export const TEMPLATE_COLUMNS = [
  'externalSensorId',
  'name',
  'direction',
  'quantityKind',
  'unitCode',
  'rawScale',
  'rawLookback',
  'rawMinIssueScore',
  'processingEnabled',
] as const;
type Column = (typeof TEMPLATE_COLUMNS)[number];

/** Maximum lengths enforced by the API's columns - checked here so a bad row is flagged before 160 requests are sent. */
const MAX_LENGTH: Partial<Record<Column, number>> = { externalSensorId: 100, name: 200, quantityKind: 100, unitCode: 20 };

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

export interface ParsedSensorRow {
  /** 1-based line number in the pasted text, header included - what the user sees in Excel. */
  line: number;
  externalSensorId: string;
  name: string;
  direction: SensorDirection;
  quantityKind: string;
  unitCode: string;
  rawScale: string;
  rawLookback: number;
  rawMinIssueScore: number;
  /** False: the data is stored and trained on, but its arrival triggers no calculation. */
  processingEnabled: boolean;
  errors: string[];
}

export interface ParseResult {
  rows: ParsedSensorRow[];
  /** Problems with the sheet as a whole (no header, no rows, too many rows, unknown columns...). */
  fileErrors: string[];
  /** Header cells that matched no known column - ignored, but reported so a typo does not silently drop a column. */
  ignoredColumns: string[];
}

function normalizeHeader(value: string): string {
  return value.split(BOM).join('').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

const COLUMN_ALIASES: Record<string, Column> = {
  externalsensorid: 'externalSensorId',
  sensorid: 'externalSensorId',
  externalid: 'externalSensorId',
  tag: 'externalSensorId',
  tagname: 'externalSensorId',
  name: 'name',
  displayname: 'name',
  direction: 'direction',
  quantitykind: 'quantityKind',
  quantity: 'quantityKind',
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
};

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

const TRUE_WORDS = ['true', '1', 'yes', 'y', 'on', 'igen', 'be', 'x'];
const FALSE_WORDS = ['false', '0', 'no', 'n', 'off', 'nem', 'ki'];

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

export function parseSensorTable(text: string, defaults: ImportDefaults): ParseResult {
  const fileErrors: string[] = [];
  const trimmed = text.startsWith(BOM) ? text.slice(1) : text;
  if (trimmed.trim() === '') return { rows: [], fileErrors: [], ignoredColumns: [] };

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
    fileErrors.push('The first row must be a header that contains an "externalSensorId" column.');
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
    const errors: string[] = [];

    const externalSensorId = cell(cells, 'externalSensorId');
    if (externalSensorId === '') errors.push('externalSensorId is empty.');
    const firstSeen = seen.get(externalSensorId.toLowerCase());
    if (externalSensorId !== '') {
      if (firstSeen !== undefined) errors.push(`externalSensorId "${externalSensorId}" is repeated (first on line ${firstSeen}).`);
      else seen.set(externalSensorId.toLowerCase(), line);
    }

    const directionRaw = cell(cells, 'direction') || defaults.direction;
    const direction = parseDirection(directionRaw);
    if (!direction) errors.push(`direction "${directionRaw}" must be lowerisbetter, higherisbetter or bidirectional.`);

    const scaleRaw = cell(cells, 'rawScale') || defaults.rawScale;
    const rawScale = parseScale(scaleRaw);
    if (!rawScale) errors.push(scaleRaw === '' ? 'rawScale is missing (set a default or fill the column).' : `rawScale "${scaleRaw}" must be one of ${SCALES.join(', ')}.`);

    const lookbackRaw = cell(cells, 'rawLookback') || defaults.rawLookback;
    const rawLookback = Number(lookbackRaw);
    if (lookbackRaw === '' || !Number.isInteger(rawLookback) || rawLookback <= 0) {
      errors.push(lookbackRaw === '' ? 'rawLookback is missing (set a default or fill the column).' : `rawLookback "${lookbackRaw}" must be a whole number greater than zero.`);
    }

    const minScoreRaw = cell(cells, 'rawMinIssueScore') || defaults.rawMinIssueScore;
    const rawMinIssueScore = minScoreRaw === '' ? 1 : Number(minScoreRaw);
    if (!Number.isInteger(rawMinIssueScore) || rawMinIssueScore < 0 || rawMinIssueScore > 32767) {
      errors.push(`rawMinIssueScore "${minScoreRaw}" must be a whole number from 0 to 32767.`);
    }

    const processingRaw = cell(cells, 'processingEnabled');
    const processingParsed = processingRaw === '' ? defaults.processingEnabled : parseBoolean(processingRaw);
    if (processingParsed === null) errors.push(`processingEnabled "${processingRaw}" must be true or false (also 1/0, yes/no, on/off, igen/nem).`);

    const name = cell(cells, 'name');
    const quantityKind = cell(cells, 'quantityKind');
    const unitCode = cell(cells, 'unitCode');
    for (const [column, value] of [['externalSensorId', externalSensorId], ['name', name], ['quantityKind', quantityKind], ['unitCode', unitCode]] as const) {
      const max = MAX_LENGTH[column];
      if (max !== undefined && value.length > max) errors.push(`${column} is longer than ${max} characters.`);
    }

    return {
      line,
      externalSensorId,
      name,
      direction: direction ?? defaults.direction,
      quantityKind,
      unitCode,
      rawScale: rawScale ?? '',
      rawLookback: Number.isFinite(rawLookback) ? rawLookback : 0,
      rawMinIssueScore: Number.isFinite(rawMinIssueScore) ? rawMinIssueScore : 1,
      processingEnabled: processingParsed ?? defaults.processingEnabled,
      errors,
    };
  });

  return { rows, fileErrors, ignoredColumns };
}

/** Quotes a CSV field when it contains the delimiter, a quote or a newline. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The template the user downloads. Comma-separated with a UTF-8 BOM so Excel
 * opens it with the right encoding; the importer reads `;` and tab as well, so
 * a file re-saved by a Hungarian Excel still works.
 */
export function buildTemplateCsv(): string {
  const examples: (string | number)[][] = [
    ['temperature_1', 'Motor temperature', 'lowerisbetter', 'temperature', 'Cel', 'Seconds', 60, 1, 'true'],
    ['vibration_rms_x_1', 'Vibration RMS X', 'lowerisbetter', 'vibration', 'mm/s', 'Seconds', 60, 1, 'true'],
    ['shaft_speed_1', 'Shaft speed (stored and trained on, no calculation)', 'bidirectional', 'rotational speed', '/min', 'Minutes', 10, 1, 'false'],
  ];
  return BOM + [TEMPLATE_COLUMNS.join(','), ...examples.map((r) => r.map(csvField).join(','))].join('\r\n') + '\r\n';
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
